import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const { runPipelineV2 } = await import(
  pathToFileURL(path.resolve('skills/common/plugin-runtime/core/execution/engine.ts')).href
);
const { computePackageDigest } = await import(
  pathToFileURL(path.resolve('skills/common/plugin-runtime/core/registry/digest.ts')).href
);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-external-engine-v2-'));
const installationRoot = path.join(temporary, 'installed');
const packageRoot = path.join(installationRoot, 'external');
fs.mkdirSync(path.join(packageRoot, 'dist'), { recursive: true });
fs.mkdirSync(path.join(packageRoot, 'schemas'), { recursive: true });
fs.writeFileSync(path.join(packageRoot, 'dist', 'stage.js'), `
  export async function execute(input) {
    return {
      schemaVersion: 'stage-result.v2',
      outcome: input.ok === true ? 'passed' : 'failed',
      ...(input.ok === true ? {} : { reason: { code: 'external.failed' } }),
      artifacts: [],
    };
  }
`);
for (const name of ['config', 'input']) {
  fs.writeFileSync(path.join(packageRoot, 'schemas', `${name}.json`), JSON.stringify({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    additionalProperties: true,
  }));
}
fs.writeFileSync(path.join(packageRoot, 'schemas', 'result.json'), JSON.stringify({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['schemaVersion', 'outcome', 'artifacts'],
  properties: {
    schemaVersion: { const: 'stage-result.v2' },
    outcome: { type: 'string' },
    artifacts: { type: 'array' },
  },
  additionalProperties: true,
}));
fs.writeFileSync(path.join(packageRoot, 'plugin.json'), JSON.stringify({
  id: 'external.engine-test',
  apiVersion: 'pipeline-plugin-v2',
  packageVersion: '1.0.0',
  stages: [{
    id: 'main',
    type: 'external.engine-test',
    module: 'dist/stage.js',
    export: 'execute',
    requiredCapabilities: [],
    configSchema: 'schemas/config.json',
    inputSchema: 'schemas/input.json',
    resultSchema: 'schemas/result.json',
  }],
  observers: [],
  adapters: [],
}));

try {
  const digest = computePackageDigest(packageRoot);
  const result = await runPipelineV2({
    schemaVersion: 'pipeline-platform.v2',
    installationRoots: [installationRoot],
    trustedBuiltinRoots: [
      path.resolve('skills/common/plugins'),
      path.resolve('skills/nova/plugins'),
      path.resolve('skills/buster/plugins'),
    ],
    externalTrust: {
      allowedSourceDigests: { [`local:${packageRoot}`]: [digest] },
      verifiedAttestations: {},
    },
    providers: {},
    grants: {},
    adapters: {},
    activeAdapters: [],
    observers: {},
    storageRoot: path.join(temporary, 'state'),
    shutdownTimeoutMs: 5000,
    orchestratorIssuerId: 'nova',
    administrativeDecisionIssuers: [],
  }, {
    schemaVersion: 'pipeline-definition.v2',
    id: 'test:external',
    maxConcurrency: 1,
    stages: [{
      id: 'external',
      type: 'external.engine-test',
      dependsOn: [],
      config: {},
      input: { ok: true },
      execution: { maxAttempts: 1, maxRemediationCycles: 0, timeoutMs: 5000 },
    }],
  }, 'run:external-engine');
  assert.equal(result.status, 'succeeded');
  console.log(JSON.stringify({ ok: true, contract: 'plugin-system-v2-external-engine' }));
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
