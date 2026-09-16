import test from 'node:test';
import assert from 'node:assert/strict';
import { canTransition, assertTransition, TRANSITIONS } from '../services/requestService.js';

test('legal happy path transitions are allowed', () => {
  const path = ['DETECTED', 'RAISED', 'NOTIFIED', 'ACCEPTED', 'CONFIRMED', 'ARRIVED', 'DONATED', 'CLOSED'];
  for (let i = 0; i < path.length - 1; i++) assert.equal(canTransition(path[i], path[i + 1]), true, `${path[i]}->${path[i + 1]}`);
});

test('illegal transitions are rejected', () => {
  assert.equal(canTransition('RAISED', 'DONATED'), false);
  assert.equal(canTransition('DETECTED', 'NOTIFIED'), false);
  assert.equal(canTransition('CLOSED', 'RAISED'), false);
  assert.equal(canTransition('NOTIFIED', 'CONFIRMED'), false);
  assert.throws(() => assertTransition('RAISED', 'DONATED'), /Illegal request transition/);
});

test('escalation keeps NOTIFIED -> NOTIFIED legal', () => {
  assert.equal(canTransition('NOTIFIED', 'NOTIFIED'), true);
});

test('CLOSED is terminal', () => {
  assert.deepEqual(TRANSITIONS.CLOSED, []);
});

test('respondToNotification accepts questionnaire payload and persists it', async () => {
  const { initDb, COLLECTIONS, createDoc, getDoc } = await import('../db/index.js');
  const { respondToNotification } = await import('../services/requestService.js');
  await initDb();

  const reqDoc = await createDoc(COLLECTIONS.requests, {
    institution_id: 'test-inst',
    blood_group: 'B+',
    units_needed: 1,
    state: 'NOTIFIED',
    escalation_stage: 1,
  });

  const notifDoc = await createDoc(COLLECTIONS.notifications, {
    donor_id: 'test-donor-123',
    request_id: reqDoc.id,
    institution_id: 'test-inst',
    blood_group: 'B+',
    response: 'PENDING',
    sent_at: new Date().toISOString(),
  });

  const sampleQuestionnaire = {
    personal: { name: 'Test Donor', occupation: 'Engineer' },
    current_wellness: { feeling_well_today: 'YES' },
    medical_conditions: ['Allergy'],
    consent: { donor_confirmed: true },
  };

  const updated = await respondToNotification(notifDoc.id, 'test-donor-123', 'ACCEPTED', sampleQuestionnaire);
  assert.equal(updated.response, 'ACCEPTED');
  assert.deepEqual(updated.questionnaire, sampleQuestionnaire);

  const persisted = await getDoc(COLLECTIONS.notifications, notifDoc.id);
  assert.equal(persisted.response, 'ACCEPTED');
  assert.equal(persisted.questionnaire.personal.name, 'Test Donor');
});

