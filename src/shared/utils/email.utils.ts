import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../../config/env';
import { logger } from '../logger';

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
    return null;
  }
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465, // true for 465 (SSL), false for 587 (STARTTLS)
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  });
  return transporter;
}

// ---------------------------------------------------------------------------
// HTML templates — small, inline-styled card so they render in any client.
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderCard(opts: {
  heading: string;
  intro: string;
  email: string;
  password: string;
  ctaLabel: string;
  ctaUrl: string;
  footerNote: string;
}): string {
  const {
    heading,
    intro,
    email,
    password,
    ctaLabel,
    ctaUrl,
    footerNote,
  } = opts;
  return `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 12px rgba(15,23,42,.08);">
          <tr>
            <td style="background:#0f172a;padding:24px 28px;color:#f8fafc;">
              <div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#a5b4fc;">LMS Platform</div>
              <div style="font-size:22px;font-weight:600;margin-top:6px;">${escapeHtml(heading)}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;font-size:15px;line-height:1.55;color:#334155;">
              <p style="margin:0 0 16px 0;">${escapeHtml(intro)}</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin:18px 0;">
                <tr>
                  <td style="padding:14px 18px;">
                    <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.06em;">Email</div>
                    <div style="font-size:15px;font-weight:500;color:#0f172a;margin-top:2px;">${escapeHtml(email)}</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:14px 18px;border-top:1px solid #e2e8f0;">
                    <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.06em;">Temporary password</div>
                    <div style="font-family:'SFMono-Regular',Consolas,'Liberation Mono',monospace;font-size:15px;font-weight:600;color:#0f172a;margin-top:2px;letter-spacing:.02em;">${escapeHtml(password)}</div>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 22px 0;color:#475569;">For security, please change this password immediately after signing in.</p>
              <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-weight:500;padding:11px 22px;border-radius:8px;">${escapeHtml(ctaLabel)}</a>
              <p style="margin:22px 0 0 0;font-size:13px;color:#94a3b8;">${escapeHtml(footerNote)}</p>
            </td>
          </tr>
        </table>
        <p style="margin:18px 0 0 0;font-size:12px;color:#94a3b8;">© LMS Platform</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Public API — both functions are non-blocking and never throw on transport
// errors; failures are logged so the calling flow (e.g. user creation) can
// continue.
// ---------------------------------------------------------------------------

export async function sendWelcomeEmail(
  to: string,
  name: string,
  password: string,
): Promise<void> {
  const subject = 'Welcome to LMS Platform — Your Login Credentials';
  const html = renderCard({
    heading: `Welcome aboard, ${name}!`,
    intro:
      'Your LMS account has been created. Use the credentials below to sign in for the first time.',
    email: to,
    password,
    ctaLabel: 'Sign in',
    ctaUrl: `${env.FRONTEND_URL}/login`,
    footerNote: "If you didn't expect this email, you can safely ignore it.",
  });

  try {
    const transport = getTransporter();
    if (!transport) {
      logger.warn('email:skipped welcome (SMTP not configured)', { to });
      return;
    }
    await transport.sendMail({
      from: env.SMTP_FROM,
      to,
      subject,
      html,
      text: `Welcome, ${name}.\n\nEmail: ${to}\nTemporary password: ${password}\n\nPlease change your password after signing in: ${env.FRONTEND_URL}/login`,
    });
    logger.info('email:sent welcome', { to });
  } catch (err) {
    logger.error('email:failed welcome', { to, error: err });
  }
}

export async function sendPasswordResetEmail(
  to: string,
  name: string,
  newPassword: string,
): Promise<void> {
  const subject = 'LMS Platform — Your Password Has Been Reset';
  const html = renderCard({
    heading: 'Your password was reset',
    intro: `Hi ${name}, an administrator just reset your LMS password. Use the new temporary password below to sign in, then change it right away.`,
    email: to,
    password: newPassword,
    ctaLabel: 'Sign in',
    ctaUrl: `${env.FRONTEND_URL}/login`,
    footerNote:
      "If you didn't request this, contact your administrator immediately.",
  });

  try {
    const transport = getTransporter();
    if (!transport) {
      logger.warn('email:skipped password-reset (SMTP not configured)', { to });
      return;
    }
    await transport.sendMail({
      from: env.SMTP_FROM,
      to,
      subject,
      html,
      text: `Hi ${name},\n\nYour password has been reset.\nEmail: ${to}\nNew temporary password: ${newPassword}\n\nSign in and change it: ${env.FRONTEND_URL}/login`,
    });
    logger.info('email:sent password-reset', { to });
  } catch (err) {
    logger.error('email:failed password-reset', { to, error: err });
  }
}
