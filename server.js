import express from 'express';
import session from 'express-session';
import bodyParser from 'body-parser';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_FILE = path.join(__dirname, 'submissions.json');
const RECEIPTS_DIR = path.join(__dirname, 'receipts');

const app = express();
const PORT = process.env.PORT || 3000;

/* =========================
   SECURITY / AUTH
========================= */

const SESSION_SECRET = crypto.randomBytes(64).toString('hex');
const ADMIN_PASSWORD_HASH =
  '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9';

/* =========================
   MIDDLEWARE
========================= */

app.use(bodyParser.json({ limit: '100mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '100mb' }));

app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false,
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000
    }
  })
);

app.use((req, res, next) => {
  const origin = process.env.CORS_ORIGIN || req.headers.origin;

  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET,POST,PUT,PATCH,DELETE,OPTIONS'
  );
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
});

/* =========================
   FILE SYSTEM SETUP
========================= */

if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify([]));
}

if (!fs.existsSync(RECEIPTS_DIR)) {
  fs.mkdirSync(RECEIPTS_DIR);
}

app.use('/receipts', express.static(RECEIPTS_DIR));
app.use(express.static(path.join(__dirname, 'dist')));

/* =========================
   HELPERS
========================= */

function readSubmissions() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeSubmissions(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function requireAuth(req, res, next) {
  if (!req.session.loggedIn) return res.redirect('/login');

  const age = Date.now() - (req.session.loginTime || 0);
  if (age > 24 * 60 * 60 * 1000) {
    req.session.destroy();
    return res.redirect('/login?error=2');
  }

  next();
}

/* =========================
   DATABASE
========================= */

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres:YNBShaaoDlPpePNzVgKQdycFmTEDBVYM@centerbeam.proxy.rlwy.net:37056/railway';
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL ? { rejectUnauthorized: false } : false
});

/* =========================
   AUTH ROUTES
========================= */

app.get('/login', (req, res) => {
  res.send(`
    <html>
    <head>
      <title>Admin Login</title>
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    </head>
    <body class="container mt-5">
      <div class="row justify-content-center">
        <div class="col-md-4">
          <h2 class="mb-4 text-center">Admin Login</h2>
          <form method="POST">
            <input type="password" name="password" class="form-control mb-3" required />
            <button class="btn btn-primary w-100">Login</button>
          </form>
          ${
            req.query.error === '1'
              ? '<div class="alert alert-danger mt-3">Invalid password</div>'
              : req.query.error === '2'
              ? '<div class="alert alert-warning mt-3">Session expired</div>'
              : ''
          }
        </div>
      </div>
    </body>
    </html>
  `);
});

