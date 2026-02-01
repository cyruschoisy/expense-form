import crypto from 'crypto';
import { list, put } from '@vercel/blob';
import { parse as parseCookie, serialize as serializeCookie } from 'cookie';

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
  const { blobs } = await list({ prefix: SUBMISSIONS_BLOB_KEY });
  const existing = blobs.find((b) => b.pathname === SUBMISSIONS_BLOB_KEY);
  if (!existing?.url) return [];
  const response = await fetch(existing.url);
  if (!response.ok) return [];
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

export async function saveSubmissions(submissions) {
  await put(SUBMISSIONS_BLOB_KEY, JSON.stringify(submissions, null, 2), {
    access: 'public',
    contentType: 'application/json'
  });
}
