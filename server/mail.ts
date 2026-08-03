import nodemailer, { type Transporter } from 'nodemailer';
import { HttpError } from './http.js';

let transporter: Transporter | undefined;

function getTransporter(): Transporter {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) {
    throw new HttpError(500, 'Email is not configured on the server (SMTP_USER / SMTP_PASS).');
  }

  if (!transporter) {
    const port = Number(process.env.SMTP_PORT || 465);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port,
      secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
      auth: { user, pass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
      pool: true,
      maxConnections: 2,
    });
  }
  return transporter;
}

export async function sendOtpEmail(to: string, code: string): Promise<void> {
  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f6f7f9;padding:32px 16px">
  <div style="max-width:440px;margin:0 auto;background:#ffffff;border:1px solid #e9e9ec;border-radius:20px;padding:32px;text-align:center">
    <div style="font-size:13px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#6b6b76">Expense Split</div>
    <h1 style="font-size:20px;color:#111114;margin:16px 0 8px">Your sign-in code</h1>
    <p style="font-size:14px;color:#6b6b76;margin:0 0 24px">Enter this code to finish signing in. It expires in 10 minutes.</p>
    <div style="font-size:34px;font-weight:800;letter-spacing:.32em;color:#111114;background:#f6f7f9;border-radius:14px;padding:18px 12px 18px 22px">${code}</div>
    <p style="font-size:12px;color:#9a9aa5;margin:24px 0 0">If you didn't request this, you can safely ignore the email.</p>
  </div>
</div>`;

  try {
    await getTransporter().sendMail({
      from: process.env.SMTP_FROM || `Expense Split <${process.env.SMTP_USER}>`,
      to,
      subject: `${code} is your Expense Split sign-in code`,
      text: `Your Expense Split sign-in code is ${code}. It expires in 10 minutes.`,
      html,
    });
  } catch (error) {
    if (error instanceof HttpError) throw error;
    const detail = error instanceof Error ? error.message : 'unknown error';
    throw new HttpError(502, `Could not send the sign-in email (${detail}).`);
  }
}
