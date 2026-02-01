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
            <button class="btn btn-sm btn-outline-primary" data-bs-toggle="collapse" data-bs-target="#details-${idx}"><i class="bi bi-eye"></i> Details</button>
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
      <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css" rel="stylesheet">
    </head>
    <body class="bg-light">
      <nav class="navbar navbar-expand-lg bg-white border-bottom">
        <div class="container-fluid">
          <span class="navbar-brand fw-bold">Expense Submissions</span>
          <div class="d-flex align-items-center gap-2">
            <span class="badge bg-primary">Total: ${submissions.length}</span>
            <a class="btn btn-outline-secondary btn-sm" href="/logout"><i class="bi bi-box-arrow-right"></i> Logout</a>
          </div>
        </div>
      </nav>

      <main class="container py-4">
        <div class="card shadow-sm">
          <div class="card-body">
            <div class="row g-3 align-items-center mb-3">
              <div class="col-md-4">
                <h5 class="mb-0">Submissions</h5>
                <small class="text-muted">Search by name, email, or budget</small>
              </div>
              <div class="col-md-4">
                <input id="search" class="form-control" placeholder="Search..." />
              </div>
              <div class="col-md-4">
                <label for="sortSelect" class="form-label">Sort by:</label>
                <select class="form-select" id="sortSelect">
                  <option value="recent" ${sortBy === 'recent' ? 'selected' : ''}>Recent</option>
                  <option value="name" ${sortBy === 'name' ? 'selected' : ''}>Name</option>
                  <option value="date" ${sortBy === 'date' ? 'selected' : ''}>Date</option>
                </select>
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

        const sortSelect = document.getElementById('sortSelect');
        sortSelect.addEventListener('change', () => {
          const sortValue = sortSelect.value;
          const url = new URL(window.location);
          url.searchParams.set('sort', sortValue);
          window.location.href = url.toString();
        });
      </script>
      <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
    </body>
    </html>
  `);
}
