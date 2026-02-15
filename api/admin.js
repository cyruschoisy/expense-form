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
                    <th>Invoice Date</th>
                    <th>Name</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td colspan="3" class="text-center text-muted">Loading...</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>

      <script>
        const submissions = ${JSON.stringify(submissions)};
        const search = document.getElementById('search');
        const table = document.getElementById('submissionsTable');
        
        function renderTable(filteredSubmissions) {
          const formatPhone = (phone) => {
            if (!phone) return 'N/A';
            const cleaned = phone.replace(/\D/g, '');
            if (cleaned.length === 10) {
              return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
            }
            return phone;
          };

          const rowsHtml = filteredSubmissions
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

          table.tBodies[0].innerHTML = rowsHtml || '<tr><td colspan="3" class="text-center text-muted">No submissions found</td></tr>';
        }

        search.addEventListener('input', () => {
          const q = search.value.toLowerCase().trim();
          if (!q) {
            renderTable(submissions);
            return;
          }
          
          const filtered = submissions.filter(s => {
            const searchableText = [
              s.name || '',
              s.email || '',
              s.phone || '',
              s.date || '',
              ...(s.items || []).map(item => [
                item.description || '',
                item.officers || '',
                item.budgetLine || '',
                item.amount || ''
              ]).flat()
            ].join(' ').toLowerCase();
            
            return searchableText.includes(q);
          });
          
          renderTable(filtered);
        });
        
        // Initial render
        renderTable(submissions);
      </script>
      <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
    </body>
    </html>
  `);
}
