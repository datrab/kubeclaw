import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ArtifactRefV1 } from '../../../contracts/pipeline-test-gate/v1/src/types.ts';
import {
  FileReportArtifactReader,
  RegisteredReportAdapterRuntime,
  type ReportAdapterRuntimeLimits,
} from '../../../skills/buster/engine/src/index.ts';
import { buildRegistry, discoverPackages } from '../../../skills/nova/core/src/index.ts';

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'report-adapter-runtime-'));
const installRoot = path.join(workspace, 'plugins');
const artifactRoot = path.join(workspace, 'artifacts');
const runtimeRoot = path.join(workspace, 'runtime');
fs.mkdirSync(installRoot, { recursive: true });
fs.mkdirSync(artifactRoot, { recursive: true });

const validSource = `export async function adapt(input) {
  if (Buffer.from(input.bytes).toString('utf8') !== '<testsuite/>') throw new Error('source mismatch');
  return {
    counts: { total: 1, passed: 1, failed: 0, errored: 0, skipped: 0 },
    durationMs: 5,
    cases: [{ id: 'case:one', name: 'one', suitePath: ['unit'], className: null,
      outcome: 'passed', durationMs: 5, findings: [], findingsTruncated: false, omittedFindingCount: 0 }],
    casesTruncated: false, omittedCaseCount: 0,
    findings: [], findingsTruncated: false, omittedFindingCount: 0,
  };
}\n`;

function writePackage(name: string, pluginId: string, source: string): string {
  const root = path.join(installRoot, name);
  fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(root, 'dist', 'adapter.js'), source);
  fs.writeFileSync(path.join(root, 'plugin.json'), `${JSON.stringify({
    id: pluginId,
    apiVersion: 'pipeline-plugin-v2',
    packageVersion: '1.0.0',
    stages: [], observers: [], adapters: [],
    reportAdapters: [{
      id: 'junit', format: 'junit', contractVersion: 1,
      module: 'dist/adapter.js', export: 'adapt',
      mediaTypes: ['application/junit+xml'],
    }],
  }, null, 2)}\n`);
  return root;
}

writePackage('valid', 'example.valid-report', validSource);
writePackage('invalid-result', 'example.invalid-report', `export function adapt() {
  return { counts: { total: 0, passed: 1, failed: 0, errored: 0, skipped: 0 }, durationMs: 0,
    cases: [], casesTruncated: false, omittedCaseCount: 0,
    findings: [], findingsTruncated: false, omittedFindingCount: 0 };
}\n`);
writePackage('forbidden', 'example.forbidden-report', `import fs from 'node:fs';
export function adapt() { fs.readFileSync('/etc/passwd'); return {}; }\n`);
writePackage('slow', 'example.slow-report', 'export async function adapt() { await new Promise((resolve) => setTimeout(resolve, 10000)); }\n');
writePackage('spoofed', 'example.spoofed-report', `export function adapt() {
  return {
    schemaVersion: 'report-adapter-result.v1',
    adapter: { adapterId: 'fake', format: 'junit', contractVersion: 1,
      package: { packageId: 'fake.package', packageVersion: '1.0.0', contentDigest: 'sha256:${'0'.repeat(64)}' } },
    sourceArtifact: { artifactId: 'artifact:fake', type: 'test-report', mediaType: 'application/junit+xml',
      contentDigest: 'sha256:${'0'.repeat(64)}', sizeBytes: 0, storageUrl: 'file:///fake' },
    counts: { total: 0, passed: 0, failed: 0, errored: 0, skipped: 0 }, durationMs: 0,
    cases: [], casesTruncated: false, omittedCaseCount: 0,
    findings: [], findingsTruncated: false, omittedFindingCount: 0,
  };
}\n`);
writePackage('over-limit', 'example.over-limit-report', `export function adapt() {
  const item = (id) => ({ id, name: id, suitePath: ['unit'], className: null,
    outcome: 'passed', durationMs: 1, findings: [], findingsTruncated: false, omittedFindingCount: 0 });
  return { counts: { total: 2, passed: 2, failed: 0, errored: 0, skipped: 0 }, durationMs: 2,
    cases: [item('case:one'), item('case:two')], casesTruncated: false, omittedCaseCount: 0,
    findings: [], findingsTruncated: false, omittedFindingCount: 0 };
}\n`);
writePackage('noisy', 'example.noisy-report', `process.stdout.write('x'.repeat(4096));
export function adapt() { return {}; }\n`);
writePackage('network', 'example.network-report', `import net from 'node:net';
export async function adapt() {
  await new Promise((resolve, reject) => {
    const socket = net.connect(80, '127.0.0.1');
    socket.once('connect', () => { socket.destroy(); resolve(); });
    socket.once('error', reject);
  });
  return {};
}\n`);
const sqliteOutside = path.join(workspace, 'outside.sqlite');
fs.writeFileSync(sqliteOutside, '');
writePackage('sqlite', 'example.sqlite-report', `import { DatabaseSync } from 'node:sqlite';
export function adapt() {
  const database = new DatabaseSync(${JSON.stringify(sqliteOutside)});
  database.close();
  return {
    counts: { total: 0, passed: 0, failed: 0, errored: 0, skipped: 0 }, durationMs: 0,
    cases: [], casesTruncated: false, omittedCaseCount: 0,
    findings: [], findingsTruncated: false, omittedFindingCount: 0,
  };
}\n`);

