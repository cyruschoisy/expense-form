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

// Generate a secure session secret
const SESSION_SECRET = crypto.randomBytes(64).toString('hex');

// Hash the admin password - REPLACE THIS WITH YOUR NEW HASH
const ADMIN_PASSWORD_HASH = '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9';

const app = express();
const PORT = 3000;

// Middleware
app.use(bodyParser.json({ limit: '100mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '100mb' }));

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, RECEIPTS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}_${file.originalname}`;
    cb(null, uniqueName);
  }
});
const upload = multer({ storage: storage });
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true if using HTTPS
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Serve static files from React build
app.use(express.static(path.join(__dirname, 'dist')));

// // Password for admin access
// const ADMIN_PASSWORD = 'admin123'; // Change this to your desired password

// Data storage file
const DATA_FILE = path.join(__dirname, 'submissions.json');
const RECEIPTS_DIR = path.join(__dirname, 'receipts');

// Ensure directories exist
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify([]));
}
if (!fs.existsSync(RECEIPTS_DIR)) {
  fs.mkdirSync(RECEIPTS_DIR);
}

// Serve receipts
app.use('/receipts', express.static(RECEIPTS_DIR));

// Read submissions
function readSubmissions() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (error) {
    return [];
  }
}

// Write submissions
function writeSubmissions(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Middleware to check if logged in with session timeout
function requireAuth(req, res, next) {
  if (req.session.loggedIn) {
    // Check for session timeout (24 hours)
    const sessionAge = Date.now() - (req.session.loginTime || 0);
    if (sessionAge > 24 * 60 * 60 * 1000) {
      req.session.destroy();
      return res.redirect('/login?error=2'); // Session expired
    }
    next();
  } else {
    res.redirect('/login');
  }
}

// PostgreSQL connection setup
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'postgresql://postgres:YNBShaaoDlPpePNzVgKQdycFmTEDBVYM@postgres.railway.internal:5432/railway',
  password: 'YNBShaaoDlPpePNzVgKQdycFmTEDBVYM',
  port: 5432,
});

// Routes
app.get('/login', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Admin Login</title>
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    </head>
    <body class="container mt-5">
      <div class="row justify-content-center">
        <div class="col-md-4">
          <h2 class="text-center mb-4">Admin Login</h2>
          <form method="POST" action="/login">
            <div class="mb-3">
              <label for="password" class="form-label">Password</label>
              <input type="password" class="form-control" id="password" name="password" required>
            </div>
            <button type="submit" class="btn btn-primary w-100">Login</button>
          </form>
          ${req.query.error === '1' ? '<div class="alert alert-danger mt-3">Invalid password</div>' :
            req.query.error === '2' ? '<div class="alert alert-warning mt-3">Session expired. Please login again.</div>' : ''}
        </div>
      </div>
    </body>
    </html>
  `);
});

app.post('/login', (req, res) => {
  const passwordString = String(req.body.password || '');
  const hashedInput = crypto.createHash('sha256').update(passwordString).digest('hex');

  if (hashedInput === ADMIN_PASSWORD_HASH) {
    req.session.loggedIn = true;
    req.session.loginTime = Date.now();
    res.redirect('/admin');
  } else {
    // Log failed attempt (optional)
    res.redirect('/login?error=1');
  }
});

