import crypto from 'crypto';
import { put } from '@vercel/blob';
import { loadSubmissions, parseJsonBody, saveSubmissions } from './_utils.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.end('Method Not Allowed');
  }

  try {
    const body = await parseJsonBody(req);
    const submissionId = crypto.randomUUID();

    const items = Array.isArray(body.items) ? body.items : [];
    const itemsWithReceipts = await Promise.all(
      items.map(async (item, i) => {
        const receipts = Array.isArray(item.receipts) ? item.receipts : [];
        const uploaded = await Promise.all(
          receipts.map(async (r, j) => {
            const base64 = String(r.data || '').split(',')[1] || '';
            const buffer = Buffer.from(base64, 'base64');
            const filename = `${submissionId}_${i}_${j}_${r.name || 'receipt'}`;
            const blob = await put(filename, buffer, {
              access: 'public',
              contentType: r.type || 'application/octet-stream'
            });
            return {
              originalName: r.name,
              type: r.type,
              url: blob.url,
              pathname: blob.pathname
            };
          })
        );

        return {
          ...item,
          receipts: uploaded
        };
      })
    );

    const payload = {
      ...body,
      items: itemsWithReceipts,
      id: submissionId,
      timestamp: new Date().toISOString()
    };

    const submissions = await loadSubmissions();
    submissions.push(payload);
    await saveSubmissions(submissions);

    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 200;
    res.end(JSON.stringify({ success: true }));
  } catch (err) {
    console.error(err);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Submission failed' }));
  }
}
