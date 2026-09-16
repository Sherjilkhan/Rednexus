import bcrypt from 'bcryptjs';
import { COLLECTIONS, createDoc, getDoc, listDocs, updateDoc } from '../db/index.js';
import { badRequest, notFound } from './errors.js';
import { recordAudit } from './audit.js';

/**
 * Institutions are a single type (BLOOD_BANK) with a category of IN_HOUSE or EXTERNAL.
 * Verification is a hard prerequisite for every institution action and can never be bypassed.
 */
export async function registerInstitution(input) {
  const institution = await createDoc(COLLECTIONS.institutions, {
    name: input.name,
    type: 'BLOOD_BANK',
    category: input.category,
    linked_hospital_name: input.category === 'IN_HOUSE' ? input.linked_hospital_name || null : null,
    verification_status: 'PENDING',
    location: { city: input.city, state: input.state, pincode: input.pincode },
    licence_number: input.licence_number || null,
    contact_email: input.contact_email,
    contact_phone: input.contact_phone,
    verified_by: null,
    verified_at: null,
  });

  let staff = null;
  if (input.staff) {
    staff = await createStaffUser(institution.id, input.staff);
  }
  return { institution, staff: staff ? { id: staff.id, name: staff.name, email: staff.email } : null };
}

export async function createStaffUser(institutionId, staff) {
  const existing = await listDocs(COLLECTIONS.users, [['email', '==', staff.email.toLowerCase()]]);
  if (existing.length) throw badRequest('A user already exists with this email');
  return createDoc(COLLECTIONS.users, {
    name: staff.name,
    email: staff.email.toLowerCase(),
    password_hash: bcrypt.hashSync(staff.password, 8),
    role: 'BLOOD_BANK_STAFF',
    institution_id: institutionId,
    donor_id: null,
  });
}

export async function listInstitutions(status) {
  const rows = status ? await listDocs(COLLECTIONS.institutions, [['verification_status', '==', status]]) : await listDocs(COLLECTIONS.institutions);
  const users = await listDocs(COLLECTIONS.users, [['role', '==', 'BLOOD_BANK_STAFF']]);
  return rows.map((i) => ({
    ...i,
    staff_count: users.filter((u) => u.institution_id === i.id).length,
    staff: users.filter((u) => u.institution_id === i.id).map((u) => ({ id: u.id, name: u.name, email: u.email })),
  }));
}

/**
 * PLATFORM_ADMIN verification. A blood bank cannot go live without at least one
 * BLOOD_BANK_STAFF account — enforced here, at verification time.
 */
export async function setVerification(institutionId, decision, actor, note) {
  const institution = await getDoc(COLLECTIONS.institutions, institutionId);
  if (!institution) throw notFound('Institution not found');
  if (decision === 'VERIFIED') {
    const staff = await listDocs(COLLECTIONS.users, [['institution_id', '==', institutionId]]);
    if (!staff.some((u) => u.role === 'BLOOD_BANK_STAFF')) {
      throw badRequest('Cannot verify: this blood bank has no BLOOD_BANK_STAFF account yet');
    }
  }
  const updated = await updateDoc(COLLECTIONS.institutions, institutionId, {
    verification_status: decision,
    verified_by: decision === 'VERIFIED' ? actor.id : null,
    verified_by_name: decision === 'VERIFIED' ? actor.name : null,
    verified_at: decision === 'VERIFIED' ? new Date().toISOString() : null,
    verification_note: note || null,
  });
  await recordAudit({
    action: 'INSTITUTION_VERIFICATION',
    actor,
    institution_id: institutionId,
    entity_type: 'Institution',
    entity_id: institutionId,
    before: { verification_status: institution.verification_status },
    after: { verification_status: decision },
    note,
  });
  return updated;
}

export async function requireVerified(institutionId) {
  const institution = await getDoc(COLLECTIONS.institutions, institutionId);
  if (!institution) throw notFound('Institution not found');
  if (institution.verification_status !== 'VERIFIED') {
    throw badRequest('Your blood bank is not verified yet — a platform admin must approve it first');
  }
  return institution;
}
