// Run with the pinned OpenClaw image, not a mocked migration implementation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { recoverAuditInput } from '../recover-openclaw-audit-input.mjs';

const root = fs.mkdtempSync('/tmp/kubeclaw-audit-integration-');
process.env.OPENCLAW_STATE_DIR = root;
process.env.HOME = root;
const doctorModule = process.argv[2];
assert.ok(doctorModule, 'Pass the doctor migration module from the pinned image');
const { t: migrate } = await import(pathToFileURL(doctorModule).href);
const options = { cfg: {}, env: { HOME: root, OPENCLAW_STATE_DIR: root }, homedir: () => root, doctorOnlyStateMigrations: true };
fs.mkdirSync(path.join(root, 'logs'), { recursive: true });
fs.writeFileSync(path.join(root, 'logs/config-audit.jsonl'),
  JSON.stringify({ ts: '2026-09-01T00:00:00.000Z', source: 'test', event: 'config.write', argv: [], execArgv: [] }) + '\n');
const first = await migrate(options);
assert.deepEqual(first.warnings, []);
const db = new DatabaseSync(path.join(root, 'state/openclaw.sqlite'));
assert.equal(db.prepare('SELECT count(*) AS n FROM diagnostic_events WHERE scope=?').get('config-audit').n, 1);
const rawPath = path.join(root, 'logs/config-audit.jsonl.migrated.raw');
const digest = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
for (const removeImportedRecord of [false, true]) {
  db.prepare('DELETE FROM diagnostic_events WHERE scope=?').run('migration.legacy-audit-raw');
  if (removeImportedRecord) db.prepare('DELETE FROM diagnostic_events WHERE scope=?').run('config-audit');
  const refused = await migrate(options);
  assert.ok(refused.warnings.some(warning => warning.includes('ambiguous whitespace')));
  const repair = recoverAuditInput({ stateDir: root, rawSha256: digest(rawPath), sanitizedSha256: digest(rawPath.slice(0, -4)), apply: true });
  assert.equal(repair.applied, true);
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await migrate(options);
    assert.deepEqual(result.warnings, []);
    assert.equal(db.prepare('SELECT count(*) AS n FROM diagnostic_events WHERE scope=?').get('config-audit').n, 1);
    assert.equal(db.prepare('SELECT count(*) AS n FROM diagnostic_events WHERE scope=?').get('migration.legacy-audit-raw').n, 1);
  }
}
db.close();
console.log(JSON.stringify({ ok: true, originalFailureReproduced: true, normalMigrationRecovered: true,
  missingRecordRecovered: true, duplicateRecords: 0, fixture: root }));
