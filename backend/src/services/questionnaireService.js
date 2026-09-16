/**
 * questionnaireService.js
 * Saves questionnaire submissions (emergency blood request OR camp attendance)
 * to the DB and Google Sheets.
 */
import { COLLECTIONS, createDoc } from '../db/index.js';
import { appendToSheet } from './googleSheetsService.js';

/**
 * Save a questionnaire submission.
 * @param {object} opts
 * @param {string} opts.source         - 'EMERGENCY' | 'CAMP'
 * @param {string} opts.donor_id
 * @param {string} [opts.notification_id]  - for EMERGENCY
 * @param {string} [opts.camp_id]          - for CAMP
 * @param {string} [opts.institution_name]
 * @param {object} opts.questionnaire      - full questionnaire payload
 */
export async function saveQuestionnaire({ source, donor_id, notification_id, camp_id, institution_name, questionnaire }) {
  const doc = await createDoc(COLLECTIONS.questionnaires, {
    source,
    donor_id,
    notification_id: notification_id || null,
    camp_id: camp_id || null,
    institution_name: institution_name || null,
    questionnaire,
    submitted_at: new Date().toISOString(),
  });

  // Non-blocking Google Sheets append
  appendToSheet(doc).catch((e) => console.error('[Questionnaire] Sheets append error:', e));

  return doc;
}
