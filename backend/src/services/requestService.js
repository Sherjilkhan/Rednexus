import { COLLECTIONS, createDoc, getDoc, listDocs, updateDoc } from '../db/index.js';
import { NOTIFY_STAGE_MULTIPLIER, DEFAULT_MONTHLY_CAP } from '../config.js';
import { contactable } from './eligibility.js';
import { badRequest, conflict, forbidden, notFound } from './errors.js';
import { recordAudit } from './audit.js';
import { getConfirmedThreshold, setStock, stockLevels, thresholdOverview } from './thresholdService.js';
import { recordDonation } from './donorService.js';
import { sendDonorWhatsApp } from './whatsappServices.js';
import { saveQuestionnaire } from './questionnaireService.js';

/* ---------------- Request state machine ---------------- */

export const STATES = ['DETECTED', 'RAISED', 'NOTIFIED', 'ACCEPTED', 'CONFIRMED', 'ARRIVED', 'DONATED', 'CLOSED'];

export const TRANSITIONS = {
  DETECTED: ['RAISED'],
  RAISED: ['NOTIFIED', 'CLOSED'],
  NOTIFIED: ['NOTIFIED', 'ACCEPTED', 'CLOSED'], // NOTIFIED -> NOTIFIED = staged escalation (F5)
  ACCEPTED: ['CONFIRMED', 'CLOSED'],
  CONFIRMED: ['ARRIVED', 'CLOSED'],
  ARRIVED: ['DONATED'],
  DONATED: ['CLOSED'],
  CLOSED: [],
};

export function canTransition(from, to) {
  if (!STATES.includes(to)) return false;
  return (TRANSITIONS[from] || []).includes(to);
}

export function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    throw conflict(`Illegal request transition ${from} -> ${to}`, {
      from,
      to,
      allowed: TRANSITIONS[from] || [],
    });
  }
}

async function transition(request, to, actor, extraPatch = {}, note) {
  assertTransition(request.state, to);
  const history = [
    ...(request.state_history || []),
    { from: request.state, to, at: new Date().toISOString(), by: actor?.id || 'system', by_name: actor?.name || 'system' },
  ];
  const updated = await updateDoc(COLLECTIONS.requests, request.id, { state: to, state_history: history, ...extraPatch });
  await recordAudit({
    action: `REQUEST_${to}`,
    actor: actor || { id: 'system', name: 'system', role: 'SYSTEM' },
    institution_id: request.institution_id,
    entity_type: 'Request',
    entity_id: request.id,
    before: { state: request.state },
    after: { state: to },
    note,
  });
  return updated;
}

/* ---------------- Creation ---------------- */

async function createRequest({ institution_id, blood_group, units_needed, urgency, origin, state, reason, actor }) {
  const payload = {
    institution_id,
    blood_group,
    units_needed,
    urgency: urgency || 'NORMAL',
    origin,
    state,
    reason: reason || null,
    escalation_stage: 0,
    confirmed_by: state === 'RAISED' ? actor?.id || null : null,
    confirmed_by_name: state === 'RAISED' ? actor?.name || null : null,
    confirmed_at: state === 'RAISED' ? new Date().toISOString() : null,
    created_by: actor?.id || 'system',
    state_history: [{ from: null, to: state, at: new Date().toISOString(), by: actor?.id || 'system', by_name: actor?.name || 'system' }],
  };
  const saved = await createDoc(COLLECTIONS.requests, payload);
  await recordAudit({
    action: `REQUEST_CREATED_${state}`,
    actor: actor || { id: 'system', name: 'system', role: 'SYSTEM' },
    institution_id,
    entity_type: 'Request',
    entity_id: saved.id,
    after: { state, origin, blood_group, units_needed },
    note: reason,
  });
  return saved;
}

/** MANUAL raise — a human already initiated it, so it starts at RAISED (never DETECTED). */
export async function raiseManualRequest(institutionId, input, actor) {
  if (actor.role !== 'BLOOD_BANK_STAFF' || actor.institution_id !== institutionId) throw forbidden();
  return createRequest({
    institution_id: institutionId,
    blood_group: input.blood_group,
    units_needed: input.units_needed,
    urgency: input.urgency,
    origin: 'MANUAL',
    state: 'RAISED',
    reason: input.reason || 'Manually raised by blood bank staff',
    actor,
  });
}

