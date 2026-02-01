import crypto from 'crypto';
import { parseFormBody, setCookie } from './_utils.js';

const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;

function renderLogin(errorCode) {
  return `
    <!doctype html>
    <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Admin Login</title>
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    </head>
    <body class="bg-light">
      <div class="container-fluid p-5">
        <div class="row justify-content-center">
          <div class="card shadow-sm">
            <div class="card-body">
              <h4 class="mb-3 text-center">Admin Login</h4>
              <form method="POST">
                <input type="password" name="password" class="form-control mb-3" required />
                <button class="btn btn-primary w-100">Login</button>
              </form>
              ${
                errorCode === '1'
                  ? '<div class="alert alert-danger mt-3">Invalid password</div>'
                  : errorCode === '2'
                  ? '<div class="alert alert-warning mt-3">Session expired</div>'
                  : ''
              }
            </div>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const errorCode = new URL(req.url, `http://${req.headers.host}`).searchParams.get('error');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.statusCode = 200;
    return res.end(renderLogin(errorCode));
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.end('Method Not Allowed');
  }

  const body = await parseFormBody(req);
  const hash = crypto
    .createHash('sha256')
    .update(String(body.password || ''))
    .digest('hex');

  if (hash === ADMIN_PASSWORD_HASH) {
    const secret = process.env.ADMIN_SESSION_SECRET;
    if (!secret) {
      res.statusCode = 500;
      return res.end('Missing ADMIN_SESSION_SECRET');
    }

    const payload = { exp: Date.now() + 24 * 60 * 60 * 1000 };
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
      .toString('base64url');
    const bodyEncoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const data = `${header}.${bodyEncoded}`;
    const signature = crypto
      .createHmac('sha256', secret)
      .update(data)
      .digest('base64url');
    const token = `${data}.${signature}`;

    setCookie(res, 'admin_token', token, { maxAge: 60 * 60 * 24 });
    res.statusCode = 302;
    res.setHeader('Location', '/admin');
    return res.end();
  }

  res.statusCode = 302;
  res.setHeader('Location', '/login?error=1');
  return res.end();
}
