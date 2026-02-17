import { jsPDF } from 'jspdf';
import { loadSubmissionById, requireAdmin } from './_utils.js';
import fs from 'fs';
import path from 'path';
import imageSize from 'image-size';

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

  // Add banner image if exists
  const imagePath = path.join(process.cwd(), 'public', 'ess-banner.png');
  let y = 40;
  if (fs.existsSync(imagePath)) {
    const imageBuffer = fs.readFileSync(imagePath);
    const dimensions = imageSize(imageBuffer);
    const imageBase64 = imageBuffer.toString('base64');
    // Scale to fit width 100, height proportional
    const aspectRatio = dimensions.height / dimensions.width;
    const imgWidth = 100;
    const imgHeight = imgWidth * aspectRatio;
    const imgType = dimensions.type.toUpperCase();
    doc.addImage(imageBase64, imgType, 10, 10, imgWidth, imgHeight);
    y = 10 + imgHeight + 15; // Adjust y to below the image
  }

  // Title
  doc.setFont('times', 'bold');
  doc.setFontSize(20);
  const titleText = 'Form F1 - Expense Report';
  const textWidth = doc.getTextWidth(titleText);
  const pageWidth = doc.internal.pageSize.getWidth();
  const x = (pageWidth - textWidth) / 2;
  doc.text(titleText, x, y);
  y += 20;

  doc.setFont('times', 'normal');

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
  doc.setFont('times', 'bold');
  doc.text('Description', 20, y);
  doc.text('Budget Line', 100, y);
  doc.text('Amount', 160, y);
  y += 5;
  doc.setFont('times', 'normal');
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
  doc.setFont('times', 'bold');
  doc.text('Total', 100, y);
  doc.text(`$${total.toFixed(2)}`, 160, y);
  doc.setFont('times', 'normal');
  y += 20;

  // Signature
  if (submission.signature && submission.signature.startsWith('data:image/')) {
    // Extract base64 data from data URL
    const base64Data = submission.signature.split(',')[1];
    // Add signature image
    doc.addImage(base64Data, 'PNG', 20, y, 80, 40); // Adjust size as needed
    y += 50;
  } else if (submission.signature) {
    // Fallback for text signatures
    doc.text(`Signature: ${submission.signature}`, 20, y);
    y += 10;
  }
  if (submission.signatureDate) {
    doc.text(`Date of signature: ${submission.signatureDate}`, 20, y);
  }

  // Add receipt images on new pages
  if (submission.items && Array.isArray(submission.items)) {
    for (const item of submission.items) {
      if (item && typeof item === 'object' && item.receipts && item.receipts.length > 0) {
        const receipt = item.receipts[0]; // Use the first receipt
        doc.addPage();
        let y = 20;
        doc.setFont('times', 'bold');
        doc.setFontSize(16);
        const title = `Receipt for: ${item.description || 'N/A'}`;
        const textWidth = doc.getTextWidth(title);
        const pageWidth = doc.internal.pageSize.getWidth();
        const x = (pageWidth - textWidth) / 2;
        doc.text(title, x, y);
        y += 15;
        // Add image
        try {
          const response = await fetch(receipt.url);
          if (response.ok) {
            const imageBuffer = Buffer.from(await response.arrayBuffer());
            const dimensions = imageSize(imageBuffer);
            const imageBase64 = imageBuffer.toString('base64');
            // Calculate dimensions to fit page
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const margin = 20;
            const maxWidth = pageWidth - 2 * margin;
            const aspectRatio = dimensions.height / dimensions.width;
            let imgWidth = maxWidth;
            let imgHeight = imgWidth * aspectRatio;
            const maxHeight = pageHeight - y - 50; // leave space for text
            if (imgHeight > maxHeight) {
              imgHeight = maxHeight;
              imgWidth = imgHeight / aspectRatio;
            }
            const imgX = (pageWidth - imgWidth) / 2;
            doc.addImage(`data:image/${receipt.type.split('/')[1] || 'png'};base64,${imageBase64}`, receipt.type.split('/')[1].toUpperCase() || 'PNG', imgX, y, imgWidth, imgHeight);
            y += imgHeight + 10; // Move y below the image

            // Add notes if available
            if (item.notes && item.notes.trim()) {
              doc.setFont('times', 'normal');
              doc.setFontSize(12);
              const notesLines = doc.splitTextToSize(`Notes: ${item.notes}`, maxWidth);
              doc.text(notesLines, margin, y);
              y += notesLines.length * 5 + 10; // Adjust y for notes height
            }
          }
        } catch (err) {
          console.error('Failed to load receipt image:', err);
        }
      }
    }
  }

  // Send PDF
  const pdfBuffer = doc.output('arraybuffer');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="expense-report-${id}.pdf"`);
  res.statusCode = 200;
  res.end(Buffer.from(pdfBuffer));
}