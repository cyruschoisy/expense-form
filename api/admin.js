import { loadSubmissions, requireAdmin } from './_utils.js';

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) {
    res.statusCode = 302;
    res.setHeader('Location', '/login?error=2');
    return res.end();
  }

  const query = req.url.split('?')[1] || '';
  const params = new URLSearchParams(query);
  const sortBy = params.get('sort') || 'recent';

  let submissions = [];
  try {
    submissions = await loadSubmissions();
  } catch (err) {
    console.error('Failed to load submissions:', err);
    // Continue with empty array
  }

  submissions = submissions.sort((a, b) => {
    switch (sortBy) {
      case 'name':
        return (a.name || '').localeCompare(b.name || '');
      case 'date':
        return new Date(b.date || 0) - new Date(a.date || 0);
      case 'recent':
      default:
        return new Date(b.timestamp || 0) - new Date(a.timestamp || 0);
    }
  });

  const totalAmount = submissions.reduce((sum, s) => {
    const sTotal = typeof s.total === 'number'
      ? s.total
      : Array.isArray(s.items)
      ? s.items.reduce((itemSum, item) => itemSum + (parseFloat(item.amount) || 0), 0)
      : 0;
    return sum + sTotal;
  }, 0);

  const rowsHtml = submissions
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
        <tr data-bs-toggle="collapse" data-bs-target="#details-${idx}" style="cursor: pointer;">
          <td>${s.date || ''}</td>
          <td>${s.name || ''}</td>
          <td>$${Number(total).toFixed(2)}</td>
          <td>${s.officers || ''}</td>
        </tr>
        <tr class="collapse" id="details-${idx}">
          <td colspan="4">
            <div class="p-3 bg-light rounded">
              <div class="row">
                <div class="col-md-6">
                  <h6>Basic Information</h6>
                  <p><strong>Name:</strong> ${s.name || 'N/A'}</p>
                  <p><strong>Email:</strong> ${s.email || 'N/A'}</p>
                  <p><strong>Phone:</strong> ${s.phone || 'N/A'}</p>
                  <p><strong>Budget:</strong> ${s.officers || 'N/A'}</p>
                  <p><strong>Date:</strong> ${s.date || 'N/A'}</p>
                  <p><strong>Total:</strong> $${Number(total).toFixed(2)}</p>
                  <p><strong>Submitted:</strong> ${s.timestamp ? new Date(s.timestamp).toLocaleString('en-US', { timeZone: 'UTC' }) + ' UTC' : 'N/A'}</p>
                </div>
                <div class="col-md-6">
                  <h6>Expense Items</h6>
                  ${s.items && s.items.length > 0 ? s.items.map(item => `
                    <div class="mb-2 p-2 border rounded">
                      <p class="mb-1"><strong>Description:</strong> ${item.description || 'N/A'}</p>
                      <p class="mb-1"><strong>Amount:</strong> $${parseFloat(item.amount || 0).toFixed(2)}</p>
                      <p class="mb-0"><strong>Receipts:</strong> ${item.receipts && item.receipts.length > 0 ? item.receipts.map(r => `<a class="badge text-bg-secondary text-decoration-none me-1" target="_blank" href="${r.url}">${r.originalName || r.filename}</a>`).join(' ') : '<span class="text-muted">None</span>'}</p>
                    </div>
                  `).join('') : '<p class="text-muted">No items</p>'}
                </div>
              </div>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.statusCode = 200;
  res.end(`
    <!doctype html>
    <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Admin Dashboard</title>
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
      <link rel="icon" href="/ess-logo.png">
    </head>
    <body class="bg-light">
      <nav class="navbar navbar-expand-lg bg-white border-bottom">
        <div class="container-fluid">
          <span class="navbar-brand fw-bold">
            <img src="/ess-logo.png" alt="ESS Logo" class="me-2" style="height: 32px;">
            Expense Submissions
          </span>
          <div class="d-flex align-items-center gap-2">
            <span class="text-muted">Total: $${Number(totalAmount).toFixed(2)}</span>
            <a class="btn btn-outline-secondary btn-sm" href="/logout">Logout</a>
          </div>
        </div>
      </nav>

      <main class="container-fluid py-4 px-5">
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
                    <th>Date</th>
                    <th>Name</th>
                    <th>Total</th>
                    <th>Budget</th>
                  </tr>
                </thead>
                <tbody>
                  ${rowsHtml || '<tr><td colspan="4" class="text-center text-muted">No submissions yet</td></tr>'}
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
}
