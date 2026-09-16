import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { COLLECTIONS, getDoc, listDocs, updateDoc } from '../db/index.js';
import { JWT_EXPIRY, JWT_SECRET } from '../config.js';
import { unauthorized, badRequest, notFound } from './errors.js';

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

/** Request a password reset OTP */
export async function requestPasswordReset(email) {
  const users = await listDocs(COLLECTIONS.users, [['email', '==', String(email).toLowerCase()]]);
  if (!users.length) return { sent: true }; // don't reveal if email exists
  const { sendPasswordResetOtp } = await import('./emailService.js');
  await sendPasswordResetOtp(users[0].email);
  return { sent: true };
}

/** Verify reset OTP and save new password */
export async function resetPassword(email, code, newPassword) {
  if (!newPassword || newPassword.length < 6) throw badRequest('Password must be at least 6 characters');
  const { verifyOtp } = await import('./emailService.js');
  await verifyOtp(email.toLowerCase(), code, 'RESET_PASSWORD');
  const users = await listDocs(COLLECTIONS.users, [['email', '==', String(email).toLowerCase()]]);
  if (!users.length) throw notFound('User not found');
  const hash = bcrypt.hashSync(newPassword, 10);
  await updateDoc(COLLECTIONS.users, users[0].id, { password_hash: hash });
  return { reset: true };
}