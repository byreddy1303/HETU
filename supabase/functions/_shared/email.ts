// Shared mail transport + transactional templates.
//
// Provider preference (first configured wins):
//   1. Gmail SMTP  — GMAIL_USER + GMAIL_APP_PASSWORD (unlimited recipients)
//   2. Resend      — RESEND_API_KEY + MAIL_FROM (sandbox: owner only)
//
// The Resend onboarding sandbox refuses to deliver to any address other than
// the account owner's verified email. That's fine for owner-notify but breaks
// invite-approved / decline / PIN-reset mails to third parties. Gmail SMTP
// via an App Password works from any Gmail account to any recipient.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: any;

// Supabase Edge Functions support npm: imports; nodemailer works well
// against Gmail over TCP:465 from the Deno runtime.
import nodemailer from 'npm:nodemailer@6.9.14';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  reply_to?: string;
}

export interface SendEmailResult {
  ok: boolean;
  id?: string;
  provider?: 'gmail' | 'resend';
  error?: string;
}

function normalizeFrom(raw: string, fallbackAddr: string): { from: string; addr: string } {
  // Accepts "Name <addr@x>" or "addr@x". Falls back to the plain address if
  // the header is missing so denomailer's From: is always something legal.
  const trimmed = raw.trim();
  const m = trimmed.match(/<([^>]+)>/);
  if (m) return { from: trimmed, addr: m[1] };
  if (trimmed.includes('@')) return { from: `AIR Journal <${trimmed}>`, addr: trimmed };
  return { from: `AIR Journal <${fallbackAddr}>`, addr: fallbackAddr };
}

async function sendViaGmail(input: SendEmailInput): Promise<SendEmailResult> {
  const user = Deno.env.get('GMAIL_USER');
  const pass = Deno.env.get('GMAIL_APP_PASSWORD');
  if (!user || !pass) return { ok: false, error: 'gmail not configured' };
  const fromHeader = Deno.env.get('MAIL_FROM') || `AIR Journal <${user}>`;
  const { from } = normalizeFrom(fromHeader, user);

  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user, pass }
    });
    const info = await transporter.sendMail({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      replyTo: input.reply_to
    });
    return { ok: true, provider: 'gmail', id: info?.messageId };
  } catch (e) {
    return { ok: false, provider: 'gmail', error: (e as Error).message.slice(0, 300) };
  }
}

async function sendViaResend(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('MAIL_FROM');
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY not set' };
  if (!from) return { ok: false, error: 'MAIL_FROM not set' };

  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      reply_to: input.reply_to
    })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { ok: false, provider: 'resend', error: `resend ${res.status}: ${text.slice(0, 200)}` };
  }
  const data = (await res.json().catch(() => ({}))) as { id?: string };
  return { ok: true, provider: 'resend', id: data.id };
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  // Gmail SMTP first if credentials are present — it's the one that
  // actually delivers to arbitrary recipients right now.
  if (Deno.env.get('GMAIL_USER') && Deno.env.get('GMAIL_APP_PASSWORD')) {
    const g = await sendViaGmail(input);
    if (g.ok) return g;
    // Fall through to Resend as a fallback so a Gmail hiccup doesn't kill
    // owner-notify mail (which Resend can still handle).
    console.warn('[email] gmail send failed, falling back to resend:', g.error);
  }
  return sendViaResend(input);
}

// ---------- Shared layout ---------- //

