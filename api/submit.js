import crypto from 'crypto';
import { put } from '@vercel/blob';
import { saveSubmission, parseJsonBody, sendEmail } from './_utils.js';

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
            
            const blob = await put(filename, buffer, {
              access: 'public',
              contentType: r.type || 'application/octet-stream'
            });
            
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

    await saveSubmission(payload);

    // Send email notifications
    const totalAmount = itemsWithReceipts.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);

    // Email to submitter
    const submitterEmailHtml = `
      <h2>Expense Report Submitted Successfully</h2>
      <p>Dear ${body.name},</p>
      <p>Your expense report has been submitted successfully and will be reviewed by the ESS Finance Department.</p>
      <p><strong>Submission Details:</strong></p>
      <ul>
        <li><strong>Total Amount:</strong> $${totalAmount.toFixed(2)}</li>
        <li><strong>Submission Date:</strong> ${new Date().toLocaleDateString()}</li>
        <li><strong>Invoice Date:</strong> ${body.date || 'N/A'}</li>
      </ul>
      <p>You will receive confirmation once your expense report has been reviewed and approved.</p>
      <p>If you have any questions, please contact vpfa@uottawaess.ca</p>
      <p>Thank you for your service to the Engineering Students Society.</p>
    `;

    // Email to VPFA and Finance Committee
    const adminEmailHtml = `
      <h2>New Expense Report Submitted</h2>
      <p>A new expense report has been submitted and requires review:</p>
      <p><strong>Submitter:</strong> ${body.name}</p>
      <p><strong>Email:</strong> ${body.email}</p>
      <p><strong>Phone:</strong> ${body.phone || 'N/A'}</p>
      <p><strong>Total Amount:</strong> $${totalAmount.toFixed(2)}</p>
      <p><strong>Submission Date:</strong> ${new Date().toLocaleDateString()}</p>
      <p><strong>Invoice Date:</strong> ${body.date || 'N/A'}</p>
      <p><strong>Budget:</strong> ${body.officers || 'N/A'}</p>
    `;

    // Send emails and wait for them to complete
    const emailPromises = [
      sendEmail(body.email, 'Expense Report Confirmation', submitterEmailHtml, 'financecomm@uottawaess.ca, vpfa@uottawaess.ca'),
      // sendEmail('vpfa@uottawaess.ca', 'New Expense Report', adminEmailHtml, 'financecomm@uottawaess.ca')
    ];

    // Wait for all emails to complete
    const emailResults = await Promise.allSettled(emailPromises);
    
    // Check if any emails failed
    const failedEmails = emailResults.filter(result => result.status === 'rejected');
    if (failedEmails.length > 0) {
      console.error('Some emails failed to send:', failedEmails);
      // Still return success for the form submission, but log the email failures
    }

    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 200;
    res.end(JSON.stringify({ success: true }));
  } catch (err) {
    console.error(err);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Submission failed' }));
  }
}
