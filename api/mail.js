import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

export async function executeMailAction({ to, subject, body }) {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  let transporter;
  let isTestAccount = false;

  if (host && user && pass) {
    transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user, pass }
    });
  } else {
    // Ephemeral testing account for instant zero-config email dispatch
    isTestAccount = true;
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: { user: testAccount.user, pass: testAccount.pass }
    });
  }

  const recipientEmail = to && to.includes('@')
    ? to
    : `${(to || 'recipient').toLowerCase().replace(/[^a-z0-9]/g, '')}@example.com`;

  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM || '"Voice AI Assistant" <assistant@voiceai.com>',
    to: recipientEmail,
    subject: subject || 'Message from Voice AI Assistant',
    text: body,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <div style="margin-bottom: 20px; border-bottom: 2px solid #3b82f6; padding-bottom: 12px;">
          <h2 style="margin: 0; color: #1e293b; font-size: 20px;">${subject}</h2>
        </div>
        <div style="color: #334155; font-size: 16px; line-height: 1.6; white-space: pre-line;">
          ${body}
        </div>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0 15px 0;" />
        <p style="font-size: 12px; color: #94a3b8; margin: 0;">
          Sent automatically by Voice AI Expense, Calendar & Email Assistant
        </p>
      </div>
    `
  });

  const previewUrl = isTestAccount ? nodemailer.getTestMessageUrl(info) : null;
  const encTo = encodeURIComponent(to && to !== 'recipient' ? to : '');
  const encSubject = encodeURIComponent(subject || '');
  const encBody = encodeURIComponent(body || '');
  const mailtoUrl = `mailto:${encTo}?subject=${encSubject}&body=${encBody}`;

  return {
    success: true,
    messageId: info.messageId,
    recipient: recipientEmail,
    isTestAccount,
    previewUrl,
    mailtoUrl,
    status: isTestAccount ? 'Sent to live preview inbox' : 'Sent to recipient inbox'
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  try {
    const { to, subject, body } = req.body || {};
    if (!body) {
      return res.status(400).json({ error: 'Missing required field: body' });
    }

    const result = await executeMailAction({ to, subject, body });
    return res.status(200).json(result);
  } catch (error) {
    console.error('Mail API Handler Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to dispatch email' });
  }
}
