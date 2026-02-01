// Simple health check function
export async function healthCheck() {
  try {
    console.log('Running health check...');
    const { blobs } = await list();
    console.log('Blob list successful, found', blobs.length, 'blobs');
    return { status: 'ok', blobCount: blobs.length };
  } catch (err) {
    console.error('Health check failed:', err);
    return { status: 'error', error: err.message };
  }
}

export async function parseJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export async function parseFormBody(req) {
  const contentType = req.headers['content-type'] || '';
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const params = new URLSearchParams(raw);
    const result = {};
    for (const [key, value] of params) {
      result[key] = value;
    }
    return result;
  } else if (contentType.includes('multipart/form-data')) {
    // Simple multipart parser for form data
    const boundary = contentType.split('boundary=')[1];
    if (!boundary) return {};
    const parts = raw.split(`--${boundary}`);
    const result = {};
    for (const part of parts) {
      if (part.trim() && !part.includes('--')) {
        const lines = part.split('\r\n');
        const nameMatch = lines[1]?.match(/name="([^"]+)"/);
        if (nameMatch) {
          const name = nameMatch[1];
          const value = lines.slice(3).join('\r\n').trim();
          result[name] = value;
        }
      }
    }
    return result;
  }

  return {};
}

export function getCookies(req) {
  return parseCookie(req.headers.cookie || '');
}

export function setCookie(res, name, value, options = {}) {
  const serialized = serializeCookie(name, value, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    ...options
  });
  res.setHeader('Set-Cookie', serialized);
}

export function clearCookie(res, name) {
  const serialized = serializeCookie(name, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0
  });
  res.setHeader('Set-Cookie', serialized);
}

export function signToken(payload, secret) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    .toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const data = `${header}.${body}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('base64url');
  return `${data}.${signature}`;
}

export function verifyToken(token, secret) {
  if (!token) return null;
  const [header, body, signature] = token.split('.');
  if (!header || !body || !signature) return null;
  const data = `${header}.${body}`;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('base64url');
  if (expected !== signature) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

export function requireAdmin(req, res) {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) return false;
  const cookies = getCookies(req);
  const payload = verifyToken(cookies.admin_token, secret);
  if (!payload || !payload.exp || Date.now() > payload.exp) return false;
  return true;
}

const SUBMISSIONS_INDEX_KEY = 'submissions-index.json';

export async function loadSubmissions() {
  try {
    console.log('Loading submissions...');
    const { blobs } = await list();

    // First try the new index-based system
    const indexBlob = blobs.find((b) => b.pathname === SUBMISSIONS_INDEX_KEY);
    if (indexBlob) {
      console.log('Found index blob, using new system...');
      return await loadFromIndex(blobs, indexBlob);
    }

    // Fallback to old single-file system for backward compatibility
    console.log('No index found, checking for old submissions.json...');
    const oldBlob = blobs.find((b) => b.pathname === 'submissions.json');
    if (oldBlob) {
      console.log('Found old submissions.json, migrating...');
      const response = await fetch(oldBlob.downloadUrl || oldBlob.url);
      if (response.ok) {
        const submissions = await response.json();
        if (Array.isArray(submissions)) {
          console.log(`Migrating ${submissions.length} submissions from old system`);
          // Save using new system
          await saveSubmissions(submissions);
          return submissions;
        }
      }
    }

    console.log('No submissions found');
    return [];
  } catch (err) {
    console.error('Error in loadSubmissions:', err);
    return [];
  }
}

async function loadFromIndex(blobs, indexBlob) {
  try {
    const startTime = Date.now();
    const timeout = 8000; // 8 second timeout to stay under Vercel's 10s limit

    const indexResponse = await fetch(indexBlob.downloadUrl || indexBlob.url);
    if (!indexResponse.ok) {
      console.error('Failed to fetch submissions index:', indexResponse.status);
      return [];
    }

    const index = await indexResponse.json();
    console.log('Index data:', JSON.stringify(index, null, 2));

    let submissionIds = [];
    if (index && Array.isArray(index.submissionIds)) {
      submissionIds = index.submissionIds;
    } else if (Array.isArray(index)) {
      // Handle old format where index was just an array
      submissionIds = index;
    }

    console.log(`Loading ${submissionIds.length} submissions...`);

    if (submissionIds.length === 0) {
      return [];
    }

    // Load each submission with error handling and timeout protection
    const submissions = [];
    const maxLoad = Math.min(submissionIds.length, 20); // Limit for safety
    for (let i = 0; i < maxLoad; i++) {
      // Check timeout
      if (Date.now() - startTime > timeout) {
        console.log('Timeout approaching, stopping load at', submissions.length, 'submissions');
        break;
      }

      const submissionId = submissionIds[i];
      try {
        const submissionBlob = blobs.find((b) => b.pathname === `submission-${submissionId}.json`);
        if (submissionBlob) {
          const response = await fetch(submissionBlob.downloadUrl || submissionBlob.url);
          if (response.ok) {
            const submission = await response.json();
            submissions.push(submission);
          } else {
            console.error(`Failed to fetch submission ${submissionId}:`, response.status);
          }
        } else {
          console.error(`Submission blob not found: submission-${submissionId}.json`);
        }
      } catch (err) {
        console.error(`Error loading submission ${submissionId}:`, err);
      }
    }

    console.log(`Successfully loaded ${submissions.length} submissions`);
    return submissions;
  } catch (err) {
    console.error('Error in loadFromIndex:', err);
    return [];
  }
}

export async function saveSubmission(submission) {
  try {
    const submissionId = submission.id;
    console.log('Saving single submission:', submissionId);

    // Save the submission
    await put(`submission-${submissionId}.json`, JSON.stringify(submission, null, 2), {
      access: 'public',
      contentType: 'application/json'
    });

    // Update the index by adding this submission ID
    await updateSubmissionsIndex(submissionId);

    console.log('Successfully saved submission:', submissionId);
  } catch (err) {
    console.error('Error saving submission:', err);
    throw err;
  }
}

async function updateSubmissionsIndex(newSubmissionId) {
  try {
    console.log('Updating submissions index for:', newSubmissionId);
    const { blobs } = await list();
    const indexBlob = blobs.find((b) => b.pathname === SUBMISSIONS_INDEX_KEY);

    let submissionIds = [];
    if (indexBlob) {
      try {
        const indexResponse = await fetch(indexBlob.downloadUrl || indexBlob.url);
        if (indexResponse.ok) {
          const index = await indexResponse.json();
          if (Array.isArray(index.submissionIds)) {
            submissionIds = index.submissionIds;
          } else if (Array.isArray(index)) {
            // Handle old array format
            submissionIds = index;
          }
        }
      } catch (err) {
        console.error('Failed to load current index:', err);
      }
    }

    // Add the new submission ID if not already present
    if (!submissionIds.includes(newSubmissionId)) {
      submissionIds.push(newSubmissionId);
      console.log('Added new submission ID to index:', newSubmissionId);
    } else {
      console.log('Submission ID already in index:', newSubmissionId);
    }

    // Update index
    const newIndex = { submissionIds, lastUpdated: new Date().toISOString() };
    await put(SUBMISSIONS_INDEX_KEY, JSON.stringify(newIndex, null, 2), {
      access: 'public',
      contentType: 'application/json'
    });

    console.log('Updated index, now contains', submissionIds.length, 'submissions');
  } catch (err) {
    console.error('Error updating submissions index:', err);
    throw err;
  }
}
