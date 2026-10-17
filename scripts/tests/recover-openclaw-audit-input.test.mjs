import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { recoverAuditInput } from '../recover-openclaw-audit-input.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function fixture(t) {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-recovery-'));
  t.after(() => fs.rmSync(stateDir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(stateDir, 'logs')); fs.mkdirSync(path.join(stateDir, 'state'));
  const rawPath = path.join(stateDir, 'logs/config-audit.jsonl.migrated.raw');
  const sanitizedPath = rawPath.slice(0, -4);
  const raw = Buffer.from(' \t\t '.repeat(50));
  const sanitized = Buffer.from('{"ts":"2026-09-01T00:00:00Z","event":"config.write"}\n');
  fs.writeFileSync(rawPath, raw); fs.writeFileSync(sanitizedPath, sanitized);
  const databasePath = path.join(stateDir, 'state/openclaw.sqlite');
  const db = new DatabaseSync(databasePath);
  db.exec('CREATE TABLE diagnostic_events(scope TEXT, event_key TEXT, payload_json TEXT, PRIMARY KEY(scope,event_key))');
  db.prepare('INSERT INTO diagnostic_events VALUES(?,?,?)').run('config-audit', 'existing', '{"preserved":true}'); db.close();
  return { stateDir, rawPath, sanitizedPath, databasePath, raw, sanitized,
    options: { stateDir, rawSha256: digest(raw), sanitizedSha256: digest(sanitized) } };
}

test('dry run changes nothing; recovery preserves originals and leaves SQLite untouched', t => {
  const f = fixture(t), database = fs.readFileSync(f.databasePath);
  assert.equal(recoverAuditInput(f.options).applied, false);
  assert.deepEqual(fs.readFileSync(f.rawPath), f.raw);
  const result = recoverAuditInput({ ...f.options, apply: true });
  assert.equal(result.records, 1);
  assert.deepEqual(fs.readFileSync(result.backup), f.raw);
  assert.deepEqual(fs.readFileSync(f.rawPath), f.sanitized);
  assert.deepEqual(fs.readFileSync(f.sanitizedPath), f.sanitized);
  assert.deepEqual(fs.readFileSync(f.databasePath), database);
  assert.throws(() => recoverAuditInput({ ...f.options, apply: true }), /ARCHIVE_HASH_MISMATCH/);
});

test('refuses altered hashes, unconsumed raw records, and invalid sanitized records', t => {
  const f = fixture(t);
  assert.throws(() => recoverAuditInput({ ...f.options, rawSha256: '0'.repeat(64), apply: true }), /ARCHIVE_HASH_MISMATCH/);
  fs.writeFileSync(f.rawPath, '{}\n');
  assert.throws(() => recoverAuditInput({ ...f.options, rawSha256: digest('{}\n'), apply: true }), /FULLY_SCRUBBED_RAW_REQUIRED/);
  fs.writeFileSync(f.rawPath, f.raw); fs.writeFileSync(f.sanitizedPath, '[]\n');
  assert.throws(() => recoverAuditInput({ ...f.options, sanitizedSha256: digest('[]\n'), apply: true }), /VALID_SANITIZED_RECORDS_REQUIRED/);
  assert.deepEqual(fs.readFileSync(f.rawPath), f.raw);
});

test('refuses existing checkpoints and interrupted doctor journals', t => {
  const f = fixture(t), db = new DatabaseSync(f.databasePath);
  const generationKey = digest('logs/config-audit.jsonl.migrated.raw').slice(0, 16);
  db.prepare('INSERT INTO diagnostic_events VALUES(?,?,?)').run('migration.legacy-audit-raw', generationKey, JSON.stringify({ generationKey })); db.close();
  assert.throws(() => recoverAuditInput({ ...f.options, apply: true }), /EXISTING_CHECKPOINT/);
  fs.writeFileSync(`${f.rawPath}.doctor-scrub-restore`, '{}');
  assert.throws(() => recoverAuditInput({ ...f.options, apply: true }), /EXISTING_DOCTOR_RECOVERY_JOURNAL/);
  assert.deepEqual(fs.readFileSync(f.rawPath), f.raw);
});

test('rejects symlinks and conflicting backup contents without replacing the input', t => {
  const f = fixture(t), backup = `${f.rawPath}.recovery-${f.options.rawSha256}`;
  fs.symlinkSync(f.rawPath, backup);
  assert.throws(() => recoverAuditInput({ ...f.options, apply: true }), /REGULAR_UNLINKED_FILE_REQUIRED/);
  fs.unlinkSync(backup); fs.writeFileSync(backup, 'unrelated evidence');
  assert.throws(() => recoverAuditInput({ ...f.options, apply: true }), /RECOVERY_BACKUP_MISMATCH/);
  assert.deepEqual(fs.readFileSync(f.rawPath), f.raw);
  assert.equal(fs.readFileSync(backup, 'utf8'), 'unrelated evidence');
});
