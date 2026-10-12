import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { TrivyDatabaseEvidence } from '../../../engine/test-gates/trivy-database.ts';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm, realpath } from 'node:fs/promises';
import path from 'node:path';
import { constants } from 'node:fs';
import os from 'node:os';
import { SecurityScanCapabilityInvoker } from '../../../engine/test-gates/security-scan-runtime.ts';
import { inspectTrivyDatabases, databasePolicy, assertStableDatabases } from '../../../engine/test-gates/trivy-database.ts';
import { databaseEvidence } from '../src/database-evidence.js';

const executable = process.env.KUBECLAW_SECURITY_TEST_TRIVY ?? '/usr/local/bin/trivy';
const cache = await realpath(process.env.KUBECLAW_SECURITY_TEST_CACHE ?? path.join(os.homedir(), '.cache/trivy'));
const policy = databasePolicy();
const request = { operation: 'dependency', payload: { projectDirectory: '.' } };
function scanner(workspaceRoot: string, cacheDirectory = cache, maximumExecutionMs = 120000) {
  return new SecurityScanCapabilityInvoker({ workspaceRoot, trivyExecutable: executable, allowedRegistryPrefixes: ['docker.io/library'],
    cacheDirectory, maximumExecutionMs, maximumOutputBytes: 64 * 1024 * 1024 });
}
async function fixture(t: { after(callback: () => Promise<void>): void }) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'trivy-freshness-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'freshness-test', version: '1.0.0', private: true }));
  await writeFile(path.join(root, 'package-lock.json'), JSON.stringify({ name: 'freshness-test', version: '1.0.0', lockfileVersion: 3,
    requires: true, packages: { '': { name: 'freshness-test', version: '1.0.0' } } }));
  return root;
}
async function cacheCopy(root: string) {
  const copy = path.join(root, 'cache');
  for (const [directory, name] of [['db', 'trivy.db'], ['java-db', 'trivy-java.db']] as const) {
    await mkdir(path.join(copy, directory), { recursive: true });
    // Separate real DB copies avoid hardlink ctime changes in concurrent scanner tests.
    await copyFile(path.join(cache, directory, name), path.join(copy, directory, name), constants.COPYFILE_FICLONE);
    await writeFile(path.join(copy, directory, 'metadata.json'), await readFile(path.join(cache, directory, 'metadata.json')));
  }
  return copy;
}

test('original native Trivy scan returns both actual stable DB identities and source ages', async t => {
  const root = await fixture(t);
  const result = await scanner(root).invoke('security.scan', request, new AbortController().signal);
  const evidence: TrivyDatabaseEvidence = databaseEvidence(result);
  assert.equal(result.scanner, 'trivy'); assert.deepEqual(result.findings, []);
  assert.deepEqual(evidence.databases.map(item => item.kind), ['vulnerability', 'java']);
  for (const item of evidence.databases) assert.match(item.databaseDigest, /^sha256:[a-f0-9]{64}$/u);
  assert.throws(() => databaseEvidence({ ...result, databaseEvidence: undefined }), /EVIDENCE_REQUIRED/u);
  assert.throws(() => databaseEvidence({ ...result, databaseEvidence: { ...evidence, databases: [] } }), /EVIDENCE_INVALID/u);
});

test('old copied source metadata fails even with a current DownloadedAt and payload policy override', async t => {
  const root = await fixture(t), copy = await cacheCopy(root);
  const meta = path.join(copy, 'db', 'metadata.json');
  const original = JSON.parse(await readFile(meta, 'utf8'));
  await writeFile(meta, JSON.stringify({ ...original, UpdatedAt: '2000-01-01T00:00:00Z', NextUpdate: '2000-01-02T00:00:00Z', DownloadedAt: new Date().toISOString() }));
  const originalScan = await promisify(execFile)(executable, ['fs', '--cache-dir', copy, '--scanners', 'vuln', '--format', 'json', '--quiet', '--skip-db-update', '--skip-java-db-update', '--offline-scan', '--skip-version-check', '--disable-telemetry', root], { timeout: 120000, maxBuffer: 64 * 1024 * 1024 });
  assert.equal(JSON.parse(originalScan.stdout).SchemaVersion, 2, 'original offline command accepts deliberately stale metadata');
  await assert.rejects(scanner(root, copy).invoke('security.scan', { ...request, payload: { projectDirectory: '.', maximumVulnerabilityAgeMs: Number.MAX_SAFE_INTEGER } }, new AbortController().signal), /DATABASE_STALE:vulnerability/u);
});

test('real database metadata changes, wrong schema, missing Java metadata and abort cannot authorize success', async t => {
  const root = await fixture(t), copy = await cacheCopy(root);
  const before = await inspectTrivyDatabases(copy, policy, new AbortController().signal);
  const file = path.join(copy, 'java-db', 'metadata.json'), content = await readFile(file, 'utf8');
  await writeFile(file, `${content}\n`);
  const after = await inspectTrivyDatabases(copy, policy, new AbortController().signal);
  assert.throws(() => assertStableDatabases(before, after), /DATABASE_CHANGED/u);
  await writeFile(file, JSON.stringify({ ...JSON.parse(content), UpdatedAt: '2026-02-30T00:00:00Z' }));
  await assert.rejects(inspectTrivyDatabases(copy, policy, new AbortController().signal), /METADATA_INVALID/u);
  await writeFile(file, JSON.stringify({ ...JSON.parse(content), Version: 2 }));
  await assert.rejects(inspectTrivyDatabases(copy, policy, new AbortController().signal), /METADATA_INVALID/u);
  await rm(file);
  await assert.rejects(scanner(root, copy).invoke('security.scan', request, new AbortController().signal), /DATABASE_INVALID:java/u);
  const aborted = new AbortController(); aborted.abort(new Error('caller cancelled'));
  await assert.rejects(inspectTrivyDatabases(cache, policy, aborted.signal), /caller cancelled/u);
  for (let attempt = 0; attempt < 8; attempt++) {
    await assert.rejects(scanner(root, cache, 1).invoke('security.scan', request, new AbortController().signal), /SECURITY_SCAN_TIMEOUT/u);
  }
});


test('real FIFO metadata fails before a blocking open can consume the deadline', async t => {
  const root = await fixture(t), directory = path.join(root, 'db');
  await mkdir(directory);
  await promisify(execFile)('mkfifo', [path.join(directory, 'metadata.json')]);
  await assert.rejects(inspectTrivyDatabases(root, policy, AbortSignal.timeout(1000)), /DATABASE_BYTES_INVALID/u);
});
