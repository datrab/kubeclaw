import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { assertBaselineBrowserVersion } from '../src/browser-identity.js';
import { provider } from '../src/provider.js';

const contractRoot = new URL('../../../../../contracts/pipeline-test-gate/v1/', import.meta.url);
const schema = JSON.parse(fs.readFileSync(new URL('schemas/visual-baselines.v2.schema.json', contractRoot), 'utf8'));
const example = JSON.parse(fs.readFileSync(new URL('examples/visual-baselines.json', contractRoot), 'utf8'));
const validate = new Ajv2020({ strict: true, allErrors: true }).compile(schema);

test('baseline wire schema and capture-bound version validation agree on absent or malformed identities', () => {
  assert.equal(validate(example), true, JSON.stringify(validate.errors));
  for (const version of [undefined, null, '', ' ', '\u0000', ' 145', '145 ', '145\n', '145\u0000', '1'.repeat(257)]) {
    const value = structuredClone(example);
    value.entries[0].browserVersion = version;
    assert.equal(validate(value), false, JSON.stringify({ version }));
    assert.throws(() => assertBaselineBrowserVersion(version, '145', 'home'), /VISUAL_BROWSER_VERSION_INVALID/u);
    assert.throws(() => assertBaselineBrowserVersion('145', version, 'home'), /VISUAL_BROWSER_VERSION_INVALID/u);
  }
  assert.throws(() => assertBaselineBrowserVersion('144.0', '145.0', 'home'),
    /VISUAL_BASELINE_BROWSER_VERSION_MISMATCH:home:expected=144.0:actual=145.0/u);
  assert.doesNotThrow(() => assertBaselineBrowserVersion('145.0', '145.0', 'home'));
});

test('original provider rejects unversioned and legacy manifests before any browser capability is needed', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-identity-'));
  const repository = path.join(root, 'repository');
  try {
    fs.mkdirSync(repository);
    fs.writeFileSync(path.join(repository, 'profiles.json'), JSON.stringify({
      schemaVersion: 'kubeclaw.browser-profiles.v1', profiles: { desktop: {
        browser: 'chromium', viewport: { width: 640, height: 480 },
      } },
    }));
    const invocation = { configuration: { values: { profileFile: 'profiles.json', manifestFile: 'manifest.json' } },
      workspace: { repository: 'repository' }, limits: {} };
    // No substitute capture implementation: these inputs must fail before capability invocation.
    const context = { workspaceRoot: root };
    fs.writeFileSync(path.join(repository, 'manifest.json'), JSON.stringify({
      schemaVersion: 'kubeclaw.visual-baselines.v1', entries: [],
    }));
    await assert.rejects(() => provider().execute(invocation, context), /VISUAL_BASELINE_MIGRATION_REQUIRED/u);
    fs.writeFileSync(path.join(repository, 'manifest.json'), JSON.stringify({
      schemaVersion: 'kubeclaw.visual-baselines.v2', entries: [{ id: 'home' }],
    }));
    await assert.rejects(() => provider().execute(invocation, context), /VISUAL_BROWSER_VERSION_INVALID/u);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('real preflight blocks the historical unbound fixture locally before requesting deployment', () => {
  const root = fileURLToPath(new URL('../../../../../', import.meta.url));
  const result = spawnSync(process.execPath, ['tests/verification/e2e/nova-visual-production-preflight.mts'], {
    cwd: root, encoding: 'utf8', timeout: 10_000,
  });
  assert.equal(result.status, 1, `${result.error ?? ''}\n${result.stderr}`);
  assert.match(result.stderr, /VISUAL_BASELINE_MIGRATION_REQUIRED/u);
  assert.doesNotMatch(result.stderr, /VISUAL_PREFLIGHT_TOKEN_MISSING|VISUAL_PREFLIGHT_SOURCE_KEY_MISSING/u);
});
