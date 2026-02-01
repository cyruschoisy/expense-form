import { loadSubmission } from '../_utils.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const { id } = req.query;

  if (!id) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'Submission ID required' }));
    return;
  }

  try {
    const submission = await loadSubmission(id);

    if (!submission) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'Submission not found' }));
      return;
    }

    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 200;
    res.end(JSON.stringify(submission));
  } catch (error) {
    console.error('Error loading submission:', error);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
};