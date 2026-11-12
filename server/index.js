import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import nodemailer from 'nodemailer';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Email from './models/Email.js';
import { requireAuth } from './middleware/auth.js';

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 10000;

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false }));
app.use('/api/mail/send', rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false }));

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const smtpReady = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.FROM_EMAIL);

app.get('/api/health', (_req, res) => res.json({ status: 'ok', database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' }));

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD || !process.env.JWT_SECRET) {
      return res.status(503).json({ message: 'Admin login is not configured on the server.' });
    }
    const validEmail = String(email || '').toLowerCase().trim() === process.env.ADMIN_EMAIL.toLowerCase().trim();
    const storedPassword = process.env.ADMIN_PASSWORD;
    const passwordMatches = storedPassword.startsWith('$2')
      ? await bcrypt.compare(String(password || ''), storedPassword)
      : String(password || '') === storedPassword;
    if (!validEmail || !passwordMatches) return res.status(401).json({ message: 'Incorrect email or password.' });
    const token = jwt.sign({ email: process.env.ADMIN_EMAIL }, process.env.JWT_SECRET, { expiresIn: '12h' });
    res.json({ token, email: process.env.ADMIN_EMAIL });
  } catch (error) {
    res.status(500).json({ message: 'Unable to sign in.', error: error.message });
  }
});

app.get('/api/mail/history', requireAuth, async (_req, res) => {
  try {
    const records = await Email.find().sort({ createdAt: -1 }).limit(100).lean();
    res.json(records);
  } catch (error) {
    res.status(500).json({ message: 'Could not load email history.', error: error.message });
  }
});

app.get('/api/mail/stats', requireAuth, async (_req, res) => {
  try {
    const totals = await Email.aggregate([{ $group: {
      _id: null,
      campaigns: { $sum: 1 },
      recipients: { $sum: '$totalRecipients' },
      sent: { $sum: '$sentCount' },
      failed: { $sum: '$failedCount' }
    } }]);
    res.json(totals[0] || { campaigns: 0, recipients: 0, sent: 0, failed: 0 });
  } catch (error) {
    res.status(500).json({ message: 'Could not load analytics.', error: error.message });
  }
});

app.post('/api/mail/send', requireAuth, async (req, res) => {
  const { subject, body, recipients, consent } = req.body || {};
  if (!subject?.trim() || !body?.trim()) return res.status(400).json({ message: 'Subject and email body are required.' });
  if (!Array.isArray(recipients) || recipients.length === 0) return res.status(400).json({ message: 'Add at least one recipient email.' });
  if (recipients.length > 50) return res.status(400).json({ message: 'A campaign can contain up to 50 recipients.' });
  if (consent !== true) return res.status(400).json({ message: 'Confirm that recipients have agreed to receive these emails.' });
  if (!smtpReady()) return res.status(503).json({ message: 'SMTP is not configured. Add SMTP settings in your environment variables.' });

  const cleaned = [...new Set(recipients.map(value => String(value).trim().toLowerCase()).filter(Boolean))];
  const invalid = cleaned.filter(address => !emailPattern.test(address));
  if (invalid.length) return res.status(400).json({ message: `Invalid email address(es): ${invalid.slice(0, 5).join(', ')}` });
  if (!cleaned.length) return res.status(400).json({ message: 'No valid recipients were provided.' });

  let record;
  try {
    record = await Email.create({ subject: subject.trim(), body: body.trim(), totalRecipients: cleaned.length, recipients: [] });
  } catch (error) {
    return res.status(500).json({ message: 'Could not create email history record.', error: error.message });
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 465,
    secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000
  });

  const outcomes = [];
  for (const address of cleaned) {
    try {
      await transporter.sendMail({
        from: process.env.FROM_EMAIL,
        to: address,
        subject: subject.trim(),
        text: body.trim(),
        html: `<div style="font-family:Arial,sans-serif;white-space:pre-wrap;line-height:1.6">${escapeHtml(body.trim())}</div><hr><small>If you no longer wish to receive these emails, reply and ask to be removed.</small>`
      });
      outcomes.push({ email: address, status: 'sent', error: '' });
    } catch (error) {
      outcomes.push({ email: address, status: 'failed', error: String(error.message || 'Delivery failed').slice(0, 300) });
    }
  }
  await Email.findByIdAndUpdate(record._id, {
    recipients: outcomes,
    sentCount: outcomes.filter(item => item.status === 'sent').length,
    failedCount: outcomes.filter(item => item.status === 'failed').length
  });
  res.json({ message: 'Campaign processing completed.', campaignId: record._id, sentCount: outcomes.filter(item => item.status === 'sent').length, failedCount: outcomes.filter(item => item.status === 'failed').length, outcomes });
});

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

app.use(express.static(path.join(rootDir, 'client', 'dist')));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(rootDir, 'client', 'dist', 'index.html'));
});
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: 'Unexpected server error.' });
});

async function start() {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is missing. Add it to your .env file or hosting environment.');
    process.exit(1);
  }
  try {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
    console.log('MongoDB connected: bulkmail');
    app.listen(PORT, '0.0.0.0', () => console.log(`BulkMail server running on port ${PORT}`));
  } catch (error) {
    console.error('Startup failed: MongoDB connection error:', error.message);
    process.exit(1);
  }
}

start();