/* ---------------- T5 — breach detection (drafts only, never sends) ---------------- */

export async function detectBreaches(institutionId) {
  const overview = await thresholdOverview(institutionId);
  const open = (await listDocs(COLLECTIONS.requests, [['institution_id', '==', institutionId]])).filter(
    (r) => r.state !== 'CLOSED',
  );
  const created = [];

  for (const row of overview) {
    if (row.confirmed_threshold == null) continue; // only confirmed thresholds can trigger anything

    // Threshold breach: stock at or below the confirmed threshold.
    if (row.current_stock <= row.confirmed_threshold) {
      const dup = open.find((r) => r.blood_group === row.blood_group && r.origin === 'THRESHOLD_BREACH');
      if (!dup) {
        const deficit = Math.max(1, row.confirmed_threshold - row.current_stock + Math.ceil(row.avg_daily_consumption * 2));
        created.push(
          await createRequest({
            institution_id: institutionId,
            blood_group: row.blood_group,
            units_needed: deficit,
            urgency: row.current_stock === 0 ? 'HIGH' : 'NORMAL',
            origin: 'THRESHOLD_BREACH',
            state: 'DETECTED',
            reason: `Stock ${row.current_stock} units is at or below the confirmed threshold of ${row.confirmed_threshold} — ${deficit} units rebuilds the threshold plus 2 days of cover at ${row.avg_daily_consumption}/day`,
            actor: null,
          }),
        );
      }
      continue;
    }

    // Scheduled collection target off pace for the current period.
    if (row.confirmed_target) {
      const collected = await unitsCollectedThisPeriod(institutionId, row.blood_group, row.target_period_days);
      const pace = collected / row.confirmed_target;
      if (pace < 0.5) {
        const dup = open.find((r) => r.blood_group === row.blood_group && r.origin === 'SCHEDULED');
        if (!dup) {
          created.push(
            await createRequest({
              institution_id: institutionId,
              blood_group: row.blood_group,
              units_needed: Math.max(1, Math.min(row.confirmed_target - collected, Math.ceil(row.confirmed_target / 2))),
              urgency: 'LOW',
              origin: 'SCHEDULED',
              state: 'DETECTED',
              reason: `Recurring collection target off pace: ${collected}/${row.confirmed_target} units in the last ${row.target_period_days} days`,
              actor: null,
            }),
          );
        }
      }
    }
  }
  return created;
}

async function unitsCollectedThisPeriod(institutionId, bloodGroup, days) {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const donations = await listDocs(COLLECTIONS.donations, [['institution_id', '==', institutionId]]);
  const donors = await listDocs(COLLECTIONS.donors);
  return donations
    .filter((d) => d.date >= cutoff)
    .filter((d) => {
      const donor = donors.find((x) => x.id === d.donor_id);
      return donor && (donor.blood_group_verified || donor.blood_group_self_reported) === bloodGroup;
    })
    .reduce((s, d) => s + (d.units || 1), 0);
}

/** Periodic job — drafts only. Nothing here ever notifies a donor. */
export async function runBreachJob() {
  const institutions = await listDocs(COLLECTIONS.institutions, [['verification_status', '==', 'VERIFIED']]);
  let total = 0;
  for (const i of institutions) {
    const created = await detectBreaches(i.id);
    total += created.length;
  }
  return total;
}

/* ---------------- Human confirmation gate: DETECTED -> RAISED ---------------- */

export async function confirmRequest(requestId, actor, note) {
  const request = await getDoc(COLLECTIONS.requests, requestId);
  if (!request) throw notFound('Request not found');
  if (actor.role !== 'BLOOD_BANK_STAFF' || actor.institution_id !== request.institution_id) {
    throw forbidden('Only staff of this blood bank can confirm its alerts');
  }
  if (request.state !== 'DETECTED') throw conflict(`Only DETECTED requests can be confirmed (state is ${request.state})`);
  return transition(request, 'RAISED', actor, {
    confirmed_by: actor.id,
    confirmed_by_name: actor.name,
    confirmed_at: new Date().toISOString(),
  }, note);
}

/* ---------------- F4/F5 — targeting, ranking, dispatch ---------------- */

function monthKey(iso) {
  return String(iso).slice(0, 7);
}

/**
 * Filter chain: blood group -> eligibility -> preferences/pause -> monthly notification budget.
 * Returns both the passing pool and the exclusion reasons (used by the UI and by tests).
 */