const packages = discoverPackages({
  installationRoots: [installRoot],
  trustPolicy: {
    trustedBuiltinRoots: [installRoot],
    allowedSourceDigests: new Map(),
    verifiedAttestations: new Map(),
    verifierId: 'test:report-adapter-runtime',
  },
  now: () => new Date('2026-08-09T22:45:00Z'),
});
const registry = buildRegistry(packages);
const reader = new FileReportArtifactReader([artifactRoot]);
assert.throws(() => new FileReportArtifactReader([path.parse(artifactRoot).root]), /REPORT_ARTIFACT_ROOT_TOO_BROAD/u);
assert.throws(() => new RegisteredReportAdapterRuntime(reader, path.parse(runtimeRoot).root),
  /REPORT_ADAPTER_RUNTIME_ROOT_TOO_BROAD/u);
const runtime = new RegisteredReportAdapterRuntime(reader, runtimeRoot);
assert.equal(fs.statSync(runtimeRoot).mode & 0o077, 0, 'runtime snapshots stay in an owner-private directory');

const reportPath = path.join(artifactRoot, 'report.xml');
const reportBytes = Buffer.from('<testsuite/>');
fs.writeFileSync(reportPath, reportBytes);
const artifact: ArtifactRefV1 = {
  artifactId: 'artifact:report',
  type: 'test-report',
  mediaType: 'application/junit+xml',
  contentDigest: `sha256:${crypto.createHash('sha256').update(reportBytes).digest('hex')}`,
  sizeBytes: reportBytes.byteLength,
  storageUrl: pathToFileURL(reportPath).href,
};
const limits: ReportAdapterRuntimeLimits = {
  maximumSourceBytes: 1024 * 1024,
  maximumResultBytes: 1024 * 1024,
  maximumCases: 100,
  maximumFindings: 100,
  maximumCaseFindings: 10,
  timeoutMs: 2_000,
  memoryBytes: 128 * 1024 * 1024,
  cpuMillis: 5_000,
  openFiles: 64,
};

const valid = registry.reportAdapters.get('example.valid-report:junit');
assert.ok(valid);
const result = await runtime.adapt(valid, artifact, limits);
assert.deepEqual(result.counts, { total: 1, passed: 1, failed: 0, errored: 0, skipped: 0 });
assert.deepEqual(result.sourceArtifact, artifact);
assert.equal(result.adapter.package.contentDigest, valid.registration.package.contentDigest);
assert.equal(fs.readdirSync(runtimeRoot).length, 0, 'package snapshots are removed after execution');

await assert.rejects(runtime.adapt(valid, { ...artifact, mediaType: 'application/xml' }, limits),
  /REPORT_ADAPTER_MEDIA_TYPE_UNSUPPORTED/u);
await assert.rejects(runtime.adapt(valid, { ...artifact, type: 'log' }, limits),
  /REPORT_ADAPTER_ARTIFACT_TYPE_FORBIDDEN/u);
await assert.rejects(runtime.adapt(valid, { ...artifact, contentDigest: `sha256:${'0'.repeat(64)}` }, limits),
  /REPORT_ARTIFACT_DIGEST_MISMATCH/u);
await assert.rejects(runtime.adapt(valid, { ...artifact, sizeBytes: artifact.sizeBytes + 1 }, limits),
  /REPORT_ARTIFACT_SIZE_MISMATCH/u);
await assert.rejects(runtime.adapt(valid, artifact, { ...limits, maximumSourceBytes: 1 }),
  /REPORT_ADAPTER_SOURCE_LIMIT/u);
const missingResultLimit = { ...limits } as Partial<ReportAdapterRuntimeLimits>;
delete missingResultLimit.maximumResultBytes;
await assert.rejects(runtime.adapt(valid, artifact, missingResultLimit as ReportAdapterRuntimeLimits),
  /REPORT_ADAPTER_LIMIT_INVALID:maximumResultBytes/u);

const outside = path.join(workspace, 'outside.xml');
fs.writeFileSync(outside, reportBytes);
await assert.rejects(runtime.adapt(valid, { ...artifact, storageUrl: pathToFileURL(outside).href }, limits),
  /REPORT_ARTIFACT_PATH_FORBIDDEN/u);
