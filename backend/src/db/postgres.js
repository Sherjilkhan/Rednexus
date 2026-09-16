/**
 * PostgreSQL Database Adapter for Raktasetu.
 * 
 * Uses native PostgreSQL with JSONB documents and indexed fields for maximum
 * flexibility, blazing speed, and relational reliability.
 */
import pg from 'pg';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';   
import { fileURLToPath } from 'node:url';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VALID_TABLES = new Set([
  'users',
  'donors',
  'institutions',
  'usage_records',
  'blood_group_thresholds',
  'stock_levels',
  'requests',
  'donation_records',
  'notification_logs',
  'camps',
  'camp_attendance',
  'audit_log',
]);

function getTableName(name) {
  if (!VALID_TABLES.has(name)) {
    // Sanitise custom table names to alphanumeric + underscores only
    const safe = name.replace(/[^a-z0-9_]/gi, '').toLowerCase();
    if (!safe) throw new Error(`Invalid table name: ${name}`);
    return safe;
  }
  return name;
}

export function createPostgresPool(options = {}) {
  const connectionString = options.connectionString || process.env.DATABASE_URL;
  const ssl = options.ssl ?? (process.env.PGSSL === 'true' || connectionString?.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined);

  if (connectionString) {
    return new Pool({
      connectionString,
      ssl,
      max: options.max || 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }

  return new Pool({
    host: options.host || process.env.PGHOST || 'localhost',
    port: Number(options.port || process.env.PGPORT || 5432),
    user: options.user || process.env.PGUSER || 'postgres',
    password: options.password || process.env.PGPASSWORD || '',
    database: options.database || process.env.PGDATABASE || 'raktasetu',
    ssl,
    max: options.max || 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
}

export async function initPostgresSchema(pool) {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  const client = await pool.connect();
  try {
    await client.query(schemaSql);
  } finally {
    client.release();
  }
}

export async function createPostgresDoc(pool, collectionName, data, id) {
  const table = getTableName(collectionName);
  const docId = id || data.id || crypto.randomUUID();
  const payload = {
    ...data,
    id: docId,
    created_at: data.created_at || new Date().toISOString(),
  };

  const query = `
    INSERT INTO ${table} (id, data, created_at, updated_at)
    VALUES ($1, $2::jsonb, $3::timestamptz, NOW())
    ON CONFLICT (id) DO UPDATE
      SET data = EXCLUDED.data, updated_at = NOW()
    RETURNING data;
  `;

  const result = await pool.query(query, [docId, JSON.stringify(payload), payload.created_at]);
  return result.rows[0]?.data || payload;
}

export async function getPostgresDoc(pool, collectionName, id) {
  if (!id) return null;
  const table = getTableName(collectionName);
  const result = await pool.query(`SELECT data FROM ${table} WHERE id = $1`, [String(id)]);
  return result.rows[0]?.data || null;
}

export async function updatePostgresDoc(pool, collectionName, id, patch) {
  if (!id) throw new Error('Cannot update document without an ID');
  const table = getTableName(collectionName);

  // Deep merge patch into existing document data
  const query = `
    UPDATE ${table}
    SET data = data || $1::jsonb, updated_at = NOW()
    WHERE id = $2
    RETURNING data;
  `;

  const result = await pool.query(query, [JSON.stringify(patch), String(id)]);
  if (!result.rows.length) {
    // If not exists yet, create it
    return createPostgresDoc(pool, collectionName, patch, id);
  }
  return result.rows[0]?.data;
}

export function buildWhereClause(filters = []) {
  if (!filters.length) return { clause: '', params: [] };

  const conditions = [];
  const params = [];

  for (const [field, op, rawValue] of filters) {
    const paramIdx = params.length + 1;

    if (field === 'id') {
      if (op === '==' || op === '=') {
        conditions.push(`id = $${paramIdx}`);
        params.push(String(rawValue));
      } else if (op === '!=') {
        conditions.push(`id != $${paramIdx}`);
        params.push(String(rawValue));
      } else if (op === 'in') {
        conditions.push(`id = ANY($${paramIdx})`);
        params.push(Array.isArray(rawValue) ? rawValue.map(String) : [String(rawValue)]);
      }
      continue;
    }

    if (op === '==' || op === '=') {
      if (typeof rawValue === 'number') {
        conditions.push(`(data->>'${field}')::numeric = $${paramIdx}`);
        params.push(rawValue);
      } else if (typeof rawValue === 'boolean') {
        conditions.push(`(data->>'${field}')::boolean = $${paramIdx}`);
        params.push(rawValue);
      } else if (rawValue === null) {
        conditions.push(`(data->'${field}' IS NULL OR data->>'${field}' = 'null')`);
      } else {
        conditions.push(`data->>'${field}' = $${paramIdx}`);
        params.push(String(rawValue));
      }
    } else if (op === '!=') {
      conditions.push(`(data->>'${field}' IS NULL OR data->>'${field}' != $${paramIdx})`);
      params.push(String(rawValue));
    } else if (op === '>') {
      if (typeof rawValue === 'number') {
        conditions.push(`(data->>'${field}')::numeric > $${paramIdx}`);
        params.push(rawValue);
      } else {
        conditions.push(`data->>'${field}' > $${paramIdx}`);
        params.push(String(rawValue));
      }
    } else if (op === '>=') {
      if (typeof rawValue === 'number') {
        conditions.push(`(data->>'${field}')::numeric >= $${paramIdx}`);
        params.push(rawValue);
      } else {
        conditions.push(`data->>'${field}' >= $${paramIdx}`);
        params.push(String(rawValue));
      }
    } else if (op === '<') {
      if (typeof rawValue === 'number') {
        conditions.push(`(data->>'${field}')::numeric < $${paramIdx}`);
        params.push(rawValue);
      } else {
        conditions.push(`data->>'${field}' < $${paramIdx}`);
        params.push(String(rawValue));
      }
    } else if (op === '<=') {
      if (typeof rawValue === 'number') {
        conditions.push(`(data->>'${field}')::numeric <= $${paramIdx}`);
        params.push(rawValue);
      } else {
        conditions.push(`data->>'${field}' <= $${paramIdx}`);
        params.push(String(rawValue));
      }
    } else if (op === 'in') {
      conditions.push(`data->>'${field}' = ANY($${paramIdx})`);
      params.push(Array.isArray(rawValue) ? rawValue.map(String) : [String(rawValue)]);
    } else if (op === 'array-contains') {
      conditions.push(`data->'${field}' @> $${paramIdx}::jsonb`);
      params.push(JSON.stringify([rawValue]));
    } else {
      conditions.push(`data->>'${field}' = $${paramIdx}`);
      params.push(String(rawValue));
    }
  }

  return {
    clause: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
}

export async function listPostgresDocs(pool, collectionName, filters = []) {
  const table = getTableName(collectionName);
  const { clause, params } = buildWhereClause(filters);
  const query = `SELECT data FROM ${table} ${clause} ORDER BY created_at DESC;`;
  const result = await pool.query(query, params);
  return result.rows.map((row) => row.data);
}

export async function deletePostgresDoc(pool, collectionName, id) {
  if (!id) return;
  const table = getTableName(collectionName);
  await pool.query(`DELETE FROM ${table} WHERE id = $1`, [String(id)]);
}
