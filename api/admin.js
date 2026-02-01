import { loadSubmissions, requireAdmin } from './_utils.js';

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) {
    res.statusCode = 302;
    res.setHeader('Location', '/login?error=2');
    return res.end();
  }

  const submissions = (await loadSubmissions()).sort(
    (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
  );

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
            `<a class="badge text-bg-secondary text-decoration-none me-1" target="_blank" href="${r.url}">${r.originalName || r.filename || 'receipt'}</a>`
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
                  ${rowsHtml || '<tr><td colspan="10" class="text-center text-muted">No submissions yet</td></tr>'}
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
