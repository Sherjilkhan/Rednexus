import test from 'node:test';
import assert from 'node:assert/strict';
import { computeEligibility, contactable, addDays, isoDay } from '../services/eligibility.js';

const donor = (over = {}) => ({ gender: 'MALE', status: 'ACTIVE', last_donation_date: null, preferences: {}, ...over });
const dayOffset = (n) => isoDay(addDays(new Date(), n));

test('never donated -> eligible', () => {
  assert.equal(computeEligibility(donor()).eligible, true);
});

test('male eligible after 90 days, not before', () => {
  assert.equal(computeEligibility(donor({ last_donation_date: dayOffset(-89) })).eligible, false);
  assert.equal(computeEligibility(donor({ last_donation_date: dayOffset(-91) })).eligible, true);
});

test('female interval is 120 days', () => {
  const f = { gender: 'FEMALE' };
  assert.equal(computeEligibility(donor({ ...f, last_donation_date: dayOffset(-100) })).eligible, false);
  assert.equal(computeEligibility(donor({ ...f, last_donation_date: dayOffset(-121) })).eligible, true);
});

test('future deferral_until_date overrides an elapsed standard interval', () => {
  const el = computeEligibility(donor({ last_donation_date: dayOffset(-400), deferral_until_date: dayOffset(30) }));
  assert.equal(el.eligible, false);
  assert.equal(el.eligibility_status, 'DEFERRED');
  assert.equal(el.deferral_override, true);
});

test('past deferral date no longer blocks', () => {
  assert.equal(computeEligibility(donor({ last_donation_date: dayOffset(-400), deferral_until_date: dayOffset(-1) })).eligible, true);
});

test('PENDING_REVIEW donor is never eligible', () => {
  assert.equal(computeEligibility(donor({ status: 'PENDING_REVIEW' })).eligible, false);
});

test('paused donor is eligible but not contactable', () => {
  const d = donor({ preferences: { paused: true } });
  assert.equal(computeEligibility(d).eligible, true);
  assert.equal(contactable(d).ok, false);
});