export async function buildTargetPool(request, { stage = 1, now = new Date() } = {}) {
  const donors = await listDocs(COLLECTIONS.donors);
  const logs = await listDocs(COLLECTIONS.notifications);
  const excluded = [];
  const pool = [];

  for (const donor of donors) {
    const group = donor.blood_group_verified || donor.blood_group_self_reported;
    if (group !== request.blood_group) continue;

    if (donor.status === 'PENDING_REVIEW') {
      excluded.push({ donor_id: donor.id, stage_filter: 'REVIEW', reason: 'Pending staff review' });
      continue;
    }
    const c = contactable(donor, now);
    if (!c.ok) {
      excluded.push({ donor_id: donor.id, stage_filter: 'ELIGIBILITY_OR_PREFERENCE', reason: c.reason });
      continue;
    }
    const cap = donor.preferences?.max_contacts_per_month ?? DEFAULT_MONTHLY_CAP;
    const thisMonth = logs.filter((l) => l.donor_id === donor.id && monthKey(l.sent_at) === monthKey(now.toISOString())).length;
    if (thisMonth >= cap) {
      excluded.push({ donor_id: donor.id, stage_filter: 'BUDGET', reason: `Monthly contact cap reached (${thisMonth}/${cap})` });
      continue;
    }
    const alreadyOnThisRequest = logs.some((l) => l.donor_id === donor.id && l.request_id === request.id);
    if (alreadyOnThisRequest) {
      excluded.push({ donor_id: donor.id, stage_filter: 'DEDUPE', reason: 'Already notified for this request' });
      continue;
    }

    // Rule-based ranking (ML is an optional upgrade, never a dependency):
    let score = 0;
    if (donor.blood_group_verified) score += 20;
    if (donor.preferences?.preferred_institution_id === request.institution_id) score += 25;
    if (donor.area_pincode && donor.area_pincode === request.institution_pincode) score += 15;
    const past = logs.filter((l) => l.donor_id === donor.id);
    const accepted = past.filter((l) => l.response === 'ACCEPTED').length;
    score += past.length ? Math.round((accepted / past.length) * 30) : 15;
    if (donor.last_donation_date) score += 10;
    score += Math.max(0, 10 - thisMonth * 5);

    pool.push({ donor, score, eligibility: c.eligibility });
  }

  pool.sort((a, b) => b.score - a.score);
  const batchSize = Math.max(1, request.units_needed * (NOTIFY_STAGE_MULTIPLIER[stage - 1] ?? 3));
  return { pool, batch: pool.slice(0, batchSize), excluded, stage, batchSize };
}

/**
 * RAISED -> NOTIFIED (or NOTIFIED -> NOTIFIED for a widened pool, F5).
 * Only reachable after a human confirmation (or a MANUAL raise, which is itself human-initiated).
 */
export async function dispatchNotifications(requestId, actor, { widen = false } = {}) {
  const request = await getDoc(COLLECTIONS.requests, requestId);
  if (!request) throw notFound('Request not found');
  if (actor.role !== 'BLOOD_BANK_STAFF' || actor.institution_id !== request.institution_id) throw forbidden();
  if (request.state === 'DETECTED') throw conflict('This alert must be confirmed by staff before donors can be notified');

  const stage = widen ? (request.escalation_stage || 1) + 1 : 1;
  const institution = await getDoc(COLLECTIONS.institutions, request.institution_id);
  const { batch, excluded, pool } = await buildTargetPool({ ...request, institution_pincode: institution?.location?.pincode }, { stage });

  for (const item of batch) {
    const notifDoc = await createDoc(COLLECTIONS.notifications, {
      donor_id: item.donor.id,
      request_id: request.id,
      institution_id: request.institution_id,
      institution_name: institution?.name || null,
      blood_group: request.blood_group,
      channel: 'IN_APP',
      stage,
      score: item.score,
      sent_at: new Date().toISOString(),
      response: 'PENDING',
      response_at: null,
      message:
        request.urgency === 'HIGH'
          ? `${institution?.name || 'Your blood bank'} needs ${request.blood_group} blood today. Can you come in?`
          : `${institution?.name || 'Your blood bank'} needs ${request.blood_group} blood in the next few days. Can you help?`,
    });

    // Send WhatsApp — non-blocking, never crashes dispatch if it fails
    if (item.donor.contact_phone) {
      sendDonorWhatsApp(item.donor.contact_phone, {
        donorName:       item.donor.name || 'Donor',
        bloodGroup:      request.blood_group,
        institutionName: institution?.name || 'Your blood bank',
        urgency:         request.urgency,
        notificationId:  notifDoc.id,
      }).catch((e) => console.error('[WhatsApp] Unhandled error:', e));
    }
  }

  const updated = await transition(request, 'NOTIFIED', actor, { escalation_stage: stage, notified_count: (request.notified_count || 0) + batch.length },
    widen ? `Widened pool to stage ${stage}` : 'Stage 1 dispatch');
  return { request: updated, notified: batch.length, pool_size: pool.length, excluded, stage };
}

