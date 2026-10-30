import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { discoverEventCandidates } from '../lib/docs-event-contracts.mjs';

test('actual CLI generates deterministically and check rejects stale/missing/unknown sources without file writes', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'event-contract-cli-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  for (const file of ['scripts/docs-event-contracts.mjs', 'scripts/lib/docs-event-contracts.mjs',
    'scripts/lib/docs-event-reference-collector.mjs', 'scripts/lib/docs-event-reference.mjs']) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.copyFileSync(path.join(project, file), path.join(root, file));
  }
  fs.symlinkSync(fs.realpathSync(path.join(project, 'node_modules')), path.join(root, 'node_modules'));
  for (const dir of ['skills/app', 'docs/config', 'docs/site/reference']) fs.mkdirSync(path.join(root, dir), { recursive: true });
  fs.writeFileSync(path.join(root, 'skills/app/events.ts'), "export function publish(){return {schema:'wire.v1',payload:{id:'x'}}}");
  fs.writeFileSync(path.join(root, 'docs/site/reference/events.md'), '# Authored safety boundary\n');
  execFileSync('git', ['init', '-q', root]); execFileSync('git', ['add', 'skills'], { cwd: root });
  const census = discoverEventCandidates(root);
  fs.writeFileSync(path.join(root, 'docs/config/event-reference-bindings.json'), JSON.stringify({
    schemaVersion: 'event-reference-bindings.v1', qualifiedSourceVectorSha256: census.sourceSetSha256,
    families: [{ id: 'wire', boundary: 'Fixture constructor, not observed delivery.',
      versionAuthority: { kind: 'constructor-field', path: 'skills/app/events.ts', field: 'schema', enclosingSelector: 'export function publish' },
      roles: [{ role: 'producer', path: 'skills/app/events.ts', selector: 'function publish', condition: 'When called.' }],
      constructorSources: ['skills/app/events.ts'], limits: ['No receiver binding.'] }],
  }));
  const run = (...args) => spawnSync(process.execPath, ['scripts/docs-event-contracts.mjs', ...args], { cwd: root, encoding: 'utf8' });
  const snapshot = () => {
    const entries = [];
    const walk = (dir, prefix = '') => {
      for (const name of fs.readdirSync(dir).sort()) {
        if (prefix === '' && name === '.git') continue;
        const file = path.join(dir, name); const relative = prefix + name;
        const stat = fs.lstatSync(file);
        if (stat.isSymbolicLink()) entries.push([relative, 'symlink', fs.readlinkSync(file)]);
        else if (stat.isDirectory()) { entries.push([relative, 'directory']); walk(file, relative + '/'); }
        else entries.push([relative, crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]);
      }
    };
    walk(root); return entries;
  };
  const first = run(); assert.equal(first.status, 0, first.stderr); const generated = snapshot();
  const second = run(); assert.equal(second.status, 0, second.stderr); assert.deepEqual(snapshot(), generated);
  const check = run('--check'); assert.equal(check.status, 0, check.stderr); assert.deepEqual(snapshot(), generated);
  const inventory = path.join(root, 'docs/generated/inventory/event-contracts.json');
  fs.appendFileSync(inventory, ' '); const stale = snapshot();
  const drift = run('--check'); assert.equal(drift.status, 1); assert.match(drift.stderr, /DOC_DRIFT_EVENT_CONTRACT/u); assert.deepEqual(snapshot(), stale);
  fs.rmSync(inventory); const missing = snapshot();
  assert.equal(run('--check').status, 1); assert.deepEqual(snapshot(), missing);
  fs.writeFileSync(path.join(root, 'skills/app/new.ts'), 'export const other={schema:"new.v1"};');
  execFileSync('git', ['add', 'skills/app/new.ts'], { cwd: root }); const added = snapshot();
  const unqualified = run(); assert.equal(unqualified.status, 1); assert.match(unqualified.stderr, /SEMANTIC_DISPOSITION_REQUIRED:source-vector:/u); assert.deepEqual(snapshot(), added);
});
