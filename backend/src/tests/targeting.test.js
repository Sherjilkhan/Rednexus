import test from 'node:test';
import assert from 'node:assert/strict';
import { initDb, COLLECTIONS, createDoc } from '../db/index.js';
import { buildTargetPool } from '../services/requestService.js';
import { addDays, isoDay } from '../services/eligibility.js';

await initDb('memory');
const dayOffset = (n) => isoDay(addDays(new Date(), n));

const base = { status: 'ACTIVE', gender: 'MALE', preferences: { max_contacts_per_month: 2, paused: false }, area_pincode: '411001' };

const ok = await createDoc(COLLECTIONS.donors, { ...base, name: 'Match', blood_group_self_reported: 'O+', last_donation_date: dayOffset(-200) });
await createDoc(COLLECTIONS.donors, { ...base, name: 'Wrong group', blood_group_self_reported: 'A+', last_donation_date: dayOffset(-200) });
await createDoc(COLLECTIONS.donors, { ...base, name: 'Too recent', blood_group_self_reported: 'O+', last_donation_date: dayOffset(-10) });
await createDoc(COLLECTIONS.donors, { ...base, name: 'Paused', blood_group_self_reported: 'O+', last_donation_date: dayOffset(-200), preferences: { paused: true, max_contacts_per_month: 2 } });
await createDoc(COLLECTIONS.donors, { ...base, name: 'Pending', status: 'PENDING_REVIEW', blood_group_self_reported: 'O+', last_donation_date: dayOffset(-200) });
const capped = await createDoc(COLLECTIONS.donors, { ...base, name: 'Capped', blood_group_self_reported: 'O+', last_donation_date: dayOffset(-200), preferences: { max_contacts_per_month: 1, paused: false } });
await createDoc(COLLECTIONS.notifications, { donor_id: capped.id, request_id: 'other', sent_at: new Date().toISOString(), response: 'PENDING' });

const request = { id: 'req1', institution_id: 'inst1', blood_group: 'O+', units_needed: 5 };

test('filter chain excludes for the stated reason at each stage', async () => {
  const { pool, excluded } = await buildTargetPool(request);
  const names = pool.map((p) => p.donor.name);
  assert.deepEqual(names, ['Match']);
  const reasons = Object.fromEntries(excluded.map((e) => [e.stage_filter, true]));
  assert.ok(reasons.ELIGIBILITY_OR_PREFERENCE, 'eligibility/preference filter fired');
  assert.ok(reasons.BUDGET, 'monthly budget filter fired');
  assert.ok(reasons.REVIEW, 'pending-review filter fired');
});

test('already-notified donors are not re-notified for the same request', async () => {
  await createDoc(COLLECTIONS.notifications, { donor_id: ok.id, request_id: request.id, sent_at: new Date().toISOString(), response: 'PENDING' });
  const { pool, excluded } = await buildTargetPool(request);
  assert.equal(pool.length, 0);
  assert.ok(excluded.some((e) => e.stage_filter === 'DEDUPE'));
});
