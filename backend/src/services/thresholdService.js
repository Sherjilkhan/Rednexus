import { COLLECTIONS, createDoc, getDoc, listDocs, updateDoc } from '../db/index.js';
import {
  BLOOD_GROUPS,
  COLLECTION_TARGET_PERIOD_DAYS,
  ROLLING_WINDOW_DAYS,
  THRESHOLD_BUFFER_DAYS,
} from '../config.js';
import { addDays, isoDay } from './eligibility.js';
import { badRequest, forbidden, notFound } from './errors.js';
import { recordAudit } from './audit.js';

/* ---------------- T1 — daily usage ingestion ---------------- */

export async function reportUsage(institutionId, { date, entries }, actor) {
  const day = date || isoDay(new Date());
  const existing = await listDocs(COLLECTIONS.usageRecords, [['blood_bank_institution_id', '==', institutionId]]);
  const saved = [];
  for (const entry of entries) {
    if (!BLOOD_GROUPS.includes(entry.blood_group)) throw badRequest(`Unknown blood group ${entry.blood_group}`);
    const prior = existing.find((r) => r.date === day && r.blood_group === entry.blood_group);
    if (prior) {
      saved.push(await updateDoc(COLLECTIONS.usageRecords, prior.id, {
        units_issued: entry.units_issued,
        reported_by: actor.id,
        reported_at: new Date().toISOString(),
      }));
    } else {
      saved.push(await createDoc(COLLECTIONS.usageRecords, {
        blood_bank_institution_id: institutionId,
        blood_group: entry.blood_group,
        units_issued: entry.units_issued,
        date: day,
        reported_by: actor.id,
        reported_at: new Date().toISOString(),
      }));
    }
  }
  await recordAudit({
    action: 'USAGE_REPORTED',
    actor,
    institution_id: institutionId,
    entity_type: 'UsageRecord',
    entity_id: day,
    after: { date: day, entries },
  });
  return saved;
}

export async function usageRecords(institutionId, days = 30) {
  const rows = await listDocs(COLLECTIONS.usageRecords, [['blood_bank_institution_id', '==', institutionId]]);
  const cutoff = isoDay(addDays(new Date(), -(days - 1)));
  return rows.filter((r) => r.date >= cutoff).sort((a, b) => (a.date < b.date ? 1 : -1));
}

