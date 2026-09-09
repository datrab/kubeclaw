import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const isolation = process.argv[2] ? { cgroupRoot: path.resolve(process.argv[2]) } : undefined;

const { invokeIsolated } = await import(
  pathToFileURL(path.resolve('skills/common/plugin-runtime/foundation/isolation/runner.ts')).href
);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-isolation-v2-'));
const modulePath = path.join(temporary, 'stage.mjs');
const attempt = {
  runId: 'run:isolation',
  stageId: 'stage',
  attemptId: 'attempt:isolation',
  attemptNumber: 1,
};
const packageIdentity = {
  pluginId: 'external.example',
  apiVersion: 'pipeline-plugin-v2',
  packageVersion: '1.0.0',
  contentDigest: `sha256:${'a'.repeat(64)}`,
};
const registration = {
  schemaVersion: 'registration-provenance.v2',
  package: {
    schemaVersion: 'package-provenance.v2',
    package: packageIdentity,
    source: { type: 'local', canonicalReference: `local:${temporary}` },
    canonicalPath: temporary,
    trustScope: 'isolated_external',
    trustEvidence: {
      method: 'source_digest_allowlist',
      verifier: 'test:isolation',
      verifiedAt: '2026-07-25T23:00:00Z',
    },
    resolvedAt: '2026-07-25T23:00:00Z',
  },
  surface: 'stage',
  registrationId: 'main',
};
const contract = {
  schemaVersion: 'plugin-context.v2',
  lease: {
    schemaVersion: 'invocation-lease.v2',
    leaseId: 'lease:isolation',
    attempt,
    registration,
    status: 'active',
    grants: [],
    limits: { wallTimeMs: 5000, memoryBytes: 256 * 1024 * 1024, cpuMillis: 2000 },
    issuedAt: '2026-07-25T23:00:00Z',
    expiresAt: '2026-07-25T23:01:00Z',
  },
  config: {},
  input: {},
  artifacts: [],
};
const context = {
  contract,
  async invoke() {
    throw new Error('capability denied');
  },
  async emit() {},
  artifact() {
    return undefined;
  },
};

try {
  fs.writeFileSync(modulePath, `
    import fs from 'node:fs';
    export async function execute(input) {
      let networkDenied = false;
      let writeDenied = false;
      try { await fetch('http://127.0.0.1:9'); } catch { networkDenied = true; }
      try { fs.writeFileSync('escape.txt', 'no'); } catch { writeDenied = true; }
      return { input, networkDenied, writeDenied, secret: process.env.OPENAI_API_KEY ?? null };
    }
  `);
  const result = await invokeIsolated({
    ...isolation,
    packageRoot: temporary,
    modulePath,
    exportName: 'execute',
    surface: 'stage',
    argument: { value: 1 },
    context,
  });
  assert.deepEqual(result, {
    input: { value: 1 },
    networkDenied: true,
    writeDenied: true,
    secret: null,
  });
  assert.equal(fs.existsSync(path.join(temporary, 'escape.txt')), false);
  console.log(JSON.stringify({ ok: true, contract: 'plugin-system-v2-isolation' }));
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