app.get('/admin', requireAuth, (req, res) => {
  const submissions = readSubmissions();
  
  // Sort by most recent first
  submissions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  
  const submissionsJson = JSON.stringify(submissions);
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Admin Dashboard</title>
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
      <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
      <style>
        .submission-row { cursor: pointer; }
        .submission-row:hover { background-color: #f8f9fa; }
        .details { display: none; }
        .search-container { margin-bottom: 20px; }
        .export-btn { margin-left: 10px; }
      </style>
    </head>
    <body class="container mt-5">
      <div class="d-flex justify-content-between align-items-center mb-4">
        <h2>Expense Report Submissions</h2>
        <a href="/logout" class="btn btn-danger">Logout</a>
      </div>
      
      <div class="search-container">
        <input type="text" id="searchInput" class="form-control" placeholder="Search submissions...">
      </div>
      
      <div class="mb-3">
        <label for="sortSelect" class="form-label">Sort by:</label>
        <select id="sortSelect" class="form-select" style="width: auto; display: inline-block;">
          <option value="date">Most Recent First</option>
          <option value="name">Name (A-Z)</option>
          <option value="name-desc">Name (Z-A)</option>
        </select>
      </div>
      
      <div id="submissionsContainer">
        ${submissions.map((sub, index) => `
          <div class="card mb-2 submission-row" data-index="${index}">
            <div class="card-body py-2">
              <div class="row align-items-center">
                <div class="col-md-3"><strong>${sub.name}</strong></div>
                <div class="col-md-3">${sub.email}</div>
                <div class="col-md-2">${new Date(sub.timestamp).toLocaleDateString()}</div>
                <div class="col-md-2">$${sub.total}</div>
                <div class="col-md-1">${sub.items.length} expense(s)</div>
                <div class="col-md-1">
                  <button class="btn btn-sm btn-primary export-btn" onclick="(async () => await exportToPDF(${index}))()">PDF</button>
                </div>
              </div>
            </div>
            <div class="details card-body border-top" style="display: none;">
              <div class="row">
                <div class="col-md-6">
                  <p><strong>Name:</strong> ${sub.name}</p>
                  <p><strong>Email:</strong> ${sub.email}</p>
                  <p><strong>Phone:</strong> ${sub.phone}</p>
                  <p><strong>Position:</strong> ${sub.officers}</p>
                </div>
                <div class="col-md-6">
                  <p><strong>Invoice Date:</strong> ${sub.date}</p>
                  <p><strong>Signature Date:</strong> ${sub.signatureDate || sub.date}</p>
                  <p><strong>Signature:</strong> ${sub.signature}</p>
                  <p><strong>Total:</strong> $${sub.total}</p>
                </div>
              </div>
              <h6>Expenses:</h6>
              <ul>
                ${sub.items.map(item => `
                  <li>${item.description} (${item.budgetLine}): $${item.amount} - ${item.notes}
                    ${item.receipts && item.receipts.length > 0 ? `
                      <br><small>Receipts: 
                        ${item.receipts.map(receipt => `
                          <a href="/receipts/${receipt.filename}" target="_blank">${receipt.originalName}</a>
                        `).join(', ')}
                      </small>
                    ` : ''}
                  </li>
                `).join('')}
              </ul>
            </div>
          </div>
        `).join('')}
      </div>
      
      <script>
        const submissions = ${submissionsJson};
        let currentSort = 'date';
        
        function renderSubmissions(filteredSubmissions = submissions) {
          const container = document.getElementById('submissionsContainer');
          container.innerHTML = filteredSubmissions.map((sub, index) => \`
            <div class="card mb-2 submission-row" data-index="\${index}">
              <div class="card-body py-2">
                <div class="row align-items-center">
                  <div class="col-md-3"><strong>\${sub.name}</strong></div>
                  <div class="col-md-3">\${sub.email}</div>
                  <div class="col-md-2">\${new Date(sub.timestamp).toLocaleDateString()}</div>
                  <div class="col-md-2">$\${sub.total}</div>
                  <div class="col-md-1">\${sub.items.length} expense(s)</div>
                  <div class="col-md-1">
                    <button class="btn btn-sm btn-primary export-btn" onclick="(async () => await exportToPDF(\${index}))()">PDF</button>
                  </div>
                </div>
              </div>
              <div class="details card-body border-top" style="display: none;">
                <div class="row">
                  <div class="col-md-6">
                    <p><strong>Name:</strong> \${sub.name}</p>
                    <p><strong>Email:</strong> \${sub.email}</p>
                    <p><strong>Phone:</strong> \${sub.phone}</p>
                    <p><strong>Position:</strong> \${sub.officers}</p>
                  </div>
                  <div class="col-md-6">
                    <p><strong>Invoice Date:</strong> \${sub.date}</p>
                    <p><strong>Signature Date:</strong> \${sub.signatureDate || sub.date}</p>
                    <p><strong>Signature:</strong> \${sub.signature}</p>
                    <p><strong>Total:</strong> $\${sub.total}</p>
                  </div>
                </div>
                <h6>Expenses:</h6>
                <ul>
                  \${sub.items.map(item => \`
                    <li>\${item.description} (\${item.budgetLine}): $\${item.amount} - \${item.notes}
                      \${item.receipts && item.receipts.length > 0 ? \`
                        <br><small>Receipts: 
                          \${item.receipts.map(receipt => \`
                            <a href="/receipts/\${receipt.filename}" target="_blank">\${receipt.originalName}</a>
                          \`).join(', ')}
                        </small>
                      \` : ''}
                    </li>
                  \`).join('')}
                </ul>
              </div>
            </div>
          \`).join('');
          
          // Reattach event listeners
          attachEventListeners(filteredSubmissions);
        }
        
        function attachEventListeners(data) {
          document.querySelectorAll('.submission-row').forEach(row => {
            row.addEventListener('click', function() {
              const details = this.querySelector('.details');
              details.style.display = details.style.display === 'none' ? 'block' : 'none';
            });
          });
        }
        
        function sortSubmissions(sortBy) {
          let sorted = [...submissions];
          switch(sortBy) {
            case 'name':
              sorted.sort((a, b) => a.name.localeCompare(b.name));
              break;
            case 'name-desc':
              sorted.sort((a, b) => b.name.localeCompare(a.name));
              break;
            case 'date':
            default:
              sorted.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
              break;
          }
          currentSort = sortBy;
          renderSubmissions(sorted);
        }
        
        function filterSubmissions(query) {
          if (!query) {
            sortSubmissions(currentSort);
            return;
          }
          
          const filtered = submissions.filter(sub => {
            const searchText = \`\${sub.name} \${sub.email} \${sub.phone} \${sub.officers} \${sub.date} \${sub.signature} \${sub.signatureDate} \${sub.total} \${sub.items.map(item => \`\${item.description} \${item.budgetLine} \${item.amount} \${item.notes}\`).join(' ')}\`.toLowerCase();
            return searchText.includes(query.toLowerCase());
          });
          
          renderSubmissions(filtered);
        }
        
        // Initial render
        renderSubmissions();
        
        // Event listeners
        document.getElementById('sortSelect').addEventListener('change', function() {
          sortSubmissions(this.value);
        });
        
        document.getElementById('searchInput').addEventListener('input', function() {
          filterSubmissions(this.value);
        });
        
        // PDF Export function
        window.exportToPDF = async function(index) {
          const { jsPDF } = window.jspdf;
          const doc = new jsPDF();
          
          const sub = submissions[index];
          let y = 20;
          
          // Title
          doc.setFontSize(16);
          doc.text('Expense Report Submission', 20, y);
          y += 20;
          
          // Submission info
          doc.setFontSize(12);
          doc.text(\`Submitted: \${new Date(sub.timestamp).toLocaleString()}\`, 20, y);
          y += 10;
          
          // Personal info
          doc.text(\`Name: \${sub.name}\`, 20, y);
          y += 10;
          doc.text(\`Email: \${sub.email}\`, 20, y);
          y += 10;
          doc.text(\`Phone: \${sub.phone}\`, 20, y);
          y += 10;
          doc.text(\`Position: \${sub.officers}\`, 20, y);
          y += 10;
          
          // Dates
          doc.text(\`Invoice Date: \${sub.date}\`, 20, y);
          y += 10;
          doc.text(\`Signature Date: \${sub.signatureDate || sub.date}\`, 20, y);
          y += 10;
          doc.text(\`Signature: \${sub.signature}\`, 20, y);
          y += 20;
          
          // Expenses
          doc.setFontSize(14);
          doc.text('Expenses:', 20, y);
          y += 10;
          
          doc.setFontSize(12);
          sub.items.forEach((item, i) => {
            if (y > 250) {
              doc.addPage();
              y = 20;
            }
            
            doc.text(\`\${i + 1}. \${item.description} (\${item.budgetLine}): $\${item.amount}\`, 20, y);
            y += 8;
            if (item.notes) {
              doc.text(\`   Notes: \${item.notes}\`, 20, y);
              y += 8;
            }
            y += 2;
          });
          
          // Total
          if (y > 240) {
            doc.addPage();
            y = 20;
          }
          doc.setFontSize(14);
          doc.text(\`Total: $\${sub.total}\`, 20, y + 10);
          
          // Add receipts
          if (sub.items.some(item => item.receipts && item.receipts.length > 0)) {
            doc.addPage();
            y = 20;
            doc.setFontSize(16);
            doc.text('Receipts', 20, y);
            y += 20;
            
            for (const item of sub.items) {
              if (item.receipts && item.receipts.length > 0) {
                doc.setFontSize(12);
                doc.text(\`Expense: \${item.description}\`, 20, y);
                y += 10;
                
                for (const receipt of item.receipts) {
                  try {
                    // Fetch the image
                    const response = await fetch(\`/receipts/\${receipt.filename}\`);
                    const blob = await response.blob();
                    
                    // Convert blob to base64
                    const base64 = await new Promise((resolve) => {
                      const reader = new FileReader();
                      reader.onload = () => resolve(reader.result);
                      reader.readAsDataURL(blob);
                    });
                    
                    // Get image dimensions while preserving aspect ratio
                    const img = new Image();
                    await new Promise((resolve) => {
                      img.onload = resolve;
                      img.src = base64;
                    });
                    
                    const maxWidth = 150;
                    const aspectRatio = img.width / img.height;
                    let imgWidth = Math.min(img.width, maxWidth);
                    let imgHeight = imgWidth / aspectRatio;
                    
                    // If height is too tall, scale down further
                    if (imgHeight > 200) {
                      imgHeight = 200;
                      imgWidth = imgHeight * aspectRatio;
                    }
                    
                    // Add image to PDF
                    const imgData = base64;
                    
                    if (y + imgHeight > 270) {
                      doc.addPage();
                      y = 20;
                    }
                    
                    doc.addImage(imgData, 'JPEG', 20, y, imgWidth, imgHeight);
                    y += imgHeight + 10;
                    
                    // Add filename
                    doc.setFontSize(10);
                    doc.text(receipt.originalName, 20, y);
                    y += 15;
                    
                  } catch (error) {
                    console.error('Error loading receipt:', error);
                    doc.text(\`Error loading: \${receipt.originalName}\`, 20, y);
                    y += 10;
                  }
                }
              }
            }
          }
          
          // Save the PDF
          const filename = \`expense-report-\${sub.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}-\${new Date(sub.timestamp).toISOString().split('T')[0]}.pdf\`;
          doc.save(filename);
        };
      </script>
    </body>
    </html>
  `);
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// API endpoint for form submission
app.post('/submit', (req, res) => {
  try {
    console.log('Received submission:', JSON.stringify(req.body, null, 2));
    const submissions = readSubmissions();
    const submissionId = Date.now().toString();
    const savedReceipts = [];

    // Save receipts
    const itemsWithReceipts = [];
    if (req.body.items && Array.isArray(req.body.items)) {
      req.body.items.forEach((item, itemIndex) => {
        const itemReceipts = [];
        if (item.receipts && Array.isArray(item.receipts)) {
          item.receipts.forEach((receipt, receiptIndex) => {
            const buffer = Buffer.from(receipt.data.split(',')[1], 'base64');
            const filename = `${submissionId}_${itemIndex}_${receiptIndex}_${receipt.name}`;
            const filepath = path.join(RECEIPTS_DIR, filename);
            fs.writeFileSync(filepath, buffer);
            itemReceipts.push({
              originalName: receipt.name,
              filename: filename,
              type: receipt.type
            });
          });
        }
        itemsWithReceipts.push({
          ...item,
          receipts: itemReceipts
        });
      });
    }

    const newSubmission = {
      id: submissionId,
      timestamp: new Date().toISOString(),
      ...req.body,
      items: itemsWithReceipts
    };
    submissions.push(newSubmission);
    writeSubmissions(submissions);
    
    res.json({ success: true, message: 'Submission received' });
  } catch (error) {
    console.error('Submission error:', error);
    res.status(500).json({ error: 'Failed to save submission' });
  }
});

// Example API endpoint
app.get('/api/expenses', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM expenses');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Serve React app for all other routes
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Form: http://localhost:${PORT}`);
  console.log(`Admin login: http://localhost:${PORT}/login`);
});