/* ---------------- Donor responses ---------------- */

export async function respondToNotification(notificationId, donorId, response, questionnaire = null, user = null) {
  const log = await getDoc(COLLECTIONS.notifications, notificationId);
  if (!log) throw notFound('Notification not found');
  if (log.donor_id !== donorId) throw forbidden('This notification belongs to another donor');
  if (!['ACCEPTED', 'DECLINED'].includes(response)) throw badRequest('Response must be ACCEPTED or DECLINED');
  if (log.response !== 'PENDING') throw conflict('You have already responded to this request');

  const sent = new Date(log.sent_at);
  const updatedLog = await updateDoc(COLLECTIONS.notifications, notificationId, {
    response,
    questionnaire: response === 'ACCEPTED' ? questionnaire || null : null,
    response_at: new Date().toISOString(),
    response_time_minutes: Math.round((Date.now() - sent.getTime()) / 60000),
  });

  // Save questionnaire to DB + Google Sheets whenever one is submitted (ACCEPTED with questionnaire)
  if (response === 'ACCEPTED' && questionnaire) {
    saveQuestionnaire({
      source: 'EMERGENCY',
      donor_id: donorId,
      notification_id: notificationId,
      institution_name: log.institution_name || null,
      questionnaire,
    }).catch(e => console.error('[Questionnaire] Save error:', e));
  }

  const request = await getDoc(COLLECTIONS.requests, log.request_id);
  if (response === 'ACCEPTED' && request && request.state === 'NOTIFIED') {
    const logs = await listDocs(COLLECTIONS.notifications, [['request_id', '==', request.id]]);
    const acceptedCount = logs.filter((l) => l.response === 'ACCEPTED').length;
    if (acceptedCount >= request.units_needed) {
      await transition(request, 'ACCEPTED', { id: 'system', name: 'system', role: 'SYSTEM' }, { accepted_count: acceptedCount },
        `${acceptedCount} donors accepted, requirement met`);
    } else {
      await updateDoc(COLLECTIONS.requests, request.id, { accepted_count: acceptedCount });
    }
  }
  return updatedLog;
}

export async function donorNotifications(donorId) {
  const logs = await listDocs(COLLECTIONS.notifications, [['donor_id', '==', donorId]]);
  const requests = await listDocs(COLLECTIONS.requests);
  return logs
    .map((l) => {
      const r = requests.find((x) => x.id === l.request_id);
      return { ...l, request_state: r?.state || null, units_needed: r?.units_needed || null, urgency: r?.urgency || null };
    })
    .sort((a, b) => (a.sent_at < b.sent_at ? 1 : -1));
}

/* ---------------- Later states ---------------- */

export async function advanceRequest(requestId, to, actor, extra = {}) {
  const request = await getDoc(COLLECTIONS.requests, requestId);
  if (!request) throw notFound('Request not found');
  if (actor.role !== 'BLOOD_BANK_STAFF' || actor.institution_id !== request.institution_id) throw forbidden();
  if (to === 'RAISED') throw forbidden('Use the confirmation endpoint for the DETECTED -> RAISED gate');

  const patch = { ...extra };
  const updated = await transition(request, to, actor, patch);

  if (to === 'DONATED') {
    // Record donations for the donors who accepted, resetting their eligibility clock.
    const logs = await listDocs(COLLECTIONS.notifications, [['request_id', '==', requestId]]);
    for (const l of logs.filter((x) => x.response === 'ACCEPTED')) {
      await recordDonation({ donor_id: l.donor_id, institution_id: request.institution_id, request_id: requestId }, actor);
    }
  }
  if (to === 'CLOSED') {
    // Auto "thank you, requirement met" for donors who accepted beyond what was needed.
    const logs = await listDocs(COLLECTIONS.notifications, [['request_id', '==', requestId]]);
    for (const l of logs) {
      if (l.response === 'PENDING') {
        await updateDoc(COLLECTIONS.notifications, l.id, {
          response: 'CLOSED_UNANSWERED',
          closing_message: 'Thank you — this requirement has now been met.',
        });
      } else if (l.response === 'ACCEPTED') {
        await updateDoc(COLLECTIONS.notifications, l.id, {
          closing_message: 'Thank you for stepping forward. This requirement has been met.',
        });
      }
    }
  }
  return updated;
}

