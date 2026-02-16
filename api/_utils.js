import crypto from 'crypto';
import { list, put } from '@vercel/blob';
import { parse as parseCookie, serialize as serializeCookie } from 'cookie';
import fs from 'fs/promises';
import { jsPDF } from 'jspdf';
import fsSync from 'fs';
import path from 'path';
import imageSize from 'image-size';
import nodemailer from 'nodemailer';

export async function parseJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export async function parseFormBody(req) {
  const contentType = req.headers['content-type'] || '';
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const params = new URLSearchParams(raw);
    const result = {};
    for (const [key, value] of params) {
      result[key] = value;
    }
    return result;
  } else if (contentType.includes('multipart/form-data')) {
    // Simple multipart parser for form data
    const boundary = contentType.split('boundary=')[1];
    if (!boundary) return {};
    const parts = raw.split(`--${boundary}`);
    const result = {};
    for (const part of parts) {
      if (part.trim() && !part.includes('--')) {
        const lines = part.split('\r\n');
        const nameMatch = lines[1]?.match(/name="([^"]+)"/);
        if (nameMatch) {
          const name = nameMatch[1];
          const value = lines.slice(3).join('\r\n').trim();
          result[name] = value;
        }
      }
    }
    return result;
  }

  return {};
}

export function getCookies(req) {
  return parseCookie(req.headers.cookie || '');
}

export function setCookie(res, name, value, options = {}) {
  const serialized = serializeCookie(name, value, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    ...options
  });
  res.setHeader('Set-Cookie', serialized);
}

export function clearCookie(res, name) {
  const serialized = serializeCookie(name, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0
  });
  res.setHeader('Set-Cookie', serialized);
}

