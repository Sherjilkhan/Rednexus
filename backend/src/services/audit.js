import { COLLECTIONS, createDoc, listDocs } from '../db/index.js';

/**
 * Human-confirmation audit trail (Architecture §3).
 * Every threshold confirmation and every DETECTED -> RAISED transition is recorded
 * with WHO did it and WHEN. No PII is logged — ids and names of staff only.
 */
export async function recordAudit({ action, actor, entity_type, entity_id, institution_id, before, after, note }) {
  return createDoc(COLLECTIONS.auditLog, {
    action,
    actor_user_id: actor?.id || null,
    actor_name: actor?.name || null,
    actor_role: actor?.role || null,
    institution_id: institution_id || actor?.institution_id || null,
    entity_type,
    entity_id,
    before: before ?? null,
    after: after ?? null,
    note: note || null,
    at: new Date().toISOString(),
  });
}

export async function listAudit(institutionId) {
  const rows = institutionId
    ? await listDocs(COLLECTIONS.auditLog, [['institution_id', '==', institutionId]])
    : await listDocs(COLLECTIONS.auditLog);
  return rows.sort((a, b) => (a.at < b.at ? 1 : -1));
}
