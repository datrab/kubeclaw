import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

test('runtime scan waits for concurrent workers and preserves every report after a blocking finding', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'parallel-image-security-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const executable = path.join(directory, 'trivy/v0.76.1/trivy');
  fs.mkdirSync(path.dirname(executable), { recursive: true });
  fs.writeFileSync(executable, `#!/usr/bin/env node
const fs = require('node:fs');
const a = process.argv.slice(2);
if (a.includes('--version')) { console.log('Version: 0.76.1'); process.exit(0); }
if (a.includes('--download-db-only')) process.exit(0);
const output = a[a.indexOf('--output') + 1];
if (a[0] === 'convert') { fs.writeFileSync(output, 'fixture table'); process.exit(0); }
const ref = a.at(-1);
const events = process.env.SCAN_EVENTS;
fs.appendFileSync(events, JSON.stringify({ kind: 'start', ref }) + '\\n');
setTimeout(() => {
  const vulnerable = ref.includes('blocked');
  fs.writeFileSync(output, JSON.stringify({ SchemaVersion: 2, ArtifactType: 'container_image', Metadata: { RepoDigests: [ref] }, Results: [{ Vulnerabilities: vulnerable ? [{ VulnerabilityID: 'CVE-fixture', Severity: 'HIGH', PkgName: 'owned', InstalledVersion: '1', FixedVersion: '2' }] : [] }] }));
  fs.appendFileSync(events, JSON.stringify({ kind: 'end', ref }) + '\\n');
  process.exit(vulnerable ? 1 : 0);
}, 250);
`, { mode: 0o755 });
  const references = ['blocked', 'clean', 'last'].map((name, i) => `example/${name}@sha256:${String(i + 1).repeat(64)}`);
  const report = path.join(directory, 'reports');
  const eventsFile = path.join(directory, 'events');
  const run = spawnSync('bash', ['scripts/scan-runtime-images.sh', ...references], {
    encoding: 'utf8', timeout: 15000,
    env: { ...process.env, KUBECLAW_TOOL_CACHE: directory, KUBECLAW_TRIVY_REPORT_DIR: report, KUBECLAW_SCAN_JOBS: '2', SCAN_EVENTS: eventsFile },
  });
  assert.equal(run.status, 1, run.stdout + run.stderr);
  const events = fs.readFileSync(eventsFile, 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(events.slice(0, 2).map(event => event.kind), ['start', 'start']);
  assert.equal(events.filter(event => event.kind === 'end').length, 3);
  for (const ref of references) assert.ok(fs.existsSync(path.join(report, ref.split('@sha256:')[1] + '.json')));
});
