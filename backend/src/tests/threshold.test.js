import test from 'node:test';
import assert from 'node:assert/strict';
import { computeProposal } from '../services/thresholdService.js';
import { addDays, isoDay } from '../services/eligibility.js';

const rows = Array.from({ length: 14 }, (_, i) => ({
  blood_group: 'O+',
  units_issued: 4,
  date: isoDay(addDays(new Date(), -i)),
}));

test('rolling average produces threshold and recurring target', () => {
  const p = computeProposal(rows, 'O+');
  assert.equal(p.avg_daily_consumption, 4);
  assert.equal(p.proposed_threshold, 20); // 4/day * 5 days buffer
  assert.equal(p.recurring_collection_target, 28); // 4/day * 7 days
  assert.equal(p.data_confidence, 'HIGH');
});

test('no data is reported as low confidence, never as zero-confidence crash', () => {
  const p = computeProposal([], 'AB-');
  assert.equal(p.stale, true);
  assert.equal(p.data_confidence, 'LOW');
  assert.equal(p.proposed_threshold, 1);
});
