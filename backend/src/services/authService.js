import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { COLLECTIONS, getDoc, listDocs, updateDoc } from '../db/index.js';
import { JWT_EXPIRY, JWT_SECRET } from '../config.js';
import { unauthorized, badRequest, notFound } from './errors.js';
import { sendPasswordResetOtp, verifyOtp } from './emailService.js';

export async function login(email, password) {
  const users = await listDocs(COLLECTIONS.users, [['email', '==', String(email).toLowerCase()]]);
  const user = users[0];
  if (!user || !bcrypt.compareSync(password, user.password_hash)) throw unauthorized('Wrong email or password');
  const token = jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
  return { token, user: await sessionFor(user) };
}

export async function sessionFor(user) {
  const institution = user.institution_id ? await getDoc(COLLECTIONS.institutions, user.institution_id) : null;
  const donor = user.donor_id ? await getDoc(COLLECTIONS.donors, user.donor_id) : null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    institution_id: user.institution_id || null,
    institution_name: institution?.name || null,
    institution_category: institution?.category || null,
    institution_verified: institution?.verification_status === 'VERIFIED',
    institution_status: institution?.verification_status || null,
    donor_id: user.donor_id || null,
    donor_status: donor?.status || null,
  };
}

export async function userFromToken(token) {
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    throw unauthorized('Session expired — please sign in again');
  }
  const user = await getDoc(COLLECTIONS.users, payload.sub);
  if (!user) throw unauthorized('User no longer exists');
  return sessionFor(user);
}

/** Request a password reset OTP — sent to the user's registered email */
export async function requestPasswordReset(email) {
  const users = await listDocs(COLLECTIONS.users, [['email', '==', String(email).toLowerCase()]]);
  // Always respond the same way to prevent email enumeration
  if (!users.length) return { sent: true };
  const user = users[0];
  await sendPasswordResetOtp(user.email);
  return { sent: true };
}

/** Verify the reset OTP and save the new password */
export async function resetPassword(email, code, newPassword) {
  if (!newPassword || newPassword.length < 6) throw badRequest('Password must be at least 6 characters');

  // OTP was already verified and marked used by /auth/verify-reset-otp.
  // Here we only check a recently-used OTP exists for this email as proof the
  // frontend completed the verify step — we do NOT call verifyOtp() again.
  const { COLLECTIONS: C, listDocs: ld } = await import('../db/index.js');
  const otps = await ld(C.otps, [['email', '==', email.toLowerCase()]]);
  const valid = otps.find(o =>
    o.purpose === 'RESET_PASSWORD' &&
    o.used === true &&
    !o.invalidated &&
    new Date(o.expires_at) > new Date()  // still within original expiry window
  );
  if (!valid) throw badRequest('Reset session expired. Please start over.');

  const users = await listDocs(COLLECTIONS.users, [['email', '==', String(email).toLowerCase()]]);
  if (!users.length) throw notFound('User not found');

  const user = users[0];
  const hash = bcrypt.hashSync(newPassword, 10);
  await updateDoc(COLLECTIONS.users, user.id, { password_hash: hash });

  // Invalidate so the same OTP can't be reused for another reset
  await updateDoc(C.otps, valid.id, { invalidated: true });

  return { reset: true };
}
