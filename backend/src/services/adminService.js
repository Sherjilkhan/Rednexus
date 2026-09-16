import { COLLECTIONS, listDocs } from '../db/index.js';
import { BLOOD_GROUPS } from '../config.js';
import { computeEligibility } from './eligibility.js';

/** Platform-level statistics for the admin panel (no donor PII). */
export async function platformStats() {
  const [donors, institutions, requests, usage, notifications, donations, camps] = await Promise.all([
    listDocs(COLLECTIONS.donors),
    listDocs(COLLECTIONS.institutions),
    listDocs(COLLECTIONS.requests),
    listDocs(COLLECTIONS.usageRecords),
    listDocs(COLLECTIONS.notifications),
    listDocs(COLLECTIONS.donations),
    listDocs(COLLECTIONS.camps),
  ]);

  const responded = notifications.filter((n) => ['ACCEPTED', 'DECLINED'].includes(n.response));
  const closed = requests.filter((r) => r.state === 'CLOSED');
  const fulfilled = requests.filter((r) => ['DONATED', 'CLOSED'].includes(r.state));

  const byOrigin = ['SCHEDULED', 'THRESHOLD_BREACH', 'MANUAL'].map((origin) => ({
    origin,
    count: requests.filter((r) => r.origin === origin).length,
  }));

  const byState = ['DETECTED', 'RAISED', 'NOTIFIED', 'ACCEPTED', 'CONFIRMED', 'ARRIVED', 'DONATED', 'CLOSED'].map((state) => ({
    state,
    count: requests.filter((r) => r.state === state).length,
  }));

  const donorsByGroup = BLOOD_GROUPS.map((bg) => ({
    blood_group: bg,
    donors: donors.filter((d) => (d.blood_group_verified || d.blood_group_self_reported) === bg).length,
    eligible: donors.filter(
      (d) => (d.blood_group_verified || d.blood_group_self_reported) === bg && computeEligibility(d).eligible,
    ).length,
  }));

  const usageByDay = new Map();
  for (const u of usage) usageByDay.set(u.date, (usageByDay.get(u.date) || 0) + u.units_issued);
  const usageTrend = [...usageByDay.entries()].map(([date, units]) => ({ date, units })).sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-30);

  return {
    donors: {
      total: donors.length,
      active: donors.filter((d) => d.status === 'ACTIVE').length,
      provisional: donors.filter((d) => d.status === 'PROVISIONAL').length,
      pending_review: donors.filter((d) => d.status === 'PENDING_REVIEW').length,
      eligible_now: donors.filter((d) => computeEligibility(d).eligible).length,
    },
    institutions: {
      total: institutions.length,
      verified: institutions.filter((i) => i.verification_status === 'VERIFIED').length,
      pending: institutions.filter((i) => i.verification_status === 'PENDING').length,
      in_house: institutions.filter((i) => i.category === 'IN_HOUSE').length,
      external: institutions.filter((i) => i.category === 'EXTERNAL').length,
    },
    requests: {
      total: requests.length,
      awaiting_confirmation: requests.filter((r) => r.state === 'DETECTED').length,
      open: requests.filter((r) => !['CLOSED'].includes(r.state)).length,
      fulfilled: fulfilled.length,
      closed: closed.length,
      fulfillment_rate: requests.length ? Math.round((fulfilled.length / requests.length) * 100) : 0,
      by_origin: byOrigin,
      by_state: byState,
    },
    notifications: {
      sent: notifications.length,
      accepted: notifications.filter((n) => n.response === 'ACCEPTED').length,
      declined: notifications.filter((n) => n.response === 'DECLINED').length,
      response_rate: notifications.length ? Math.round((responded.length / notifications.length) * 100) : 0,
      notifications_per_donation: donations.length ? Number((notifications.length / donations.length).toFixed(2)) : null,
    },
    donations: { total: donations.length, units: donations.reduce((s, d) => s + (d.units || 1), 0) },
    camps: { total: camps.length, upcoming: camps.filter((c) => c.date >= new Date().toISOString().slice(0, 10)).length },
    donors_by_group: donorsByGroup,
    usage_trend: usageTrend,
  };
}