function shell(inner: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F1F5F0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#19352F;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F0;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FBFDFB;border:1px solid #D5E1D8;border-radius:16px;overflow:hidden;">
        <tr><td style="padding:28px 32px 8px 32px;border-left:3px solid #2F6F5E;">
          <p style="margin:0;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#50665F;">AIR Journal</p>
          <p style="margin:2px 0 0 0;font-size:11px;color:#657871;">the rank notebook</p>
        </td></tr>
        <tr><td style="padding:16px 32px 28px 32px;font-size:14.5px;line-height:1.65;color:#19352F;">
          ${inner}
        </td></tr>
        <tr><td style="padding:14px 32px;border-top:1px solid #D5E1D8;background:#E7EFE9;font-size:11px;color:#657871;">
          Sent by AIR Journal · invite-only · GATE 2027
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------- Templates ---------- //

export function newRequestNotification(args: {
  name: string;
  email: string;
  purpose: string;
  adminUrl: string;
}): { subject: string; html: string } {
  const inner = `
    <p style="margin:0 0 8px 0;font-size:17px;font-weight:600;">New access request</p>
    <p style="margin:0 0 20px 0;color:#50665F;">Someone is asking to join AIR Journal.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#E7EFE9;border-radius:10px;">
      <tr><td style="padding:14px 18px;">
        <p style="margin:0;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#50665F;">Name</p>
        <p style="margin:2px 0 12px 0;font-size:15px;">${escape(args.name)}</p>
        <p style="margin:0;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#50665F;">Email</p>
        <p style="margin:2px 0 12px 0;font-size:15px;">${escape(args.email)}</p>
        <p style="margin:0;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#50665F;">Purpose</p>
        <p style="margin:2px 0 0 0;font-size:14px;line-height:1.6;white-space:pre-wrap;">${escape(args.purpose)}</p>
      </td></tr>
    </table>
    <p style="margin:22px 0 8px 0;">Approve or decline from your admin panel:</p>
    <p style="margin:0;">
      <a href="${escape(args.adminUrl)}" style="display:inline-block;padding:10px 18px;background:#2F6F5E;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:600;font-size:13.5px;">Open access requests</a>
    </p>
    <p style="margin:20px 0 0 0;font-size:12px;color:#657871;">One request per email per 24 hours — spam is soft-blocked.</p>
  `;
  return {
    subject: `Access request from ${args.name}`,
    html: shell(inner)
  };
}

export function inviteApproved(args: {
  name: string;
  inviteUrl: string;
  ttlDays: number;
}): { subject: string; html: string } {
  const inner = `
    <p style="margin:0 0 8px 0;font-size:17px;font-weight:600;">You're in, ${escape(args.name.split(' ')[0] || args.name)}.</p>
    <p style="margin:0 0 20px 0;color:#50665F;">Your access request was approved. Use the link below to create your account.</p>
    <p style="margin:0 0 22px 0;">
      <a href="${escape(args.inviteUrl)}" style="display:inline-block;padding:12px 22px;background:#2F6F5E;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:600;font-size:14px;">Create my account</a>
    </p>
    <p style="margin:0 0 8px 0;font-size:12.5px;color:#50665F;">Or paste this link into your browser:</p>
    <p style="margin:0 0 22px 0;font-size:12px;color:#19352F;word-break:break-all;background:#E7EFE9;padding:10px 12px;border-radius:8px;">${escape(args.inviteUrl)}</p>
    <p style="margin:0;font-size:12.5px;color:#657871;">This link expires in ${args.ttlDays} days and can only be used once.</p>
    <hr style="border:none;border-top:1px solid #D5E1D8;margin:22px 0;">
    <p style="margin:0 0 4px 0;font-size:13px;font-weight:600;">What is AIR Journal?</p>
    <p style="margin:0;font-size:13px;color:#50665F;line-height:1.6;">A quiet workbench for GATE aspirants. Every solved question becomes data: outcome, pattern, trigger, root cause. The tool schedules re-attempts, surfaces one weekly fix, and helps compress the mistake surface without ever pinging you for engagement.</p>
  `;
  return {
    subject: 'Your AIR Journal invite',
    html: shell(inner)
  };
}

export function pinResetRequested(args: {
  name: string;
  resetUrl: string;
  ttlHours: number;
}): { subject: string; html: string } {
  const inner = `
    <p style="margin:0 0 8px 0;font-size:17px;font-weight:600;">Reset your PIN, ${escape(args.name.split(' ')[0] || args.name)}.</p>
    <p style="margin:0 0 20px 0;color:#50665F;">Someone requested a PIN reset for your AIR Journal account. If that was you, click below to set a new 6-digit PIN.</p>
    <p style="margin:0 0 22px 0;">
      <a href="${escape(args.resetUrl)}" style="display:inline-block;padding:12px 22px;background:#2F6F5E;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:600;font-size:14px;">Set a new PIN</a>
    </p>
    <p style="margin:0 0 8px 0;font-size:12.5px;color:#50665F;">Or paste this link into your browser:</p>
    <p style="margin:0 0 22px 0;font-size:12px;color:#19352F;word-break:break-all;background:#E7EFE9;padding:10px 12px;border-radius:8px;">${escape(args.resetUrl)}</p>
    <p style="margin:0;font-size:12.5px;color:#657871;">This link expires in ${args.ttlHours} hour${args.ttlHours === 1 ? '' : 's'}. If you didn't request a reset, ignore this email — your PIN stays the same.</p>
  `;
  return {
    subject: 'Reset your AIR Journal PIN',
    html: shell(inner)
  };
}

export function buddyRequestReceived(args: {
  recipientName: string;
  senderName: string;
  senderUsername: string;
  buddyUrl: string;
}): { subject: string; html: string } {
  const inner = `
    <p style="margin:0 0 8px 0;font-size:17px;font-weight:600;">${escape(args.senderName)} wants to pair up.</p>
    <p style="margin:0 0 20px 0;color:#50665F;line-height:1.65;">
      <span style="font-weight:600;">@${escape(args.senderUsername)}</span> has sent you a buddy request on AIR Journal. Accept it to open a private chat where either of you can hand the other a hard question — nothing about your tags, patterns, or performance ever crosses over.
    </p>
    <p style="margin:0 0 22px 0;">
      <a href="${escape(args.buddyUrl)}" style="display:inline-block;padding:12px 22px;background:#2F6F5E;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:600;font-size:14px;">Review the request</a>
    </p>
    <p style="margin:0;font-size:12.5px;color:#657871;">You can decline in one click. Only accept if you know who this is.</p>
  `;
  return {
    subject: `Buddy request from @${args.senderUsername}`,
    html: shell(inner)
  };
}

export function inviteDeclined(args: {
  name: string;
  reason?: string | null;
}): { subject: string; html: string } {
  const reasonBlock = args.reason
    ? `<p style="margin:16px 0 0 0;padding:12px 14px;background:#E7EFE9;border-radius:8px;font-size:13px;color:#19352F;white-space:pre-wrap;">${escape(args.reason)}</p>`
    : '';
  const inner = `
    <p style="margin:0 0 8px 0;font-size:17px;font-weight:600;">Thank you for asking, ${escape(args.name.split(' ')[0] || args.name)}.</p>
    <p style="margin:0;color:#50665F;line-height:1.7;">AIR Journal isn't a fit for this cohort right now. This is a quiet, invite-only tool built for a narrow use case — the answer isn't about you.</p>
    ${reasonBlock}
    <p style="margin:22px 0 0 0;font-size:13px;color:#657871;">Wishing you a strong GATE prep either way.</p>
  `;
  return {
    subject: 'About your AIR Journal request',
    html: shell(inner)
  };
}
