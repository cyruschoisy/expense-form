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
        const uploaded = [];
        for (let j = 0; j < receipts.length; j++) {
          const r = receipts[j];
          try {
            const base64 = String(r.data || '').split(',')[1] || '';
            if (!base64) {
              console.error(`No base64 data for receipt ${j} in item ${i}`);
              continue;
            }
            
            const buffer = Buffer.from(base64, 'base64');
            const filename = `${submissionId}_${i}_${j}_${r.name || 'receipt'}`;
            
            console.log(`Uploading receipt ${j} for item ${i}: ${filename}, size: ${buffer.length} bytes`);
            
            const blob = await put(filename, buffer, {
              access: 'public',
              contentType: r.type || 'application/octet-stream'
            });
            
            console.log(`Successfully uploaded: ${blob.url}`);
            
            uploaded.push({
              originalName: r.name,
              type: r.type,
              url: blob.url,
              pathname: blob.pathname
            });
            
            // Add small delay between uploads to avoid rate limits
            if (j < receipts.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 100));
            }
          } catch (uploadErr) {
            console.error(`Failed to upload receipt ${j} for item ${i}:`, uploadErr);
            // Continue with other receipts instead of failing entire submission
          }
        }

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
