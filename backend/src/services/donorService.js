import bcrypt from 'bcryptjs';
import { COLLECTIONS, createDoc, getDoc, listDocs, updateDoc } from '../db/index.js';
import { DEFAULT_MONTHLY_CAP, DEMO_OTP } from '../config.js';
import { computeEligibility } from './eligibility.js';
import { badRequest, notFound } from './errors.js';
import { recordAudit } from './audit.js';
import { sendVerificationOtp, verifyOtp as verifyEmailOtp } from './emailService.js';

const defaultPreferences = () => ({
  max_contacts_per_month: DEFAULT_MONTHLY_CAP,
  channel: 'IN_APP',
  availability_window: 'ANYTIME',
  preferred_institution_id: null,
  paused: false,
});

/**
 * F7 / privacy rules: donor contact details (phone, exact area) are only ever returned
 * to verified institution staff. Everyone else — including other donors and the platform
 * admin — receives a redacted record.
 */
export function publicDonor(donor, viewer) {
  const eligibility = computeEligibility(donor);
  const base = {
    id: donor.id,
    name: donor.name,
    gender: donor.gender,
    date_of_birth: donor.date_of_birth,
    blood_group_self_reported: donor.blood_group_self_reported,
    blood_group_verified: donor.blood_group_verified || null,
    status: donor.status,
    last_donation_date: donor.last_donation_date || null,
    deferral_until_date: donor.deferral_until_date || null,
    donation_type: donor.donation_type,
    patient_name: donor.patient_name || null,
    advised_not_to_donate_flag: !!donor.advised_not_to_donate_flag,
    registered_institution_id: donor.registered_institution_id || null,
    phone_verified: !!donor.phone_verified,
    consent: donor.consent || null,
    preferences: donor.preferences || defaultPreferences(),
    created_at: donor.created_at,
    eligibility,
  };
  const isSelf = viewer?.role === 'DONOR' && viewer.donor_id === donor.id;
  const isVerifiedStaff = viewer?.role === 'BLOOD_BANK_STAFF' && viewer.institution_verified;
  if (isSelf || isVerifiedStaff) {
    return { ...base, contact_phone: donor.contact_phone, area_pincode: donor.area_pincode, email: donor.email };
  }
  return { ...base, contact_phone: null, area_pincode: donor.area_pincode ? `${String(donor.area_pincode).slice(0, 3)}xxx` : null, contact_redacted: true };
}

/** F1 — registration. "Ever advised not to donate?" = Yes → PENDING_REVIEW (never auto-active). */
export async function registerDonor(input) {
  const existing = await listDocs(COLLECTIONS.donors, [['email', '==', input.email.toLowerCase()]]);
  if (existing.length) throw badRequest('A donor is already registered with this email');

  const advised = !!input.advised_not_to_donate;
  const status = advised ? 'PENDING_REVIEW' : 'PROVISIONAL';

  const donor = await createDoc(COLLECTIONS.donors, {
    name: input.name,
    email: input.email.toLowerCase(),
    gender: input.gender,
    date_of_birth: input.date_of_birth,
    blood_group_self_reported: input.blood_group,
    blood_group_verified: null,
    contact_phone: input.phone,
    area_pincode: input.area_pincode,
    last_donation_date: input.donated_before ? input.last_donation_date || null : null,
    donation_type: input.donation_type,
    patient_name: input.donation_type === 'REPLACEMENT' ? input.patient_name || null : null,
    advised_not_to_donate_flag: advised,
    status,
    deferral_until_date: null,
    phone_verified: false,
    registered_institution_id: input.institution_id || null,
    registered_via_camp_id: input.camp_id || null,
    preferences: defaultPreferences(),
    consent: {
      given: true,
      at: new Date().toISOString(),
      purpose: 'Contacting me about blood donation needs at my registered blood bank (DPDP Act 2023)',
      version: '1.0',
    },
  });

  const user = await createDoc(COLLECTIONS.users, {
    name: input.name,
    email: input.email.toLowerCase(),
    password_hash: bcrypt.hashSync(input.password, 8),
    role: 'DONOR',
    institution_id: null,
    donor_id: donor.id,
  });

  return {
    donor,
    user_id: user.id,
    otp_required: true,
    otp_hint_DO_NOT_USE: null, // replaced below
    status_message: advised
      ? 'Thanks for telling us. A blood bank staff member will review your form before you can be contacted for donation.'
      : 'Registered. Verify your phone with the code we sent you.',
  };
}

