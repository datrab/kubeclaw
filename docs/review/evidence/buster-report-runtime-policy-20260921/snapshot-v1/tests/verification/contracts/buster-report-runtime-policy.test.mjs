import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { buildRegistry, discoverPackages } from '../../../skills/nova/core/src/index.ts';
import { RegisteredReportAdapterRuntime, FileReportArtifactReader } from '../../../skills/buster/engine/test-gates/report-adapter-runtime.ts';
import { validateBusterReportSettings } from '../../../skills/common/plugin-runtime/foundation/config/buster-execution.ts';
import { runnerExecutionPolicy } from '../../fixtures/test-gate/execution-policy.mts';

function ownedFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'report-runtime-policy-'));
  const children = [];
  const originalSpawn = childProcess.spawn;
  let hook;
  t.after(async () => {
    try {
      for (const row of children) if (!row.closed) {
        try { process.kill(-row.child.pid, 'SIGKILL'); }
        catch (error) { if (error.code !== 'ESRCH') throw error; }
      }
      let timer;
      try {
        await Promise.race([Promise.all(children.map(row => row.closure)), new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(`REPORT_POLICY_FIXTURE_UNRESOLVED:${root}`)), 2000);
        })]);
      } finally { clearTimeout(timer); }
      assert(children.every(row => row.closed));
      fs.rmSync(root, { recursive: true, force: true });
    } finally { hook?.mock.restore(); syncBuiltinESMExports(); }
  });
  const reportChild = path.resolve('skills/buster/engine/test-gates/report-adapter-child.mjs');
  hook = t.mock.method(childProcess, 'spawn', function (...args) {
    if (!args[1]?.includes(reportChild)) return Reflect.apply(originalSpawn, childProcess, args);
    assert.equal(args[2].detached, true);
    assert(fs.realpathSync(args[2].cwd).startsWith(`${fs.realpathSync(root)}${path.sep}`));
    const child = Reflect.apply(originalSpawn, childProcess, args);
    let resolveClose;
    const row = { child, closed: false, closure: new Promise(resolve => { resolveClose = resolve; }) };
    children.push(row); child.once('close', () => { row.closed = true; resolveClose(); });
    return child;
  });
  syncBuiltinESMExports();
  return { root, children };
}
function adapterFixture(t) {
  const owned = ownedFixture(t);
  const plugins = path.join(owned.root, 'plugins');
  const pkg = path.join(plugins, 'report');
  fs.mkdirSync(path.join(pkg, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(pkg, 'dist/adapter.js'), `import v8 from 'node:v8';
    export function adapt() { return {
      counts: { total: 1, passed: 1, failed: 0, errored: 0, skipped: 0 }, durationMs: 0,
      cases: [{ id: 'heap', name: String(v8.getHeapStatistics().heap_size_limit), suitePath: [], className: null,
        outcome: 'passed', durationMs: 0, findings: [], findingsTruncated: false, omittedFindingCount: 0 }],
      casesTruncated: false, omittedCaseCount: 0, findings: [], findingsTruncated: false, omittedFindingCount: 0 }; }`);
  fs.writeFileSync(path.join(pkg, 'plugin.json'), JSON.stringify({ id: 'example.report-runtime-policy',
    apiVersion: 'pipeline-plugin-v2', packageVersion: '1.0.0', stages: [], observers: [], adapters: [],
    reportAdapters: [{ id: 'junit', format: 'junit', contractVersion: 1, module: 'dist/adapter.js', export: 'adapt', mediaTypes: ['application/junit+xml'] }] }));
  const registry = buildRegistry(discoverPackages({ installationRoots: [plugins], trustPolicy: {
    trustedBuiltinRoots: [plugins], allowedSourceDigests: new Map(), verifiedAttestations: new Map(), verifierId: 'test:report-runtime-policy' },
    now: () => new Date('2026-09-21T00:00:00Z') }));
  const entry = registry.reportAdapters.get('example.report-runtime-policy:junit'); assert(entry);
  const artifacts = path.join(owned.root, 'artifacts'); fs.mkdirSync(artifacts);
  const file = path.join(artifacts, 'source.xml'); const bytes = Buffer.from('<testsuite/>'); fs.writeFileSync(file, bytes);
  const artifact = { artifactId: 'artifact:policy', type: 'test-report', mediaType: 'application/junit+xml',
    contentDigest: `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`, sizeBytes: bytes.length, storageUrl: pathToFileURL(file).href };
  return { ...owned, entry, artifact, reader: new FileReportArtifactReader([artifacts]) };
}
const limits = { maximumSourceBytes: 1024, maximumResultBytes: 4096, maximumCases: 1, maximumFindings: 1,
  maximumCaseFindings: 1, timeoutMs: 2000, memoryBytes: 512 * 1024 * 1024, cpuMillis: 2000, openFiles: 64 };

for (const field of ['minimumOpenFiles', 'minimumHeapMiB', 'heapFraction']) test(`report runtime requires ${field} before directory effects`, t => {
  const { root, children } = ownedFixture(t);
  for (const value of [undefined, null, false, true, '1', 0, -1, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) {
    const candidate = { ...runnerExecutionPolicy.reports };
    if (value === undefined) delete candidate[field]; else candidate[field] = value;
    const runtimeRoot = path.join(root, `absent-${String(value)}`);
    assert.throws(() => new RegisteredReportAdapterRuntime({ read() { throw new Error('unexpected read'); } }, runtimeRoot, candidate), /SWARM_CONFIG_BUSTER_REPORT_POLICY_INVALID/);
    assert.equal(fs.existsSync(runtimeRoot), false);
  }
  assert.equal(children.length, 0);
});

for (const field of ['minimumHeapMiB', 'heapFraction']) test(`real report V8 heap consumes ${field}`, { timeout: 30000 }, async t => {
  const f = adapterFixture(t); const observed = [];
  for (const value of field === 'minimumHeapMiB' ? [32, 64] : [0.1, 0.2]) {
    const selected = field === 'minimumHeapMiB' ? { minimumHeapMiB: value, heapFraction: 0.01 } : { minimumHeapMiB: 16, heapFraction: value };
    const policy = validateBusterReportSettings({ ...runnerExecutionPolicy.reports, ...selected });
    const runtime = new RegisteredReportAdapterRuntime(f.reader, path.join(f.root, `runtime-${value}`), policy);
    const result = await runtime.adapt(f.entry, f.artifact, limits);
    assert.equal(result.counts.passed, 1); observed.push(Number(result.cases[0].name));
  }
  assert.equal(f.children.length, 2); assert(observed[0] > 0); assert(observed[1] > observed[0]);
});

test('selected report descriptor floor gates actual process admission', { timeout: 30000 }, async t => {
  const f = adapterFixture(t);
  for (const minimumOpenFiles of [16, 64]) {
    const policy = validateBusterReportSettings({ ...runnerExecutionPolicy.reports, minimumOpenFiles });
    const runtime = new RegisteredReportAdapterRuntime(f.reader, path.join(f.root, `fd-${minimumOpenFiles}`), policy);
    const before = f.children.length;
    if (minimumOpenFiles === 16) {
      assert.equal((await runtime.adapt(f.entry, f.artifact, { ...limits, openFiles: 32 })).counts.passed, 1);
      assert.equal(f.children.length, before + 1);
    } else {
      await assert.rejects(runtime.adapt(f.entry, f.artifact, { ...limits, openFiles: 32 }), /REPORT_ADAPTER_OPEN_FILE_LIMIT_TOO_LOW/);
      assert.equal(f.children.length, before);
    }
  }
});
