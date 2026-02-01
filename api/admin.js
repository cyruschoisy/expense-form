import { loadSubmissions, requireAdmin, saveSubmissions } from './_utils.js';

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) {
    res.statusCode = 302;
    res.setHeader('Location', '/login?error=2');
    return res.end();
  }

  const query = req.url.split('?')[1] || '';
  const params = new URLSearchParams(query);
  const sortBy = params.get('sort') || 'recent';
  const perPage = 10; // Show 10 submissions per page

  let submissions = [];
  try {
    submissions = await loadSubmissions();
    console.log('Admin page: loaded', submissions.length, 'submissions');
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

  // Pagination
  const totalSubmissions = submissions.length;
  const totalPages = Math.ceil(totalSubmissions / perPage);
  const page = Math.max(1, Math.min(totalPages || 1, parseInt(params.get('page') || '1')));
  const startIndex = (page - 1) * perPage;
  const endIndex = startIndex + perPage;
  const paginatedSubmissions = submissions.slice(startIndex, endIndex);

  const totalAmount = submissions.reduce((sum, s) => {
    const sTotal = typeof s.total === 'number'
      ? s.total
      : Array.isArray(s.items)
      ? s.items.filter(item => item && typeof item === 'object').reduce((itemSum, item) => {
          const amt = parseFloat(item.amount || 0);
          return itemSum + (isNaN(amt) ? 0 : amt);
        }, 0)
      : 0;
    return sum + sTotal;
  }, 0);

  const formatPhone = (phone) => {
    if (!phone) return 'N/A';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
      return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }
    return phone; // fallback
  };

  const rowsHtml = paginatedSubmissions
    .map((s, idx) => {
      const total =
        typeof s.total === 'number'
          ? s.total
          : Array.isArray(s.items)
          ? s.items.filter(item => item && typeof item === 'object').reduce((sum, item) => {
              const amt = parseFloat(item.amount || 0);
              return sum + (isNaN(amt) ? 0 : amt);
            }, 0)
          : 0;

      const receipts = (s.items || [])
        .flatMap((item) => item.receipts || [])
        .map(
          (r) =>
            `<a class="badge text-bg-secondary text-decoration-none me-1" target="_blank" href="${r.url}">${r.originalName || r.pathname}</a>`
        )
        .join(' ');

      return `
        <tr data-bs-toggle="collapse" data-bs-target="#details-${idx}" style="cursor: pointer;">
          <td>${s.date || ''}</td>
          <td>${s.name || ''}</td>
          <td>$${Number(total).toFixed(2)}</td>
        </tr>
        <tr class="collapse" id="details-${idx}">
          <td colspan="3">
            <div class="p-3 bg-light rounded">
              <div class="row">
                <div class="col-md-6">
                  <h6>Basic Information</h6>
                  <p><strong>Name:</strong> ${s.name || 'N/A'}</p>
                  <p><strong>Email:</strong> ${s.email || 'N/A'}</p>
                  <p><strong>Phone:</strong> ${formatPhone(s.phone)}</p>
                  <p><strong>Date:</strong> ${s.date || 'N/A'}</p>
                  <p><strong>Total:</strong> $${Number(total).toFixed(2)}</p>
                  ${s.signature ? `<p><strong>Signature:</strong> ${s.signature}</p>` : ''}
                  ${s.signatureDate ? `<p><strong>Signature Date:</strong> ${s.signatureDate}</p>` : ''}
                  <p><strong>Submitted:</strong> ${s.timestamp ? new Date(s.timestamp).toLocaleString('en-US', { timeZone: 'America/Toronto' }) + ' Toronto' : 'N/A'}</p>
                </div>
                <div class="col-md-6">
                  <h6>Expense Items</h6>
                  ${s.items && Array.isArray(s.items) && s.items.length > 0 ? s.items.filter(item => item && typeof item === 'object').map(item => `
                    <div class="mb-2 p-2 border rounded">
                      <p class="mb-1"><strong>Description:</strong> ${item.description || 'N/A'}</p>
                      <p class="mb-1"><strong>Budget:</strong> ${item.officers || 'N/A'}</p>
                      <p class="mb-1"><strong>Budget Line:</strong> ${item.budgetLine || 'N/A'}</p>
                      <p class="mb-1"><strong>Amount:</strong> $${parseFloat(item.amount || 0).toFixed(2)}</p>
                      <p class="mb-0"><strong>Receipts:</strong> ${(item.receipts || []).map(r => `<a class="badge text-bg-secondary text-decoration-none me-1" target="_blank" href="${r.url}">${r.originalName}</a>`).join(' ') || '<span class="text-muted">None</span>'}</p>
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
            <a href="/" class="btn btn-outline-primary btn-sm me-2">Back to Form</a>
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
                  </tr>
                </thead>
                <tbody>
                  ${rowsHtml || '<tr><td colspan="3" class="text-center text-muted">No submissions yet</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        ${totalPages > 1 ? `
        <nav aria-label="Submission pagination" class="mt-4">
          <ul class="pagination justify-content-center">
            ${page > 1 ? `<li class="page-item"><a class="page-link" href="?sort=${sortBy}&page=${page - 1}">Previous</a></li>` : '<li class="page-item disabled"><span class="page-link">Previous</span></li>'}
            
            ${Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const pageNum = Math.max(1, Math.min(totalPages - 4, page - 2)) + i;
              if (pageNum > totalPages) return '';
              return `<li class="page-item ${pageNum === page ? 'active' : ''}"><a class="page-link" href="?sort=${sortBy}&page=${pageNum}">${pageNum}</a></li>`;
            }).join('')}
            
            ${page < totalPages ? `<li class="page-item"><a class="page-link" href="?sort=${sortBy}&page=${page + 1}">Next</a></li>` : '<li class="page-item disabled"><span class="page-link">Next</span></li>'}
          </ul>
          <p class="text-center text-muted mt-2">Page ${page} of ${totalPages} (${totalSubmissions} total submissions)</p>
        </nav>
        ` : ''}
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
