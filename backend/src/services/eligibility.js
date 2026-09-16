import { ELIGIBILITY_INTERVAL_DAYS } from '../config.js';

export const DAY_MS = 24 * 60 * 60 * 1000;

export const toDate = (v) => (v instanceof Date ? v : v ? new Date(v) : null);
export const isoDay = (d) => toDate(d).toISOString().slice(0, 10);
export const addDays = (d, n) => new Date(toDate(d).getTime() + n * DAY_MS);
export const daysBetween = (a, b) => Math.floor((toDate(b) - toDate(a)) / DAY_MS);

export function intervalDaysFor(gender) {
  const key = String(gender || '').toUpperCase();
  return ELIGIBILITY_INTERVAL_DAYS[key] ?? ELIGIBILITY_INTERVAL_DAYS.OTHER;
}

/**
 * F2 — eligibility is COMPUTED ON READ, never a stored timer.
 * Rules, in precedence order:
 *  1. status PENDING_REVIEW    -> not eligible (a human must clear the donor first)
 *  2. preferences.paused       -> not eligible for contact (donor-controlled pause, F3)
 *  3. deferral_until_date in future -> staff override always wins
 *  4. last_donation_date + interval (90d male / 120d female) <= today
 *  5. never donated            -> eligible
 */
export function computeEligibility(donor, now = new Date()) {
  const today = toDate(now);
  const interval = intervalDaysFor(donor.gender);

  if (donor.status === 'PENDING_REVIEW') {
    return {
      eligible: false,
      eligibility_status: 'PENDING_REVIEW',
      reason: 'Waiting for blood bank staff review',
      next_eligible_date: null,
      interval_days: interval,
    };
  }

  const deferral = toDate(donor.deferral_until_date);
  if (deferral && deferral > today) {
    return {
      eligible: false,
      eligibility_status: 'DEFERRED',
      reason: `Blood bank staff have deferred donation until ${isoDay(deferral)}`,
      next_eligible_date: isoDay(deferral),
      interval_days: interval,
      deferral_override: true,
    };
  }

  const last = toDate(donor.last_donation_date);
  if (!last) {
    return {
      eligible: true,
      eligibility_status: 'ELIGIBLE',
      reason: 'No previous donation recorded',
      next_eligible_date: isoDay(today),
      interval_days: interval,
    };
  }

  const next = addDays(last, interval);
  if (next <= today) {
    return {
      eligible: true,
      eligibility_status: 'ELIGIBLE',
      reason: `You can donate again — last donation ${isoDay(last)}`,
      next_eligible_date: isoDay(next),
      interval_days: interval,
      days_since_last_donation: daysBetween(last, today),
    };
  }
  return {
    eligible: false,
    eligibility_status: 'WAITING',
    reason: `You can donate again from ${isoDay(next)}`,
    next_eligible_date: isoDay(next),
    interval_days: interval,
    days_since_last_donation: daysBetween(last, today),
  };
}

/** Paused donors stay eligible medically but must not be contacted (F3). */
export function contactable(donor, now = new Date()) {
  const el = computeEligibility(donor, now);
  if (!el.eligible) return { ok: false, reason: el.reason, eligibility: el };
  if (donor.preferences?.paused) return { ok: false, reason: 'Donor has paused notifications', eligibility: el };
  return { ok: true, eligibility: el };
}
