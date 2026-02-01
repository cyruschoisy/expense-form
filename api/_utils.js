import crypto from 'crypto';
import { list, put } from '@vercel/blob';
import { parse as parseCookie, serialize as serializeCookie } from 'cookie';
import fs from 'fs/promises';

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

// Metadata-only version for listing (avoids loading full submission data)
export async function loadSubmissionsMetadata(limit = 50, offset = 0) {
  try {
    const { blobs } = await list();
    const indexBlob = blobs.find((b) => b.pathname === SUBMISSIONS_INDEX_KEY);

    if (!indexBlob) {
      // Check for old single file
      const oldBlob = blobs.find((b) => b.pathname === 'submissions.json');
      if (oldBlob) {
        console.log('Migrating from old system...');
        const response = await fetch(oldBlob.downloadUrl || oldBlob.url);
        if (response.ok) {
          const submissions = await response.json();
          if (Array.isArray(submissions)) {
            await migrateToNewSystem(submissions);
            return submissions.slice(offset, offset + limit).map(createMetadata);
          }
        }
      }
      return [];
    }

    const indexResponse = await fetch(indexBlob.downloadUrl || indexBlob.url);
    if (!indexResponse.ok) return [];

    const index = await indexResponse.json();
    const submissionIds = Array.isArray(index.submissionIds) ? index.submissionIds : [];

    // Load metadata for the requested range
    const metadata = [];
    const endIndex = Math.min(submissionIds.length, offset + limit);

    for (let i = offset; i < endIndex; i++) {
      const submissionId = submissionIds[i];
      try {
        const submissionBlob = blobs.find((b) => b.pathname === `submission-${submissionId}.json`);
        if (submissionBlob) {
          const response = await fetch(submissionBlob.downloadUrl || submissionBlob.url);
          if (response.ok) {
            const submission = await response.json();
            metadata.push(createMetadata(submission));
          }
        }
      } catch (err) {
        console.error(`Failed to load metadata for ${submissionId}:`, err);
      }
    }

    return metadata;
  } catch (err) {
    console.error('Error loading submissions metadata:', err);
    return [];
  }
}

// Load full submission data by ID
export async function loadSubmissionById(submissionId) {
  try {
    const { blobs } = await list();
    const submissionBlob = blobs.find((b) => b.pathname === `submission-${submissionId}.json`);

    if (!submissionBlob) return null;

    const response = await fetch(submissionBlob.downloadUrl || submissionBlob.url);
    return response.ok ? await response.json() : null;
  } catch (err) {
    console.error(`Error loading submission ${submissionId}:`, err);
    return null;
  }
}

// Create metadata object (summary info for listing, more fields for display)
function createMetadata(submission) {
  const total = submission.total || (submission.items ?
    submission.items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0) : 0);

  return {
    id: submission.id,
    name: submission.name,
    email: submission.email,
    phone: submission.phone,
    date: submission.date,
    total: total,
    timestamp: submission.timestamp,
    itemCount: submission.items ? submission.items.length : 0,
    hasReceipts: submission.items ? submission.items.some(item => item.receipts && item.receipts.length > 0) : false,
    signature: submission.signature,
    signatureDate: submission.signatureDate,
    officers: submission.officers
  };
}

// Migrate from old single-file system to new system
async function migrateToNewSystem(submissions) {
  console.log(`Migrating ${submissions.length} submissions to new system...`);

  const submissionIds = [];
  for (const submission of submissions) {
    const submissionId = submission.id;
    submissionIds.push(submissionId);

    try {
      await put(`submission-${submissionId}.json`, JSON.stringify(submission, null, 2), {
        access: 'public',
        contentType: 'application/json'
      });
    } catch (err) {
      console.error(`Failed to migrate submission ${submissionId}:`, err);
    }
  }

  // Save index
  const index = { submissionIds, migratedAt: new Date().toISOString() };
  await put(SUBMISSIONS_INDEX_KEY, JSON.stringify(index, null, 2), {
    access: 'public',
    contentType: 'application/json'
  });

  console.log('Migration complete');
}

export async function saveSubmissions(submissions) {
  // This function is now for bulk operations - save each submission individually
  for (const submission of submissions) {
    await saveSubmission(submission);
  }
}

export async function saveSubmission(submission) {
  try {
    const submissionId = submission.id;
    console.log('Saving submission:', submissionId);

    // Save the full submission
    await put(`submission-${submissionId}.json`, JSON.stringify(submission, null, 2), {
      access: 'public',
      contentType: 'application/json'
    });

    // Update the index
    await updateSubmissionsIndex(submissionId);

    console.log('Successfully saved submission:', submissionId);
  } catch (err) {
    console.error('Error saving submission:', err);
    throw err;
  }
}

async function updateSubmissionsIndex(newSubmissionId) {
  try {
    const { blobs } = await list();
    const indexBlob = blobs.find((b) => b.pathname === SUBMISSIONS_INDEX_KEY);

    let submissionIds = [];
    if (indexBlob) {
      try {
        const indexResponse = await fetch(indexBlob.downloadUrl || indexBlob.url);
        if (indexResponse.ok) {
          const index = await indexResponse.json();
          submissionIds = Array.isArray(index.submissionIds) ? index.submissionIds : [];
        }
      } catch (err) {
        console.error('Failed to load current index:', err);
      }
    }

    // Add the new submission ID if not already present
    if (!submissionIds.includes(newSubmissionId)) {
      submissionIds.push(newSubmissionId);
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
