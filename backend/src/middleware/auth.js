import { userFromToken } from '../services/authService.js';
import { forbidden, unauthorized } from '../services/errors.js';

export async function attachUser(req, _res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return next();
  try {
    req.user = await userFromToken(header.slice(7));
    next();
  } catch (err) {
    next(err);
  }
}

export const requireAuth = (req, _res, next) => (req.user ? next() : next(unauthorized()));

export const requireRole =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden(`Requires role: ${roles.join(' or ')}`));
    next();
  };

/** Institution verification can never be bypassed — no debug flag, no env override. */
export const requireVerifiedInstitution = (req, _res, next) => {
  if (!req.user) return next(unauthorized());
  if (req.user.role !== 'BLOOD_BANK_STAFF') return next(forbidden('Blood bank staff only'));
  if (!req.user.institution_verified) {
    return next(forbidden('Your blood bank is pending platform approval and cannot act yet'));
  }
  next();
};