export function signToken(payload, secret) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    .toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const data = `${header}.${body}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('base64url');
  return `${data}.${signature}`;
}

export function verifyToken(token, secret) {
  if (!token) return null;
  const [header, body, signature] = token.split('.');
  if (!header || !body || !signature) return null;
  const data = `${header}.${body}`;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('base64url');
  if (expected !== signature) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

export function requireAdmin(req, res) {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) return false;
  const cookies = getCookies(req);
  const payload = verifyToken(cookies.admin_token, secret);
  if (!payload || !payload.exp || Date.now() > payload.exp) return false;
  return true;
}

const SUBMISSIONS_INDEX_KEY = 'submissions-index.json';

// Metadata-only version for listing (avoids loading full submission data)
export async function loadSubmissionsMetadata(limit = 50, offset = 0) {
  try {
    const { blobs } = await list();
    const indexBlob = blobs.find((b) => b.pathname === SUBMISSIONS_INDEX_KEY);

    if (!indexBlob) {
      // Check for old single file
      const oldBlob = blobs.find((b) => b.pathname === 'submissions.json');
      if (oldBlob) {
        console.log('Migrating from old system...');
        const response = await fetch(oldBlob.downloadUrl || oldBlob.url);
        if (response.ok) {
          const submissions = await response.json();
          if (Array.isArray(submissions)) {
            await migrateToNewSystem(submissions);
            return submissions.slice(offset, offset + limit).map(createMetadata);
          }
        }
      }
      return [];
    }

    const indexResponse = await fetch(indexBlob.downloadUrl || indexBlob.url);
    if (!indexResponse.ok) return [];

    const index = await indexResponse.json();
    const submissionIds = Array.isArray(index.submissionIds) ? index.submissionIds : [];

    // Load metadata for the requested range
    const metadata = [];
    const endIndex = Math.min(submissionIds.length, offset + limit);

    for (let i = offset; i < endIndex; i++) {
      const submissionId = submissionIds[i];
      try {
        const submissionBlob = blobs.find((b) => b.pathname === `submission-${submissionId}.json`);
        if (submissionBlob) {
          const response = await fetch(submissionBlob.downloadUrl || submissionBlob.url);
          if (response.ok) {
            const submission = await response.json();
            metadata.push(createMetadata(submission));
          }
        }
      } catch (err) {
        console.error(`Failed to load metadata for ${submissionId}:`, err);
      }
    }

    return metadata;
  } catch (err) {
    console.error('Error loading submissions metadata:', err);
    return [];
  }
}

// Load full submission data by ID
export async function loadSubmission(submissionId) {
  try {
    const { blobs } = await list();
    const submissionBlob = blobs.find((b) => b.pathname === `submission-${submissionId}.json`);

    if (!submissionBlob) return null;

    const response = await fetch(submissionBlob.downloadUrl || submissionBlob.url);
    return response.ok ? await response.json() : null;
  } catch (err) {
    console.error(`Error loading submission ${submissionId}:`, err);
    return null;
  }
}

// Create metadata object (summary info for listing, more fields for display)
function createMetadata(submission) {
  const total = submission.total || (submission.items ?
    submission.items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0) : 0);

  return {
    id: submission.id,
    name: submission.name,
    email: submission.email,
    phone: submission.phone,
    date: submission.date,
    total: total,
    timestamp: submission.timestamp,
    itemCount: submission.items ? submission.items.length : 0,
    hasReceipts: submission.items ? submission.items.some(item => item.receipts && item.receipts.length > 0) : false,
    signature: submission.signature,
    signatureDate: submission.signatureDate,
    officers: submission.officers
  };
}

// Migrate from old single-file system to new system
async function migrateToNewSystem(submissions) {
  console.log(`Migrating ${submissions.length} submissions to new system...`);

  const submissionIds = [];
  for (const submission of submissions) {
    const submissionId = submission.id;
    submissionIds.push(submissionId);

    try {
      await put(`submission-${submissionId}.json`, JSON.stringify(submission, null, 2), {
        access: 'public',
        contentType: 'application/json'
      });
    } catch (err) {
      console.error(`Failed to migrate submission ${submissionId}:`, err);
    }
  }

  // Save index
  const index = { submissionIds, migratedAt: new Date().toISOString() };
  await put(SUBMISSIONS_INDEX_KEY, JSON.stringify(index, null, 2), {
    access: 'public',
    contentType: 'application/json'
  });

  console.log('Migration complete');
}

export async function saveSubmission(submission) {
  try {
    const submissionId = submission.id;
    console.log('Saving individual submission:', submissionId);

    // Save the full submission
    await put(`submission-${submissionId}.json`, JSON.stringify(submission, null, 2), {
      access: 'public',
      contentType: 'application/json'
    });

    console.log('Successfully saved submission:', submissionId);
  } catch (err) {
    console.error('Error saving submission:', err);
    throw err;
  }
}

// Load all submissions by scanning blobs
export async function loadSubmissions() {
  try {
    console.log('Listing blobs...');
    const { blobs } = await list();
    console.log('Found', blobs.length, 'blobs total');

    // Find all submission blobs
    const submissionBlobs = blobs.filter((b) => b.pathname.startsWith('submission-') && b.pathname.endsWith('.json'));
    console.log('Found submission blobs:', submissionBlobs.length);

    const submissions = [];
    for (const blob of submissionBlobs) {
      try {
        const submissionResponse = await fetch(blob.downloadUrl || blob.url);
        if (!submissionResponse.ok) {
          console.warn(`Failed to fetch submission blob: ${blob.pathname}`);
          continue;
        }

        const submission = await submissionResponse.json();
        submissions.push(submission);
      } catch (err) {
        console.error(`Error loading submission from ${blob.pathname}:`, err);
      }
    }

    // Sort by timestamp, most recent first
    submissions.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

    console.log('Loaded submissions:', submissions.length);
    return submissions;
  } catch (err) {
    console.error('Error loading submissions:', err);
    return [];
  }
}

export async function saveSubmissions(submissions) {
  try {
    const jsonString = JSON.stringify(submissions, null, 2);
    console.log('Saving submissions, count:', submissions.length, 'size:', jsonString.length);

    const result = await put('submissions.json', jsonString, {
      access: 'public',
      contentType: 'application/json'
    });

    console.log('Successfully saved to blob:', result.url);
  } catch (err) {
    console.error('Blob storage error:', err);
    throw err; // Re-throw so submit.js knows it failed
  }

  // Also save to local file for development
  try {
    await fs.writeFile('./submissions.json', JSON.stringify(submissions, null, 2));
    console.log('Also saved to local file');
  } catch (err) {
    // Local file write is optional, don't fail if it errors
    console.error('Failed to save submissions to local file:', err);
  }
}

// Load a specific submission by ID
export async function loadSubmissionById(id) {
  try {
    console.log('Loading submission by ID:', id);
    const { blobs } = await list();
    const submissionBlob = blobs.find((b) => b.pathname === `submission-${id}.json`);
    
    if (!submissionBlob) {
      console.log('Submission not found:', id);
      return null;
    }

    const submissionResponse = await fetch(submissionBlob.downloadUrl || submissionBlob.url);
    if (!submissionResponse.ok) {
      console.warn(`Failed to fetch submission blob: ${submissionBlob.pathname}`);
      return null;
    }

    const submission = await submissionResponse.json();
    console.log('Loaded submission:', id);
    return submission;
  } catch (err) {
    console.error('Error loading submission by ID:', id, err);
    return null;
  }
}

// Generate PDF buffer from submission
export async function generatePDF(submission) {
  // Create PDF
  const doc = new jsPDF();

  // Add banner image if exists
  const imagePath = path.join(process.cwd(), 'public', 'ess-banner.png');
  let y = 40;
  if (fsSync.existsSync(imagePath)) {
    const imageBuffer = fsSync.readFileSync(imagePath);
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
  if (submission.signature) {
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
          }
        } catch (err) {
          console.error('Failed to load receipt image:', err);
        }
      }
    }
  }

  // Return PDF buffer
  const pdfBuffer = doc.output('arraybuffer');
  return Buffer.from(pdfBuffer);
}

// Send email with PDF attachment
export async function sendEmailWithPDF(pdfBuffer, submission) {
  const transporter = nodemailer.createTransporter({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: process.env.SMTP_PORT || 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const mailOptions = {
    from: process.env.NO_REPLY_EMAIL || process.env.EMAIL_USER,
    to: process.env.ADMIN_EMAIL || 'vpfa@uottawaess.ca', // Change to your email
    subject: `New Expense Report Submission - ${submission.name}`,
    text: `A new expense report has been submitted by ${submission.name} (${submission.email}). Please find the PDF attached.`,
    attachments: [
      {
        filename: `expense-report-${submission.id}.pdf`,
        content: pdfBuffer,
      },
    ],
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Email sent successfully');
  } catch (error) {
    console.error('Error sending email:', error);
  }
}