const link = path.join(artifactRoot, 'link.xml');
fs.symlinkSync(outside, link);
await assert.rejects(runtime.adapt(valid, { ...artifact, storageUrl: pathToFileURL(link).href }, limits),
  /REPORT_ARTIFACT_PATH_FORBIDDEN/u);

const invalid = registry.reportAdapters.get('example.invalid-report:junit');
assert.ok(invalid);
await assert.rejects(runtime.adapt(invalid, artifact, limits), /Invalid pipeline test-gate reportAdapterResult/u);
const forbidden = registry.reportAdapters.get('example.forbidden-report:junit');
assert.ok(forbidden);
await assert.rejects(runtime.adapt(forbidden, artifact, limits), /REPORT_ADAPTER_FAILED/u);
const slow = registry.reportAdapters.get('example.slow-report:junit');
assert.ok(slow);
await assert.rejects(runtime.adapt(slow, artifact, { ...limits, timeoutMs: 50 }), /REPORT_ADAPTER_TIMEOUT/u);
const preparationRuntime = new RegisteredReportAdapterRuntime({
  read() {
    return new Promise(() => {});
  },
}, path.join(workspace, 'preparation-runtime'));
await assert.rejects(preparationRuntime.adapt(valid, artifact, { ...limits, timeoutMs: 50 }),
  /REPORT_ADAPTER_TIMEOUT/u, 'the host deadline bounds a non-cooperative artifact reader');
const dishonestReaderRuntime = new RegisteredReportAdapterRuntime({
  async read() { return Buffer.from('<different/>'); },
}, path.join(workspace, 'dishonest-reader-runtime'));
await assert.rejects(dishonestReaderRuntime.adapt(valid, artifact, limits),
  /REPORT_ARTIFACT_DIGEST_MISMATCH/u, 'the host revalidates every storage driver result');

const spoofed = registry.reportAdapters.get('example.spoofed-report:junit');
assert.ok(spoofed);
const trusted = await runtime.adapt(spoofed, artifact, limits);
assert.equal(trusted.adapter.package.packageId, 'example.spoofed-report');
assert.equal(trusted.sourceArtifact.artifactId, artifact.artifactId);

const raceController = new AbortController();
const raceRuntime = new RegisteredReportAdapterRuntime({
  async read() { raceController.abort(new Error('cancelled during read')); return reportBytes; },
}, path.join(workspace, 'race-runtime'));
await assert.rejects(raceRuntime.adapt(valid, artifact, limits, raceController.signal), /cancelled during read/u);

const overLimit = registry.reportAdapters.get('example.over-limit-report:junit');
assert.ok(overLimit);
await assert.rejects(runtime.adapt(overLimit, artifact, { ...limits, maximumCases: 1 }),
  /REPORT_ADAPTER_CASE_LIMIT/u);

await assert.rejects(runtime.adapt(valid, artifact, { ...limits, cpuMillis: 1_001 }),
  /REPORT_ADAPTER_CPU_LIMIT_GRANULARITY/u);
await assert.rejects(runtime.adapt(valid, artifact, { ...limits, maximumResultBytes: 16 * 1024 * 1024 + 1 }),
  /REPORT_ADAPTER_HARD_LIMIT_EXCEEDED:maximumResultBytes/u);
await assert.rejects(runtime.adapt(valid, artifact, { ...limits, memoryBytes: 16 * 1024 * 1024 }),
  /REPORT_ADAPTER_MEMORY_LIMIT_INCOMPATIBLE/u);
const noisy = registry.reportAdapters.get('example.noisy-report:junit');
assert.ok(noisy);
await assert.rejects(runtime.adapt(noisy, artifact, { ...limits, maximumResultBytes: 1024 }),
  /REPORT_ADAPTER_RESULT_LIMIT/u);
const network = registry.reportAdapters.get('example.network-report:junit');
assert.ok(network);
await assert.rejects(runtime.adapt(network, artifact, limits), /REPORT_ADAPTER_FAILED/u,
  'native sandbox seccomp denies network system calls');
const sqlite = registry.reportAdapters.get('example.sqlite-report:junit');
assert.ok(sqlite);
await assert.rejects(runtime.adapt(sqlite, artifact, limits), /REPORT_ADAPTER_FAILED/u,
  'disabled node:sqlite cannot bypass the report-adapter filesystem permission boundary');

const controller = new AbortController();
controller.abort(new Error('cancelled by test'));
await assert.rejects(runtime.adapt(valid, artifact, limits, controller.signal), /cancelled by test/u);

console.log(JSON.stringify({
  ok: true,
  isolated: true,
  sourceVerified: true,
  resultValidated: true,
  timeout: true,
  cancellation: true,
}));