export async function listRequests(institutionId) {
  const rows = institutionId
    ? await listDocs(COLLECTIONS.requests, [['institution_id', '==', institutionId]])
    : await listDocs(COLLECTIONS.requests);
  const logs = await listDocs(COLLECTIONS.notifications);
  return rows
    .map((r) => {
      const mine = logs.filter((l) => l.request_id === r.id);
      return {
        ...r,
        notified_count: mine.length,
        accepted_count: mine.filter((l) => l.response === 'ACCEPTED').length,
        declined_count: mine.filter((l) => l.response === 'DECLINED').length,
        allowed_transitions: TRANSITIONS[r.state] || [],
      };
    })
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export async function requestDetail(requestId, viewer) {
  const request = await getDoc(COLLECTIONS.requests, requestId);
  if (!request) throw notFound('Request not found');
  const logs = (await listDocs(COLLECTIONS.notifications, [['request_id', '==', requestId]])) || [];
  const donors = await listDocs(COLLECTIONS.donors);
  const isVerifiedStaff = viewer?.role === 'BLOOD_BANK_STAFF' && viewer.institution_id === request.institution_id && viewer.institution_verified;
  return {
    ...request,
    allowed_transitions: TRANSITIONS[request.state] || [],
    notifications: logs.map((l) => {
      const d = donors.find((x) => x.id === l.donor_id);
      return {
        ...l,
        donor_name: d?.name || 'Donor',
        // F7: contact details only for verified staff at the institution that raised the request.
        donor_phone: isVerifiedStaff ? d?.contact_phone || null : null,
        donor_area: isVerifiedStaff ? d?.area_pincode || null : null,
        questionnaire: l.questionnaire || null,
      };
    }),
  };
}

export { stockLevels, getConfirmedThreshold };
/* ──────────────────────────────────────────────────────────────────────────────
   ACCEPTED-DONOR MANAGEMENT
   After request reaches ACCEPTED state, staff can:
   1. shortlist()/reject accepted donors
   2. assignAppointment() — give a date+time to shortlisted donors
   3. notifyAppointment() — send WhatsApp + in-app message about their slot
   4. recordDonorArrival() — mark a specific donor ARRIVED
   5. recordDonorDonation() — log units donated per donor, auto-close if threshold met
   ─────────────────────────────────────────────────────────────────────────── */

/** List accepted donors for a request with their shortlist status */
export async function listAcceptedDonors(requestId, actor) {
  const request = await getDoc(COLLECTIONS.requests, requestId);
  if (!request) throw notFound('Request not found');
  if (actor.role !== 'BLOOD_BANK_STAFF' || actor.institution_id !== request.institution_id) throw forbidden();

  const logs = await listDocs(COLLECTIONS.notifications, [['request_id', '==', requestId]]);
  const donors = await listDocs(COLLECTIONS.donors);

  return logs
    .filter(l => l.response === 'ACCEPTED')
    .map(l => {
      const donor = donors.find(d => d.id === l.donor_id) || {};
      return {
        notification_id: l.id,
        donor_id: l.donor_id,
        donor_name: donor.name || 'Donor',
        donor_phone: donor.contact_phone || null,
        blood_group: donor.blood_group_verified || donor.blood_group_self_reported || request.blood_group,
        response_at: l.response_at,
        shortlisted: l.shortlisted || false,
        rejected: l.rejected || false,
        appointment_date: l.appointment_date || null,
        appointment_time: l.appointment_time || null,
        appointment_notified: l.appointment_notified || false,
        arrived: l.arrived || false,
        donated: l.donated || false,
        units_donated: l.units_donated || null,
        questionnaire: l.questionnaire || null,
      };
    })
    .sort((a, b) => (a.response_at > b.response_at ? 1 : -1));
}

/** Shortlist or reject an accepted donor */
export async function setDonorShortlist(requestId, notificationId, action, actor) {
  // action: 'shortlist' | 'reject'
  const request = await getDoc(COLLECTIONS.requests, requestId);
  if (!request) throw notFound('Request not found');
  if (actor.role !== 'BLOOD_BANK_STAFF' || actor.institution_id !== request.institution_id) throw forbidden();

  const log = await getDoc(COLLECTIONS.notifications, notificationId);
  if (!log || log.request_id !== requestId) throw notFound('Donor notification not found');
  if (log.response !== 'ACCEPTED') throw conflict('Can only shortlist/reject donors who accepted');

  await updateDoc(COLLECTIONS.notifications, notificationId, {
    shortlisted: action === 'shortlist',
    rejected: action === 'reject',
  });

  await recordAudit({
    action: action === 'shortlist' ? 'DONOR_SHORTLISTED' : 'DONOR_REJECTED',
    actor,
    institution_id: request.institution_id,
    entity_type: 'Notification',
    entity_id: notificationId,
    note: `${action} by ${actor.name}`,
  });

  return { done: true };
}

/** Assign appointment date + time to a shortlisted donor */
export async function assignAppointment(requestId, notificationId, { appointment_date, appointment_time }, actor) {
  const request = await getDoc(COLLECTIONS.requests, requestId);
  if (!request) throw notFound('Request not found');
  if (actor.role !== 'BLOOD_BANK_STAFF' || actor.institution_id !== request.institution_id) throw forbidden();

  const log = await getDoc(COLLECTIONS.notifications, notificationId);
  if (!log || log.request_id !== requestId) throw notFound('Donor notification not found');
  if (!log.shortlisted) throw conflict('Assign an appointment only to shortlisted donors');

  await updateDoc(COLLECTIONS.notifications, notificationId, {
    appointment_date,
    appointment_time,
    appointment_notified: false,
  });

  return { done: true, appointment_date, appointment_time };
}

/** Send WhatsApp + in-app notification to donor about their appointment */
export async function notifyAppointment(requestId, notificationId, actor) {
  const request = await getDoc(COLLECTIONS.requests, requestId);
  if (!request) throw notFound('Request not found');
  if (actor.role !== 'BLOOD_BANK_STAFF' || actor.institution_id !== request.institution_id) throw forbidden();

  const log = await getDoc(COLLECTIONS.notifications, notificationId);
  if (!log || log.request_id !== requestId) throw notFound('Donor notification not found');
  if (!log.appointment_date) throw badRequest('Set an appointment date first');

  const institution = await getDoc(COLLECTIONS.institutions, request.institution_id);
  const donors = await listDocs(COLLECTIONS.donors);
  const donor = donors.find(d => d.id === log.donor_id);
  if (!donor) throw notFound('Donor not found');

  const message =
    `🩸 *Donation Appointment Confirmed*

` +
    `Hello ${donor.name},
` +
    `Your blood donation appointment has been scheduled:

` +
    `📅 Date: *${log.appointment_date}*
` +
    `🕐 Time: *${log.appointment_time || 'To be confirmed'}*
` +
    `🏥 Location: *${institution?.name || 'Blood bank'}*

` +
    `Please eat well before coming and carry a photo ID.

` +
    `_Raktasetu — consumption-calibrated blood supply_`;

  // Send WhatsApp
  if (donor.contact_phone) {
    sendDonorWhatsApp(donor.contact_phone, {
      donorName: donor.name,
      bloodGroup: request.blood_group,
      institutionName: institution?.name || '',
      urgency: request.urgency,
      notificationId: log.id,
    }).catch(e => console.error('[Appointment] WhatsApp error:', e));
  }

  // Update in-app notification message
  await updateDoc(COLLECTIONS.notifications, notificationId, {
    appointment_notified: true,
    appointment_notified_at: new Date().toISOString(),
    message,
  });

  return { done: true };
}

/** Mark a specific donor as arrived */
export async function markDonorArrived(requestId, notificationId, actor) {
  const request = await getDoc(COLLECTIONS.requests, requestId);
  if (!request) throw notFound('Request not found');
  if (actor.role !== 'BLOOD_BANK_STAFF' || actor.institution_id !== request.institution_id) throw forbidden();

  const log = await getDoc(COLLECTIONS.notifications, notificationId);
  if (!log || log.request_id !== requestId) throw notFound('Donor notification not found');

  await updateDoc(COLLECTIONS.notifications, notificationId, {
    arrived: true,
    arrived_at: new Date().toISOString(),
  });

  return { done: true };
}

/**
 * Record a donation for a specific donor.
 * Updates stock, donor record, checks threshold — auto-closes request if met.
 */
export async function recordIndividualDonation(requestId, notificationId, { units, hb_level }, actor) {
  const request = await getDoc(COLLECTIONS.requests, requestId);
  if (!request) throw notFound('Request not found');
  if (actor.role !== 'BLOOD_BANK_STAFF' || actor.institution_id !== request.institution_id) throw forbidden();

  const log = await getDoc(COLLECTIONS.notifications, notificationId);
  if (!log || log.request_id !== requestId) throw notFound('Donor notification not found');
  if (log.donated) throw conflict('Donation already recorded for this donor');

  const unitsNum = Math.max(1, Math.round(Number(units) || 1));

  // 1. Record in donation_records + update donor's last_donation_date
  await recordDonation({
    donor_id: log.donor_id,
    institution_id: request.institution_id,
    request_id: requestId,
    units: unitsNum,
    hb_level: hb_level || null,
    date: new Date().toISOString().slice(0, 10),
  }, actor);

  // 2. Mark notification as donated
  await updateDoc(COLLECTIONS.notifications, notificationId, {
    donated: true,
    donated_at: new Date().toISOString(),
    units_donated: unitsNum,
    hb_level: hb_level || null,
  });

  // 3. Update stock — add the donated units
  const stockRows = await stockLevels(request.institution_id);
  const stockRow = stockRows.find(s => s.blood_group === request.blood_group);
  const currentStock = stockRow?.units_available ?? 0;
  const newStock = currentStock + unitsNum;
  await setStock(request.institution_id, request.blood_group, newStock, actor);

  // 4. Check if total donated across all donors meets units_needed
  const allLogs = await listDocs(COLLECTIONS.notifications, [['request_id', '==', requestId]]);
  const totalDonated = allLogs.filter(l => l.donated).reduce((s, l) => s + (l.units_donated || 1), 0) + 
                       (log.donated ? 0 : unitsNum); // include current
  
  // Recalculate with the just-updated log included
  const logsAfter = await listDocs(COLLECTIONS.notifications, [['request_id', '==', requestId]]);
  const totalDonatedAfter = logsAfter.filter(l => l.donated).reduce((s, l) => s + (l.units_donated || 1), 0);

  // 5. Check if stock is now above threshold — auto-close if so
  const threshold = stockRow?.confirmed_threshold ?? null;
  const autoClose = threshold !== null && newStock > threshold && totalDonatedAfter >= request.units_needed;

  if (autoClose || totalDonatedAfter >= request.units_needed) {
    // Move request to DONATED then CLOSED
    if (['ACCEPTED', 'CONFIRMED', 'ARRIVED', 'NOTIFIED'].includes(request.state)) {
      // Try to advance through states to DONATED
      const currentState = request.state;
      const stateOrder = ['NOTIFIED', 'ACCEPTED', 'CONFIRMED', 'ARRIVED', 'DONATED'];
      let current = request;
      for (const targetState of stateOrder.slice(stateOrder.indexOf(currentState) + 1)) {
        if (canTransition(current.state, targetState)) {
          current = await transition(current, targetState, actor,
            { donated_units_total: totalDonatedAfter },
            `Auto-advanced: ${totalDonatedAfter} units donated${autoClose ? ', stock above threshold' : ''}`
          );
        }
        if (targetState === 'DONATED') break;
      }
    }
  }

  await recordAudit({
    action: 'INDIVIDUAL_DONATION_RECORDED',
    actor,
    institution_id: request.institution_id,
    entity_type: 'Request',
    entity_id: requestId,
    note: `${unitsNum} unit(s) from donor ${log.donor_id}. New stock: ${newStock}. ${autoClose ? 'Request auto-closed — stock above threshold.' : ''}`,
  });

  return {
    done: true,
    units_donated: unitsNum,
    new_stock: newStock,
    total_donated: totalDonatedAfter,
    auto_closed: autoClose,
    threshold,
  };
}
