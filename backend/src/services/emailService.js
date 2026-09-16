/**
 * emailService.js — Nodemailer-based email delivery
 * Sends OTP codes for:
 *   1. Donor phone/email verification at registration
 *   2. Password reset
 */
import nodemailer from 'nodemailer';
import { COLLECTIONS, createDoc, listDocs, updateDoc } from '../db/index.js';

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_PASS = process.env.GMAIL_APP_PASSWORD; // Gmail App Password (not account password)
const OTP_EXPIRY_MINUTES = 10;

function createTransporter() {
  if (!GMAIL_USER || !GMAIL_PASS) {
    console.warn('[Email] GMAIL_USER or GMAIL_APP_PASSWORD not set — emails will not be sent.');
    return null;
  }
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_PASS },
  });
}

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** Save OTP to DB (invalidates any previous OTP for same email+purpose) */
async function saveOtp(email, code, purpose) {
  // Expire old OTPs for same email+purpose
  const existing = await listDocs(COLLECTIONS.otps, [['email', '==', email.toLowerCase()]]);
  for (const old of existing.filter(o => o.purpose === purpose && !o.used)) {
    await updateDoc(COLLECTIONS.otps, old.id, { used: true, invalidated: true });
  }

  return createDoc(COLLECTIONS.otps, {
    email: email.toLowerCase(),
    code,
    purpose, // 'VERIFY_EMAIL' | 'RESET_PASSWORD'
    used: false,
    expires_at: new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString(),
    created_at: new Date().toISOString(),
  });
}

/** Verify OTP — returns true and marks used, throws on failure */
export async function verifyOtp(email, code, purpose) {
  const rows = await listDocs(COLLECTIONS.otps, [['email', '==', email.toLowerCase()]]);
  const otp = rows
    .filter(o => o.purpose === purpose && !o.used && !o.invalidated)
    .sort((a, b) => (a.created_at > b.created_at ? -1 : 1))[0];

  if (!otp) throw new Error('No verification code found. Please request a new one.');
  if (otp.code !== String(code)) throw new Error('Incorrect verification code.');
  if (new Date(otp.expires_at) < new Date()) throw new Error('Verification code has expired. Please request a new one.');

  await updateDoc(COLLECTIONS.otps, otp.id, { used: true, used_at: new Date().toISOString() });
  return true;
}

/** Send email OTP for donor registration verification */
export async function sendVerificationOtp(email, name) {
  const code = generateOtp();
  await saveOtp(email, code, 'VERIFY_EMAIL');

  const transporter = createTransporter();
  if (!transporter) {
    console.log(`[Email] VERIFY_EMAIL OTP for ${email}: ${code} (not sent — Gmail not configured)`);
    return { code }; // return for dev fallback
  }

  await transporter.sendMail({
    from: `"Raktasetu" <${GMAIL_USER}>`,
    to: email,
    subject: 'Your Raktasetu verification code',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2 style="color:#b91c1c">🩸 Raktasetu</h2>
        <p>Hi ${name},</p>
        <p>Your email verification code is:</p>
        <div style="font-size:36px;font-weight:700;letter-spacing:8px;color:#b91c1c;background:#fff5f5;padding:20px;border-radius:8px;text-align:center;margin:16px 0">
          ${code}
        </div>
        <p style="color:#6b7280;font-size:13px">This code expires in ${OTP_EXPIRY_MINUTES} minutes. If you didn't register on Raktasetu, ignore this email.</p>
      </div>
    `,
  });

  console.log(`[Email] Verification OTP sent to ${email}`);
  return { sent: true };
}

/** Send email OTP for password reset */
export async function sendPasswordResetOtp(email) {
  const code = generateOtp();
  await saveOtp(email, code, 'RESET_PASSWORD');

  const transporter = createTransporter();
  if (!transporter) {
    console.log(`[Email] RESET_PASSWORD OTP for ${email}: ${code} (not sent — Gmail not configured)`);
    return { code };
  }

  await transporter.sendMail({
    from: `"Raktasetu" <${GMAIL_USER}>`,
    to: email,
    subject: 'Reset your Raktasetu password',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2 style="color:#b91c1c">🩸 Raktasetu</h2>
        <p>We received a request to reset your password.</p>
        <p>Your reset code is:</p>
        <div style="font-size:36px;font-weight:700;letter-spacing:8px;color:#b91c1c;background:#fff5f5;padding:20px;border-radius:8px;text-align:center;margin:16px 0">
          ${code}
        </div>
        <p style="color:#6b7280;font-size:13px">This code expires in ${OTP_EXPIRY_MINUTES} minutes. If you didn't request this, ignore this email.</p>
      </div>
    `,
  });

  console.log(`[Email] Password reset OTP sent to ${email}`);
  return { sent: true };
}
