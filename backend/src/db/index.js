/**
 * Data layer entry point.
 *
 * Supported Database Modes:
 *   1. PostgreSQL (recommended for production): configured via DATABASE_URL or PG* environment variables.
 *   2. Firebase Firestore: configured via FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS.
 *   3. In-memory Firestore-compatible store: default fallback for zero-config local testing and quickstarts.
 */
import fs from 'node:fs';
import { createMemoryFirestore } from './memoryFirestore.js';
import {
  createPostgresPool,
  initPostgresSchema,
  createPostgresDoc,
  getPostgresDoc,
  updatePostgresDoc,
  listPostgresDocs,
  deletePostgresDoc,
} from './postgres.js';

export const COLLECTIONS = {
  users: 'users',
  donors: 'donors',
  institutions: 'institutions',
  usageRecords: 'usage_records',
  thresholds: 'blood_group_thresholds',
  stock: 'stock_levels',
  requests: 'requests',
  donations: 'donation_records',
  notifications: 'notification_logs',
  camps: 'camps',
  campAttendance: 'camp_attendance',
  auditLog: 'audit_log',
  otps: 'otps',
  questionnaires: 'questionnaire_submissions',
};

let db = null;
let pgPool = null;
let mode = 'memory';

async function initPostgres() {
  const isPostgresExplicit = process.env.DB_MODE === 'postgres';
  const hasPostgresEnv = Boolean(process.env.DATABASE_URL || (process.env.PGHOST && process.env.PGDATABASE));

  if (!isPostgresExplicit && !hasPostgresEnv) return null;

  try {
    const pool = createPostgresPool();
    // Test connection
    const client = await pool.connect();
    client.release();

    // Auto-create tables & schema
    await initPostgresSchema(pool);
    console.log('[db] Connected to PostgreSQL and verified schema.');
    return pool;
  } catch (err) {
    if (isPostgresExplicit) {
      throw new Error(`[db] Explicit PostgreSQL mode failed to connect: ${err.message}`);
    }
    console.warn('[db] PostgreSQL init failed, checking other backends:', err.message);
    return null;
  }
}

async function initFirestore() {
  const isFirestoreExplicit = process.env.DB_MODE === 'firestore';
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const adcPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (!isFirestoreExplicit && !raw && !adcPath) return null;

  try {
    const admin = await import('firebase-admin');
    const app = admin.default.apps?.length
      ? admin.default.app()
      : admin.default.initializeApp(
          raw
            ? {
                credential: admin.default.credential.cert(
                  JSON.parse(raw.trim().startsWith('{') ? raw : fs.readFileSync(raw, 'utf8')),
                ),
              }
            : { credential: admin.default.credential.applicationDefault() },
        );
    return admin.default.firestore(app);
  } catch (err) {
    if (isFirestoreExplicit) {
      throw new Error(`[db] Explicit Firestore mode failed: ${err.message}`);
    }
    console.warn('[db] Firestore init failed, falling back to in-memory store:', err.message);
    return null;
  }
}

export async function initDb(forcedMode) {
  if (forcedMode === 'memory') {
    db = createMemoryFirestore();
    mode = 'memory';
    return db;
  }
  if (db || pgPool) return db || pgPool;

  // 1. Try PostgreSQL if configured
  const postgresPool = await initPostgres();
  if (postgresPool) {
    pgPool = postgresPool;
    mode = 'postgres';
    console.log(`[db] mode = ${mode}`);
    return pgPool;
  }

  // 2. Try Firestore if configured
  const remote = await initFirestore();
  if (remote) {
    db = remote;
    mode = 'firestore';
  } else {
    // 3. Fallback to in-memory Firestore-compatible store
    db = createMemoryFirestore();
    mode = 'memory';
  }

  console.log(`[db] mode = ${mode}`);
  return db;
}

export function getDb() {
  if (mode === 'postgres') {
    if (!pgPool) throw new Error('PostgreSQL not initialised — call initDb() first');
    return pgPool;
  }
  if (!db) throw new Error('DB not initialised — call initDb() first');
  return db;
}

export function getPgPool() {
  return pgPool;
}

export function getDbMode() {
  return mode;
}

export async function closeDb() {
  if (pgPool) {
    await pgPool.end();
    pgPool = null;
  }
  db = null;
  mode = 'memory';
}

/* ---------- Repository helpers shared by all services ---------- */

export const col = (name) => {
  if (mode === 'postgres') {
    // Adapter shim for any code calling col(name) directly
    return {
      doc: (id) => ({ 
        get: async () => {
          const data = await getDoc(name, id);
          return { exists: !!data, id, data: () => data };
        },
        set: async (payload, opts) => {
          if (opts?.merge) {
            return updateDoc(name, id, payload);
          }
          return createDoc(name, payload, id);
        },
        delete: async () => deleteDoc(name, id),
      }),
      where: (field, op, value) => {
        const filters = [[field, op, value]];
        const chain = {
          where: (f, o, v) => {
            filters.push([f, o, v]);
            return chain;
          },
          get: async () => {
            const docs = await listDocs(name, filters);
            return {
              docs: docs.map((d) => ({
                id: d.id,
                data: () => d,
              })),
            };
          },
        };
        return chain;
      },
      get: async () => {
        const docs = await listDocs(name);
        return {
          docs: docs.map((d) => ({
            id: d.id,
            data: () => d,
          })),
        };
      },
    };
  }
  return getDb().collection(name);
};

export async function createDoc(name, data, id) {
  if (mode === 'postgres') {
    return createPostgresDoc(pgPool, name, data, id);
  }
  const ref = id ? col(name).doc(id) : col(name).doc();
  const payload = { ...data, id: ref.id, created_at: data.created_at || new Date().toISOString() };
  await ref.set(payload);
  return payload;
}

export async function getDoc(name, id) {
  if (!id) return null;
  if (mode === 'postgres') {
    return getPostgresDoc(pgPool, name, id);
  }
  const snap = await col(name).doc(id).get();
  return snap.exists ? { ...snap.data(), id: snap.id } : null;
}

export async function updateDoc(name, id, patch) {
  if (mode === 'postgres') {
    return updatePostgresDoc(pgPool, name, id, patch);
  }
  await col(name).doc(id).set(patch, { merge: true });
  return getDoc(name, id);
}

export async function listDocs(name, filters = []) {
  if (mode === 'postgres') {
    return listPostgresDocs(pgPool, name, filters);
  }
  let q = col(name);
  for (const [field, op, value] of filters) q = q.where(field, op, value);
  const snap = await q.get();
  return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
}

export async function deleteDoc(name, id) {
  if (mode === 'postgres') {
    return deletePostgresDoc(pgPool, name, id);
  }
  await col(name).doc(id).delete();
}
