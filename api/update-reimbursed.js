import { loadSubmissions, saveSubmission, requireAdmin } from './_utils.js';

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) {
    res.statusCode = 401;
    return res.end(JSON.stringify({ error: 'Unauthorized' }));
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.end('Method Not Allowed');
  }

  try {
    const { id, reimbursed } = await parseJsonBody(req);

    if (!id) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: 'Submission ID required' }));
    }

    // Load all submissions
    const submissions = await loadSubmissions();

    // Find the submission
    const submission = submissions.find(s => s.id === id);
    if (!submission) {
      res.statusCode = 404;
      return res.end(JSON.stringify({ error: 'Submission not found' }));
    }

    // Update reimbursed status
    submission.reimbursed = reimbursed;

    // Save the updated submission
    await saveSubmission(submission);

    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 200;
    res.end(JSON.stringify({ success: true }));
  } catch (err) {
    console.error('Error updating reimbursed status:', err);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Update failed' }));
  }
}

async function parseJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}