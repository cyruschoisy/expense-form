import express from 'express';
import session from 'express-session';
import bodyParser from 'body-parser';
import multer from 'multer';
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

DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:YNBShaaoDlPpePNzVgKQdycFmTEDBVYM@centerbeam.proxy.rlwy.net:37056/railway';
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
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

  res.send(`<html><body><pre>${JSON.stringify(submissions, null, 2)}</pre></body></html>`);
});

/* =========================
   API ROUTES (IMPORTANT ORDER)
========================= */

app.post('/submit', (req, res) => {
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