export async function verifyOtp(donorId, code) {
  const donor = await getDoc(COLLECTIONS.donors, donorId);
  if (!donor) throw notFound('Donor not found');

  // Try real email OTP first; fall back to DEMO_OTP in dev when Gmail isn't set up
  try {
    await verifyEmailOtp(donor.email, code, 'VERIFY_EMAIL');
  } catch (emailErr) {
    if (process.env.NODE_ENV !== 'production' && String(code) === String(DEMO_OTP)) {
      console.warn('[VerifyOTP] Using demo fallback code for', donor.email);
    } else {
      throw badRequest(emailErr.message);
    }
  }

  const updated = await updateDoc(COLLECTIONS.donors, donorId, {
    phone_verified: true,
    status: donor.advised_not_to_donate_flag ? 'PENDING_REVIEW' : 'ACTIVE',
  });
  return updated;
}

export async function listDonors({ institutionId, bloodGroup, status } = {}) {
  const filters = [];
  if (bloodGroup) filters.push(['blood_group_self_reported', '==', bloodGroup]);
  if (status) filters.push(['status', '==', status]);
  let donors = await listDocs(COLLECTIONS.donors, filters);
  if (institutionId) donors = donors.filter((d) => !d.registered_institution_id || d.registered_institution_id === institutionId);
  return donors;
}

/** Staff clears a PENDING_REVIEW donor (or keeps them out of the pool). */
export async function reviewDonor(donorId, { decision, deferral_until_date, note }, actor) {
  const donor = await getDoc(COLLECTIONS.donors, donorId);
  if (!donor) throw notFound('Donor not found');
  const patch = {};
  if (decision === 'CLEAR') patch.status = 'ACTIVE';
  if (decision === 'DEFER') {
    patch.status = 'ACTIVE';
    patch.deferral_until_date = deferral_until_date || null;
  }
  if (decision === 'REJECT') patch.status = 'PENDING_REVIEW';
  patch.review = { by: actor.id, by_name: actor.name, at: new Date().toISOString(), decision, note: note || null };
  const updated = await updateDoc(COLLECTIONS.donors, donorId, patch);
  await recordAudit({
    action: 'DONOR_REVIEW',
    actor,
    entity_type: 'Donor',
    entity_id: donorId,
    after: { status: updated.status, decision, deferral_until_date: updated.deferral_until_date || null },
    note,
  });
  return updated;
}

/** Staff sets a medical deferral discovered in person (F2 override). */
export async function setDeferral(donorId, deferralUntil, actor) {
  const donor = await getDoc(COLLECTIONS.donors, donorId);
  if (!donor) throw notFound('Donor not found');
  const updated = await updateDoc(COLLECTIONS.donors, donorId, { deferral_until_date: deferralUntil || null });
  await recordAudit({
    action: 'DONOR_DEFERRAL_SET',
    actor,
    entity_type: 'Donor',
    entity_id: donorId,
    before: { deferral_until_date: donor.deferral_until_date || null },
    after: { deferral_until_date: updated.deferral_until_date },
  });
  return updated;
}

export async function updatePreferences(donorId, prefs) {
  const donor = await getDoc(COLLECTIONS.donors, donorId);
  if (!donor) throw notFound('Donor not found');
  const preferences = { ...defaultPreferences(), ...(donor.preferences || {}), ...prefs };
  return updateDoc(COLLECTIONS.donors, donorId, { preferences });
}

/** F8 — donation history. Eligibility clock resets on a new donation record. */
export async function recordDonation({ donor_id, institution_id, request_id, units = 1, hb_level, date }, actor) {
  const donor = await getDoc(COLLECTIONS.donors, donor_id);
  if (!donor) throw notFound('Donor not found');
  const when = date || new Date().toISOString().slice(0, 10);
  const record = await createDoc(COLLECTIONS.donations, {
    donor_id,
    institution_id,
    request_id: request_id || null,
    units,
    hb_level: hb_level ?? null,
    date: when,
    recorded_by: actor?.id || null,
  });
  await updateDoc(COLLECTIONS.donors, donor_id, {
    last_donation_date: when,
    status: 'ACTIVE',
    blood_group_verified: donor.blood_group_verified || donor.blood_group_self_reported,
  });
  return record;
}

export async function donationHistory(donorId) {
  const rows = await listDocs(COLLECTIONS.donations, [['donor_id', '==', donorId]]);
  return rows.sort((a, b) => (a.date < b.date ? 1 : -1));
}

export { defaultPreferences };