app.post('/login', (req, res) => {
  const hash = crypto
    .createHash('sha256')
    .update(String(req.body.password || ''))
    .digest('hex');

  if (hash === ADMIN_PASSWORD_HASH) {
    req.session.loggedIn = true;
    req.session.loginTime = Date.now();
    return res.redirect('/admin');
  }

  res.redirect('/login?error=1');
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

/* =========================
   ADMIN DASHBOARD
========================= */

app.get('/admin', requireAuth, (req, res) => {
  const submissions = readSubmissions().sort(
    (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
  );

  const rows = submissions
    .map((s, idx) => {
      const total =
        typeof s.total === 'number'
          ? s.total
          : Array.isArray(s.items)
          ? s.items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0)
          : 0;

      const receipts = (s.items || [])
        .flatMap((item) => item.receipts || [])
        .map(
          (r) =>
            `<a class="badge text-bg-secondary text-decoration-none me-1" target="_blank" href="/receipts/${encodeURIComponent(
              r.filename
            )}">${r.originalName || r.filename}</a>`
        )
        .join(' ');

      return `
        <tr>
          <td>${idx + 1}</td>
          <td>${s.name || ''}</td>
          <td>${s.email || ''}</td>
          <td>${s.phone || ''}</td>
          <td>${s.officers || ''}</td>
          <td>${s.date || ''}</td>
          <td>$${Number(total).toFixed(2)}</td>
          <td>${s.timestamp ? new Date(s.timestamp).toLocaleString() : ''}</td>
          <td>${receipts || '<span class="text-muted">None</span>'}</td>
          <td>
            <button class="btn btn-sm btn-outline-primary" data-bs-toggle="collapse" data-bs-target="#details-${idx}">Details</button>
          </td>
        </tr>
        <tr class="collapse" id="details-${idx}">
          <td colspan="10">
            <div class="p-3 bg-light rounded">
              <pre class="mb-0">${JSON.stringify(s, null, 2)}</pre>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');

  res.send(`
    <!doctype html>
    <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Admin Dashboard</title>
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    </head>
    <body class="bg-light">
      <nav class="navbar navbar-expand-lg bg-white border-bottom">
        <div class="container-fluid">
          <span class="navbar-brand fw-bold">Expense Submissions</span>
          <div class="d-flex align-items-center gap-2">
            <span class="text-muted">Total: ${submissions.length}</span>
            <a class="btn btn-outline-secondary btn-sm" href="/logout">Logout</a>
          </div>
        </div>
      </nav>

      <main class="container py-4">
        <div class="card shadow-sm">
          <div class="card-body">
            <div class="row g-3 align-items-center mb-3">
              <div class="col-md-6">
                <h5 class="mb-0">Submissions</h5>
                <small class="text-muted">Search by name, email, or budget</small>
              </div>
              <div class="col-md-6">
                <input id="search" class="form-control" placeholder="Search..." />
              </div>
            </div>
            <div class="table-responsive">
              <table class="table table-striped align-middle" id="submissionsTable">
                <thead class="table-light">
                  <tr>
                    <th>#</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Budget</th>
                    <th>Date</th>
                    <th>Total</th>
                    <th>Submitted</th>
                    <th>Receipts</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  ${rows || '<tr><td colspan="10" class="text-center text-muted">No submissions yet</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>

      <script>
        const search = document.getElementById('search');
        const table = document.getElementById('submissionsTable');
        search.addEventListener('input', () => {
          const q = search.value.toLowerCase();
          for (const row of table.tBodies[0].rows) {
            if (row.querySelector('[data-bs-toggle="collapse"]')) {
              row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
            }
          }
        });
      </script>
      <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
    </body>
    </html>
  `);
});

/* =========================
   API ROUTES (IMPORTANT ORDER)
========================= */

app.post('/submit', async (req, res) => {
  try {
    const submissions = readSubmissions();
    const submissionId = Date.now().toString();

    const itemsWithReceipts = [];

    req.body.items?.forEach((item, i) => {
      const receipts = [];

      item.receipts?.forEach((r, j) => {
        const buffer = Buffer.from(r.data.split(',')[1], 'base64');
        const filename = `${submissionId}_${i}_${j}_${r.name}`;
        fs.writeFileSync(path.join(RECEIPTS_DIR, filename), buffer);

        receipts.push({
          originalName: r.name,
          filename,
          type: r.type
        });
      });

      itemsWithReceipts.push({ ...item, receipts });
    });

    submissions.push({
      id: submissionId,
      timestamp: new Date().toISOString(),
      ...req.body,
      items: itemsWithReceipts
    });

    writeSubmissions(submissions);

    // Send email notifications
    const utils = await import('./api/_utils.js');
    const totalAmount = req.body.total || (req.body.items ?
      req.body.items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0) : 0);

    // Email to submitter
    const submitterEmailHtml = `
      <h2>Expense Report Submitted Successfully</h2>
      <p>Dear ${req.body.name},</p>
      <p>Your expense report has been submitted successfully and will be reviewed by the ESS Finance Department.</p>
      <p><strong>Submission Details:</strong></p>
      <ul>
        <li><strong>Total Amount:</strong> $${totalAmount.toFixed(2)}</li>
        <li><strong>Submission Date:</strong> ${new Date().toLocaleDateString()}</li>
        <li><strong>Invoice Date:</strong> ${req.body.date || 'N/A'}</li>
      </ul>
      <p>You will receive a confirmation email once your expense report has been reviewed and approved.</p>
      <p>If you have any questions, please contact vpfa@uottawaess.ca</p>
      <p>Thank you for your service to ESS.</p>
    `;

    // Email to VPFA and Finance Committee
    const adminEmailHtml = `
      <h2>New Expense Report Submitted</h2>
      <p>A new expense report has been submitted and requires review:</p>
      <p><strong>Submitter:</strong> ${req.body.name}</p>
      <p><strong>Email:</strong> ${req.body.email}</p>
      <p><strong>Phone:</strong> ${req.body.phone || 'N/A'}</p>
      <p><strong>Total Amount:</strong> $${totalAmount.toFixed(2)}</p>
      <p><strong>Submission Date:</strong> ${new Date().toLocaleDateString()}</p>
      <p><strong>Invoice Date:</strong> ${req.body.date || 'N/A'}</p>
      <p><strong>Budget:</strong> ${req.body.officers || 'N/A'}</p>
    `;

    // Send emails asynchronously (don't wait for them to complete)
    utils.sendEmail(req.body.email, 'Expense Report Submitted - Confirmation', submitterEmailHtml)
      .catch(err => console.error('Failed to send submitter email:', err));

    utils.sendEmail('vpfa@uottawaess.ca', 'New Expense Report Submitted - Review Required', adminEmailHtml)
      .catch(err => console.error('Failed to send VPFA email:', err));

    utils.sendEmail('financecomm@uottawaess.ca', 'New Expense Report Submitted - Review Required', adminEmailHtml)
      .catch(err => console.error('Failed to send Finance Committee email:', err));

    res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Submission failed' });
  }
});

app.get('/api/expenses', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM expenses');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'DB error' });
  }
});

app.get('/api/pdf', async (req, res) => {
  try {
    const { default: pdfHandler } = await import('./api/pdf.js');
    await pdfHandler(req, res);
  } catch (err) {
    console.error('PDF generation error:', err);
    res.status(500).json({ error: 'PDF generation failed' });
  }
});

/* =========================
   REACT CATCH-ALL (LAST)
========================= */

app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

/* =========================
   START SERVER
========================= */

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
