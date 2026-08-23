import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const core = await import(pathToFileURL(path.resolve('skills/nova/core/src/index.ts')).href);
const { computePackageDigest } = await import(
  pathToFileURL(path.resolve('skills/common/plugin-runtime/foundation/registry/digest.ts')).href
);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-install-v2-'));
const source = path.join(temporary, 'source');
const installationRoot = path.join(temporary, 'installed');
fs.mkdirSync(path.join(source, 'dist'), { recursive: true });
fs.mkdirSync(path.join(source, 'schemas'), { recursive: true });
fs.mkdirSync(installationRoot);
fs.writeFileSync(path.join(source, 'dist', 'stage.js'), `
  export async function execute() {
    return { schemaVersion: 'stage-result.v2', outcome: 'passed', artifacts: [] };
  }
`);
fs.writeFileSync(path.join(source, 'dist', 'test-provider.js'), `
  export async function execute() {
    return { schemaVersion: 'provider-result.v1', outcome: 'passed' };
  }
`);
for (const name of ['config', 'input', 'result']) {
  fs.writeFileSync(path.join(source, 'schemas', `${name}.json`), JSON.stringify({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    additionalProperties: false,
  }));
}
fs.writeFileSync(path.join(source, 'plugin.json'), JSON.stringify({
  id: 'external.install-test',
  apiVersion: 'pipeline-plugin-v2',
  packageVersion: '1.0.0',
  stages: [{
    id: 'main',
    type: 'external.install-test',
    module: 'dist/stage.js',
    export: 'execute',
    requiredCapabilities: [],
    configSchema: 'schemas/config.json',
    inputSchema: 'schemas/input.json',
    resultSchema: 'schemas/result.json',
  }],
  observers: [],
  adapters: [],
  testProviders: [{
    id: 'unit',
    contractId: 'external.unit-test@1',
    kind: 'test',
    module: 'dist/test-provider.js',
    export: 'execute',
    configSchema: 'schemas/config.json',
    inputs: [],
    outputs: [],
    requiredCapabilities: [],
    retrySafe: true,
    matrixFields: [],
    reportFormats: [],
    evidenceTypes: [],
    evidenceDefaults: { onPass: [], onFail: [], onError: [] },
  }],
}));

try {
  const digest = computePackageDigest(source);
  const canonicalSource = 'https://plugins.kubeclaw.dev/external.install-test/1.0.0';
  const policy = {
    operatorIds: new Set(['operator:test']),
    allowedSourceDigests: new Map([[canonicalSource, [digest]]]),
    verifiedAttestations: new Map(),
  };
  const installed = core.installExternalPackage({
    actorId: 'operator:test',
    canonicalSource,
    sourceRoot: source,
    installationRoot,
    expectedDigest: digest,
    policy,
    trustEvidence: {
      method: 'source_digest_allowlist',
      verifier: 'test:installer',
    },
  });
  assert.equal(installed.contentDigest, digest);
  assert.equal(core.installExternalPackage({
    actorId: 'operator:test',
    canonicalSource,
    sourceRoot: source,
    installationRoot,
    expectedDigest: digest,
    policy,
    trustEvidence: {
      method: 'source_digest_allowlist',
      verifier: 'test:installer',
    },
  }).root, installed.root);
  core.removeInstalledPackage(installationRoot, installed.root);
  assert.equal(fs.existsSync(installed.root), false);

  fs.writeFileSync(path.join(source, 'dist', 'test-provider.js'), "export function execute() { return 'unterminated; }\n");
  const invalidModuleDigest = computePackageDigest(source);
  policy.allowedSourceDigests.set(canonicalSource, [invalidModuleDigest]);
  assert.throws(() => core.installExternalPackage({
    actorId: 'operator:test',
    canonicalSource,
    sourceRoot: source,
    installationRoot,
    expectedDigest: invalidModuleDigest,
    policy,
    trustEvidence: {
      method: 'source_digest_allowlist',
      verifier: 'test:installer',
    },
  }), /PLUGIN_INSTALL_MODULE_INVALID:dist\/test-provider\.js/);
  fs.writeFileSync(path.join(source, 'dist', 'test-provider.js'), `
    export async function execute() {
      return { schemaVersion: 'provider-result.v1', outcome: 'passed' };
    }
  `);

  fs.writeFileSync(path.join(source, 'package.json'), JSON.stringify({
    scripts: { prepare: 'touch compromised' },
  }));
  assert.throws(() => core.installExternalPackage({
    actorId: 'operator:test',
    canonicalSource,
    sourceRoot: source,
    installationRoot,
    expectedDigest: computePackageDigest(source),
    policy,
    trustEvidence: {
      method: 'source_digest_allowlist',
      verifier: 'test:installer',
    },
  }), /PLUGIN_INSTALL_SCRIPTS_FORBIDDEN/);
  console.log(JSON.stringify({ ok: true, contract: 'plugin-system-v2-installation' }));
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
