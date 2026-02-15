import { jsPDF } from 'jspdf';
import { loadSubmissionById, requireAdmin } from './_utils.js';

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) {
    res.statusCode = 302;
    res.setHeader('Location', '/login?error=2');
    return res.end();
  }

  const query = req.url.split('?')[1] || '';
  const params = new URLSearchParams(query);
  const id = params.get('id');

  if (!id) {
    res.statusCode = 400;
    res.end('Missing submission ID');
    return;
  }

  const submission = await loadSubmissionById(id);
  if (!submission) {
    res.statusCode = 404;
    res.end('Submission not found');
    return;
  }

  // Create PDF
  const doc = new jsPDF();
  let y = 20;

  // Title
  doc.setFontSize(16);
  doc.text('Expense Report', 20, y);
  y += 20;

  // Basic info
  doc.setFontSize(12);
  doc.text(`Name: ${submission.name || 'N/A'}`, 20, y);
  y += 10;
  doc.text(`Email: ${submission.email || 'N/A'}`, 20, y);
  y += 10;
  doc.text(`Phone number: ${submission.phone || 'N/A'}`, 20, y);
  y += 10;
  doc.text(`Date: ${submission.date || 'N/A'}`, 20, y);
  y += 20;

  // Table header
  doc.text('Description', 20, y);
  doc.text('Budget Line', 100, y);
  doc.text('Amount', 160, y);
  y += 5;
  doc.line(20, y, 190, y); // horizontal line
  y += 10;

  // Items
  let total = 0;
  if (submission.items && Array.isArray(submission.items)) {
    submission.items.forEach(item => {
      if (item && typeof item === 'object') {
        const amount = parseFloat(item.amount || 0);
        total += amount;

        // Handle long descriptions
        const descLines = doc.splitTextToSize(item.description || 'N/A', 70);
        doc.text(descLines, 20, y);
        const descHeight = descLines.length * 5;

        doc.text(item.budgetLine || 'N/A', 100, y);
        doc.text(`$${amount.toFixed(2)}`, 160, y);

        y += Math.max(descHeight, 10);
      }
    });
  }

  // Total row
  y += 5;
  doc.line(20, y, 190, y); // horizontal line
  y += 10;
  doc.setFont(undefined, 'bold');
  doc.text('Total', 100, y);
  doc.text(`$${total.toFixed(2)}`, 160, y);
  doc.setFont(undefined, 'normal');
  y += 20;

  // Signature
  if (submission.signature) {
    doc.text(`Signature: ${submission.signature}`, 20, y);
    y += 10;
  }
  if (submission.signatureDate) {
    doc.text(`Date of signature: ${submission.signatureDate}`, 20, y);
  }

  // Send PDF
  const pdfBuffer = doc.output('arraybuffer');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="expense-report-${id}.pdf"`);
  res.statusCode = 200;
  res.end(Buffer.from(pdfBuffer));
}