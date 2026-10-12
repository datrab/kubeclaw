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

const repository = path.resolve(import.meta.dirname, '../../..');
const pluginsRoot = path.join(repository, 'skills/buster/plugins');
const packages = discoverPackages({
  installationRoots: [pluginsRoot],
  trustPolicy: {
    trustedBuiltinRoots: [pluginsRoot],
    allowedSourceDigests: new Map(),
    verifiedAttestations: new Map(),
    verifierId: 'test:junit-report-adapter',
  },
  now: () => new Date('2026-08-09T23:00:00Z'),
});
const registry = buildRegistry(packages);
const adapter = registry.reportAdapters.get('kubeclaw.junit-report:junit');
assert.ok(adapter, 'provided JUnit adapter must be registered');

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'junit-report-adapter-'));
const artifacts = path.join(workspace, 'artifacts');
const runtimeRoot = path.join(workspace, 'runtime');
fs.mkdirSync(artifacts);
const bytes = Buffer.from(`<testsuite name="runtime">
  <testcase name="pass" time="0.01"/>
  <testcase name="fail" time="0.02"><failure message="wrong value"/></testcase>
</testsuite>`);
const file = path.join(artifacts, 'junit.xml');
fs.writeFileSync(file, bytes);
const artifact: ArtifactRefV1 = {
  artifactId: 'artifact:junit-runtime',
  type: 'test-report',
  mediaType: 'application/junit+xml',
  contentDigest: `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`,
  sizeBytes: bytes.byteLength,
  storageUrl: pathToFileURL(file).href,
};
const limits: ReportAdapterRuntimeLimits = {
  maximumSourceBytes: 1024 * 1024,
  maximumResultBytes: 1024 * 1024,
  maximumCases: 100,
  maximumFindings: 100,
  maximumCaseFindings: 10,
  timeoutMs: 5_000,
  memoryBytes: 128 * 1024 * 1024,
  cpuMillis: 5_000,
  openFiles: 64,
};
const runtime = new RegisteredReportAdapterRuntime(new FileReportArtifactReader([artifacts]), runtimeRoot);
const result = await runtime.adapt(adapter, artifact, limits);
assert.deepEqual(result.counts, { total: 2, passed: 1, failed: 1, errored: 0, skipped: 0 });
assert.equal(result.cases[1].findings[0].message, 'wrong value');
assert.equal(result.adapter.adapterId, 'junit');
assert.equal(result.adapter.package.packageId, 'kubeclaw.junit-report');
assert.deepEqual(result.sourceArtifact, artifact);
assert.equal(fs.readdirSync(runtimeRoot).length, 0, 'adapter snapshot is removed');

console.log(JSON.stringify({ ok: true, adapter: result.adapter.adapterId, isolated: true, cases: result.counts.total }));