/** Usage series for charts: one row per day with a column per blood group. */
export async function usageSeries(institutionId, days = 30) {
  const rows = await usageRecords(institutionId, days);
  const byDate = new Map();
  for (const r of rows) {
    if (!byDate.has(r.date)) byDate.set(r.date, { date: r.date, total: 0 });
    const row = byDate.get(r.date);
    row[r.blood_group] = (row[r.blood_group] || 0) + r.units_issued;
    row.total += r.units_issued;
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

/* ---------------- T2 / T4 — rolling-average proposal ---------------- */

/**
 * Rule-based (never ML-dependent) rolling average over the trailing window of DAILY
 * usage records. Produces:
 *   proposed_threshold        = avg daily consumption * THRESHOLD_BUFFER_DAYS
 *   recurring_collection_target = avg daily consumption * COLLECTION_TARGET_PERIOD_DAYS
 * Also reports data confidence so thin data is visible instead of blocking (Risks §10).
 */
export function computeProposal(usageRows, bloodGroup, windowDays = ROLLING_WINDOW_DAYS, now = new Date()) {
  // Inclusive window: today counts as day 1, so a 14-day window is [today-13 .. today].
  const cutoff = isoDay(addDays(now, -(windowDays - 1)));
  const rows = usageRows.filter((r) => r.blood_group === bloodGroup && r.date >= cutoff);
  const totalUnits = rows.reduce((s, r) => s + Number(r.units_issued || 0), 0);
  const daysReported = new Set(rows.map((r) => r.date)).size;
  const avgDaily = totalUnits / windowDays;
  const coverage = daysReported / windowDays;
  return {
    blood_group: bloodGroup,
    window_days: windowDays,
    days_reported: daysReported,
    total_units_issued: totalUnits,
    avg_daily_consumption: Number(avgDaily.toFixed(2)),
    proposed_threshold: Math.max(1, Math.ceil(avgDaily * THRESHOLD_BUFFER_DAYS)),
    recurring_collection_target: Math.max(1, Math.ceil(avgDaily * COLLECTION_TARGET_PERIOD_DAYS)),
    target_period_days: COLLECTION_TARGET_PERIOD_DAYS,
    data_confidence: coverage >= 0.8 ? 'HIGH' : coverage >= 0.4 ? 'MEDIUM' : 'LOW',
    stale: daysReported === 0,
  };
}

export async function thresholdOverview(institutionId) {
  const usage = await listDocs(COLLECTIONS.usageRecords, [['blood_bank_institution_id', '==', institutionId]]);
  const confirmed = await listDocs(COLLECTIONS.thresholds, [['blood_bank_institution_id', '==', institutionId]]);
  const stock = await listDocs(COLLECTIONS.stock, [['blood_bank_institution_id', '==', institutionId]]);
  return BLOOD_GROUPS.map((bg) => {
    const proposal = computeProposal(usage, bg);
    const row = confirmed.find((t) => t.blood_group === bg) || null;
    const stockRow = stock.find((s) => s.blood_group === bg) || null;
    return {
      ...proposal,
      current_stock: stockRow ? stockRow.units_available : 0,
      confirmed_threshold: row?.confirmed_threshold ?? null,
      confirmed_target: row?.recurring_collection_target ?? null,
      confirmed_by: row?.confirmed_by ?? null,
      confirmed_by_name: row?.confirmed_by_name ?? null,
      confirmed_at: row?.confirmed_at ?? null,
      active: row?.confirmed_threshold != null,
      breached: row?.confirmed_threshold != null && (stockRow?.units_available ?? 0) <= row.confirmed_threshold,
      threshold_id: row?.id || null,
    };
  });
}

/**
 * T3 — MANDATORY human confirmation. A threshold is never auto-activated:
 * this is the only code path that can write confirmed_threshold, and it always
 * records confirmed_by + confirmed_at. There is no auto-confirm mode anywhere.
 */
export async function confirmThreshold(institutionId, input, actor) {
  if (actor.role !== 'BLOOD_BANK_STAFF' || actor.institution_id !== institutionId) {
    throw forbidden('Only staff of this blood bank can confirm its thresholds');
  }
  if (!BLOOD_GROUPS.includes(input.blood_group)) throw badRequest('Unknown blood group');
  if (!(input.confirmed_threshold >= 0)) throw badRequest('Threshold must be a non-negative number');

  const usage = await listDocs(COLLECTIONS.usageRecords, [['blood_bank_institution_id', '==', institutionId]]);
  const proposal = computeProposal(usage, input.blood_group);
  const existing = (await listDocs(COLLECTIONS.thresholds, [['blood_bank_institution_id', '==', institutionId]])).find(
    (t) => t.blood_group === input.blood_group,
  );

  const payload = {
    blood_bank_institution_id: institutionId,
    blood_group: input.blood_group,
    proposed_threshold: proposal.proposed_threshold,
    proposed_target: proposal.recurring_collection_target,
    confirmed_threshold: Math.round(input.confirmed_threshold),
    recurring_collection_target: Math.round(input.recurring_collection_target ?? proposal.recurring_collection_target),
    target_period_days: proposal.target_period_days,
    edited_by_staff: Math.round(input.confirmed_threshold) !== proposal.proposed_threshold,
    confirmed_by: actor.id,
    confirmed_by_name: actor.name,
    confirmed_at: new Date().toISOString(),
  };

  const saved = existing
    ? await updateDoc(COLLECTIONS.thresholds, existing.id, payload)
    : await createDoc(COLLECTIONS.thresholds, payload);

  await recordAudit({
    action: 'THRESHOLD_CONFIRMED',
    actor,
    institution_id: institutionId,
    entity_type: 'BloodGroupThreshold',
    entity_id: saved.id,
    before: existing ? { confirmed_threshold: existing.confirmed_threshold, recurring_collection_target: existing.recurring_collection_target } : null,
    after: {
      confirmed_threshold: saved.confirmed_threshold,
      recurring_collection_target: saved.recurring_collection_target,
      proposed_threshold: saved.proposed_threshold,
    },
    note: input.note || null,
  });
  return saved;
}

export async function getConfirmedThreshold(institutionId, bloodGroup) {
  const rows = await listDocs(COLLECTIONS.thresholds, [['blood_bank_institution_id', '==', institutionId]]);
  return rows.find((t) => t.blood_group === bloodGroup && t.confirmed_threshold != null) || null;
}

/* ---------------- Stock tracking ---------------- */

export async function stockLevels(institutionId) {
  const rows = await listDocs(COLLECTIONS.stock, [['blood_bank_institution_id', '==', institutionId]]);
  const thresholds = await listDocs(COLLECTIONS.thresholds, [['blood_bank_institution_id', '==', institutionId]]);
  return BLOOD_GROUPS.map((bg) => {
    const row = rows.find((r) => r.blood_group === bg);
    const t = thresholds.find((x) => x.blood_group === bg);
    return {
      blood_group: bg,
      units_available: row?.units_available ?? 0,
      updated_at: row?.updated_at || null,
      confirmed_threshold: t?.confirmed_threshold ?? null,
      breached: t?.confirmed_threshold != null && (row?.units_available ?? 0) <= t.confirmed_threshold,
    };
  });
}

export async function setStock(institutionId, bloodGroup, units, actor) {
  if (!BLOOD_GROUPS.includes(bloodGroup)) throw badRequest('Unknown blood group');
  const rows = await listDocs(COLLECTIONS.stock, [['blood_bank_institution_id', '==', institutionId]]);
  const existing = rows.find((r) => r.blood_group === bloodGroup);
  const payload = {
    blood_bank_institution_id: institutionId,
    blood_group: bloodGroup,
    units_available: Math.max(0, Math.round(units)),
    updated_at: new Date().toISOString(),
    updated_by: actor?.id || null,
  };
  const saved = existing ? await updateDoc(COLLECTIONS.stock, existing.id, payload) : await createDoc(COLLECTIONS.stock, payload);
  return saved;
}

export async function getThresholdById(id) {
  const t = await getDoc(COLLECTIONS.thresholds, id);
  if (!t) throw notFound('Threshold not found');
  return t;
}
