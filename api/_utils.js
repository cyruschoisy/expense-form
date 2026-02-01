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

const SUBMISSIONS_BLOB_KEY = 'submissions.json';

export async function loadSubmissions() {
  try {
    console.log('Listing blobs...');
    const { blobs } = await list();
    console.log('Found', blobs.length, 'blobs total');
    blobs.forEach(b => console.log('Blob:', b.pathname));
    
    const existing = blobs.find((b) => b.pathname === SUBMISSIONS_BLOB_KEY);
    if (!existing) {
      console.log('No submissions blob found');
      return [];
    }
    
    console.log('Found submissions blob:', existing.pathname, 'url:', existing.url);
    
    // Use downloadUrl if available, otherwise use url
    const fetchUrl = existing.downloadUrl || existing.url;
    const url = fetchUrl + '?t=' + Date.now();
    
    console.log('Fetching from:', url);
    
    const response = await fetch(url, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache'
      }
    });
    
    if (!response.ok) {
      console.error('Failed to fetch submissions:', response.status, response.statusText);
      const text = await response.text();
      console.error('Response body:', text);
      return [];
    }
    
    const data = await response.json();
    console.log('Loaded submissions:', data.length);
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('Error loading submissions:', err);
    return [];
  }
}

export async function saveSubmissions(submissions) {
  try {
    const jsonString = JSON.stringify(submissions, null, 2);
    console.log('Saving submissions, count:', submissions.length, 'size:', jsonString.length);
    
    const result = await put(SUBMISSIONS_BLOB_KEY, jsonString, {
      access: 'public',
      contentType: 'application/json'
    });
    
    console.log('Successfully saved to blob:', result.url);
  } catch (err) {
    console.error('Blob storage error:', err);
    throw err; // Re-throw so submit.js knows it failed
  }
  
  // Also save to local file for development
  try {
    await fs.writeFile('./submissions.json', JSON.stringify(submissions, null, 2));
    console.log('Also saved to local file');
  } catch (err) {
    // Local file write is optional, don't fail if it errors
    console.error('Failed to save submissions to local file:', err);
  }
}
