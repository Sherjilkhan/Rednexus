import { COLLECTIONS, createDoc, getDoc, listDocs, updateDoc } from '../db/index.js';
import { computeEligibility } from './eligibility.js';
import { notFound } from './errors.js';
import { saveQuestionnaire } from './questionnaireService.js';

/** F10 — camp directory. Staff post camps; donors see upcoming ones and can tap "I'll attend". */
export async function createCamp(institutionId, input, actor) {
  const institution = await getDoc(COLLECTIONS.institutions, institutionId);
  return createDoc(COLLECTIONS.camps, {
    blood_bank_institution_id: institutionId,
    institution_name: institution?.name || null,
    date: input.date,
    start_time: input.start_time || '09:00',
    end_time: input.end_time || '16:00',
    location: input.location,
    pincode: input.pincode || null,
    notes: input.notes || null,
    created_by: actor.id,
    created_by_name: actor.name,
  });
}

export async function listCamps({ institutionId, upcomingOnly = false } = {}) {
  const rows = institutionId
    ? await listDocs(COLLECTIONS.camps, [['blood_bank_institution_id', '==', institutionId]])
    : await listDocs(COLLECTIONS.camps);
  const attendance = await listDocs(COLLECTIONS.campAttendance);
  const today = new Date().toISOString().slice(0, 10);
  return rows
    .filter((c) => (upcomingOnly ? c.date >= today : true))
    .map((c) => ({
      ...c,
      attendee_count: attendance.filter((a) => a.camp_id === c.id && a.attending).length,
      /** QR target: the camp-scoped registration form (F1). */
      registration_path: `/register?camp=${c.id}&institution=${c.blood_bank_institution_id}`,
    }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

export async function markAttendance(campId, donorId, attending, questionnaire = null) {
  const camp = await getDoc(COLLECTIONS.camps, campId);
  if (!camp) throw notFound('Camp not found');

  const rows = await listDocs(COLLECTIONS.campAttendance, [['camp_id', '==', campId]]);
  const existing = rows.find((r) => r.donor_id === donorId);

  let record;
  if (existing) {
    record = await updateDoc(COLLECTIONS.campAttendance, existing.id, {
      attending, at: new Date().toISOString(),
      questionnaire: questionnaire || existing.questionnaire || null,
    });
  } else {
    record = await createDoc(COLLECTIONS.campAttendance, {
      camp_id: campId,
      donor_id: donorId,
      attending,
      at: new Date().toISOString(),
      questionnaire: questionnaire || null,
    });
  }

  // Save questionnaire to DB + Google Sheets if provided
  if (attending && questionnaire) {
    saveQuestionnaire({
      source: 'CAMP',
      donor_id: donorId,
      camp_id: campId,
      institution_name: camp.institution_name || null,
      questionnaire,
    }).catch(e => console.error('[Questionnaire] Camp save error:', e));
  }

  return record;
}

export async function donorAttendance(donorId) {
  return listDocs(COLLECTIONS.campAttendance, [['donor_id', '==', donorId]]);
}

/** Aggregated calendar feed of camps, hospital emergency needs, and eligibility milestones */
export async function getDonorCalendarEvents({ donorId = null, pincode = null, bloodGroup = null, upcomingOnly = false } = {}) {
  const [camps, institutions, requests, attendance] = await Promise.all([
    listDocs(COLLECTIONS.camps),
    listDocs(COLLECTIONS.institutions),
    listDocs(COLLECTIONS.requests),
    listDocs(COLLECTIONS.campAttendance),
  ]);

  let donor = null;
  let eligibility = null;
  if (donorId) {
    donor = await getDoc(COLLECTIONS.donors, donorId);
    if (donor) {
      eligibility = computeEligibility(donor);
      if (!bloodGroup) {
        bloodGroup = donor.blood_group_verified || donor.blood_group_self_reported;
      }
      if (!pincode && donor.area_pincode) {
        pincode = donor.area_pincode;
      }
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const events = [];

  // 1. Community Blood Camps
  for (const c of camps) {
    if (upcomingOnly && c.date < today) continue;
    const inst = institutions.find((i) => i.id === c.blood_bank_institution_id);
    const isAttending = donorId ? attendance.some((a) => a.camp_id === c.id && a.donor_id === donorId && a.attending) : false;
    const attendeeCount = attendance.filter((a) => a.camp_id === c.id && a.attending).length;
    const cPin = c.pincode || inst?.location?.pincode || null;
    const isNearby = pincode && cPin ? (cPin === pincode || cPin.slice(0, 3) === pincode.slice(0, 3)) : true;

    events.push({
      id: `camp-${c.id}`,
      ref_id: c.id,
      type: 'CAMP',
      title: `Blood Camp: ${c.location.split(',')[0]}`,
      date: c.date,
      start_time: c.start_time || '09:00',
      end_time: c.end_time || '16:00',
      location: c.location,
      pincode: cPin,
      institution_id: c.blood_bank_institution_id,
      institution_name: c.institution_name || inst?.name || 'Blood Bank',
      contact_phone: inst?.contact_phone || null,
      notes: c.notes,
      attendee_count: attendeeCount,
      attending: isAttending,
      is_nearby: isNearby,
      registration_path: `/register?camp=${c.id}&institution=${c.blood_bank_institution_id}`,
    });
  }

  // 2. Active Hospital Blood Needs & Shortages
  const activeRequests = requests.filter((r) => ['DETECTED', 'RAISED', 'NOTIFIED'].includes(r.state));
  for (const r of activeRequests) {
    if (bloodGroup && r.blood_group !== bloodGroup) continue;
    const inst = institutions.find((i) => i.id === r.institution_id);
    const reqDate = r.created_at ? r.created_at.slice(0, 10) : today;
    const instPin = inst?.location?.pincode || null;
    const isNearby = pincode && instPin ? (instPin === pincode || instPin.slice(0, 3) === pincode.slice(0, 3)) : true;

    events.push({
      id: `need-${r.id}`,
      ref_id: r.id,
      type: 'HOSPITAL_NEED',
      title: `Hospital Need: ${r.units_needed} Units of ${r.blood_group}`,
      date: reqDate,
      start_time: '08:00',
      end_time: '20:00',
      location: inst ? `${inst.name} (${inst.linked_hospital_name || inst.location.city})` : 'Blood Centre',
      pincode: instPin,
      institution_id: r.institution_id,
      institution_name: inst?.name || 'Hospital Blood Centre',
      blood_group: r.blood_group,
      units_needed: r.units_needed,
      urgency: r.urgency || 'NORMAL',
      reason: r.reason,
      state: r.state,
      is_nearby: isNearby,
      contact_phone: inst?.contact_phone || null,
    });
  }

  // 3. Donor Eligibility Milestone
  if (eligibility?.next_eligible_date) {
    events.push({
      id: `milestone-eligible-${donorId || 'donor'}`,
      ref_id: donorId,
      type: 'ELIGIBILITY',
      title: eligibility.eligible ? 'You are eligible to donate today!' : `Next eligible donation date (${eligibility.interval_days}-day gap)`,
      date: eligibility.next_eligible_date,
      start_time: '09:00',
      end_time: '18:00',
      location: 'Any Registered Blood Centre / Drive',
      eligible: eligibility.eligible,
      reason: eligibility.reason,
      interval_days: eligibility.interval_days,
      is_nearby: true,
    });
  }

  events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return { events, donor_pincode: pincode, donor_blood_group: bloodGroup, eligibility };
}

export function generateIcsContent(event) {
  const d = (event.date || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
  const sTime = (event.start_time || '09:00').replace(/:/g, '') + '00';
  const eTime = (event.end_time || '17:00').replace(/:/g, '') + '00';
  const dtStart = `${d}T${sTime}`;
  const dtEnd = `${d}T${eTime}`;
  const uid = `${event.id || 'event'}-${Date.now()}@raktasetu.in`;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Raktasetu Blood Network//Donation Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${event.title || 'Blood Donation'}`,
    `DESCRIPTION:${(event.notes || event.reason || 'Raktasetu voluntary blood donation').replace(/\n/g, ' ')}`,
    `LOCATION:${(event.location || event.institution_name || 'Mumbai').replace(/\n/g, ' ')}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}
