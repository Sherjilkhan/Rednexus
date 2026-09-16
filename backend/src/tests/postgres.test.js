import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWhereClause } from '../db/postgres.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('PostgreSQL schema.sql file exists and contains table definitions', () => {
  const schemaPath = path.join(__dirname, '../db/schema.sql');
  assert.ok(fs.existsSync(schemaPath), 'schema.sql exists');
  const content = fs.readFileSync(schemaPath, 'utf8');
  assert.ok(content.includes('CREATE TABLE IF NOT EXISTS users'), 'Contains users table');
  assert.ok(content.includes('CREATE TABLE IF NOT EXISTS donors'), 'Contains donors table');
  assert.ok(content.includes('CREATE TABLE IF NOT EXISTS institutions'), 'Contains institutions table');
  assert.ok(content.includes('CREATE TABLE IF NOT EXISTS requests'), 'Contains requests table');
  assert.ok(content.includes('CREATE TABLE IF NOT EXISTS stock_levels'), 'Contains stock_levels table');
  assert.ok(content.includes('CREATE TABLE IF NOT EXISTS audit_log'), 'Contains audit_log table');
  assert.ok(content.includes('CREATE INDEX IF NOT EXISTS'), 'Contains indexes');
});

test('buildWhereClause correctly formats empty filters', () => {
  const { clause, params } = buildWhereClause([]);
  assert.equal(clause, '');
  assert.deepEqual(params, []);
});

test('buildWhereClause correctly formats equality filters', () => {
  const filters = [
    ['email', '==', 'admin@raktasetu.in'],
    ['status', '==', 'ACTIVE'],
  ];
  const { clause, params } = buildWhereClause(filters);
  assert.equal(clause, `WHERE data->>'email' = $1 AND data->>'status' = $2`);
  assert.deepEqual(params, ['admin@raktasetu.in', 'ACTIVE']);
});

test('buildWhereClause correctly formats numeric and boolean filters', () => {
  const filters = [
    ['units_needed', '>=', 5],
    ['paused', '==', false],
  ];
  const { clause, params } = buildWhereClause(filters);
  assert.equal(clause, `WHERE (data->>'units_needed')::numeric >= $1 AND (data->>'paused')::boolean = $2`);
  assert.deepEqual(params, [5, false]);
});

test('buildWhereClause handles IN and array-contains filters', () => {
  const inFilter = [['id', 'in', ['id1', 'id2']]];
  const { clause: inClause, params: inParams } = buildWhereClause(inFilter);
  assert.equal(inClause, 'WHERE id = ANY($1)');
  assert.deepEqual(inParams, [['id1', 'id2']]);

  const arrayFilter = [['roles', 'array-contains', 'ADMIN']];
  const { clause: arrClause, params: arrParams } = buildWhereClause(arrayFilter);
  assert.equal(arrClause, `WHERE data->'roles' @> $1::jsonb`);
  assert.deepEqual(arrParams, ['["ADMIN"]']);
});

test('buildWhereClause handles null values and inequality', () => {
  const filters = [
    ['verified_at', '==', null],
    ['status', '!=', 'DELETED'],
  ];
  const { clause, params } = buildWhereClause(filters);
  assert.equal(clause, `WHERE (data->'verified_at' IS NULL OR data->>'verified_at' = 'null') AND (data->>'status' IS NULL OR data->>'status' != $1)`);
  assert.deepEqual(params, ['DELETED']);
});
