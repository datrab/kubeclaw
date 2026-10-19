#!/usr/bin/env node
// Emit deterministic, fixture-bound patches. Unsupported constructors fail closed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const [flag, id, ...extra] = process.argv.slice(2);
assert(flag === '--emit' && id && !extra.length, 'usage: --emit <kind:variant:operation>');
const [kind, variantId, operation, ...trailing] = id.split(':');
const fixtures = JSON.parse(fs.readFileSync(path.join(root, 'docs/blueprint/AP09-acceptance-fixtures.json')));
const family = fixtures.mutationTests.find(item => item.kind === kind);
const variant = family?.variants.find(item => item.id === variantId);
assert(variant && family.operations.includes(operation) && !trailing.length, 'unregistered mutation');
const original = fs.readFileSync(path.join(root, variant.sourceAuthority), 'utf8');
let anchor, added, replacement;
if (variant.constructor === 'typescript-error-code-v1') {
  anchor = "  if (!sourceAttestationPublicKey) throw new Error('BUSTER_SOURCE_ATTESTATION_PUBLIC_KEY_MISSING');\n";
  added = "  if (sourceAttestationPublicKey === 'fixture-rejected-key') throw new Error('BUSTER_SOURCE_ATTESTATION_ROTATED_PUBLIC_KEY_MISSING');\n";
  replacement = operation === 'add' ? anchor + added
    : operation === 'change' ? anchor.replace('BUSTER_SOURCE_ATTESTATION_PUBLIC_KEY_MISSING', 'BUSTER_SOURCE_ATTESTATION_ROTATED_PUBLIC_KEY_MISSING') : '';
} else if (variant.constructor === 'typescript-workflow-selection-v1') {
  anchor = "  stages.push(...demoStages(demo,final.test.providerPlan.plan));\n";
  added = "  stages.push({ id: 'fixture-workflow', type: 'kubeclaw.fixture.workflow', dependsOn: [], config: {}, input: {} });\n";
  replacement = operation === 'add' ? anchor + added
    : operation === 'change' ? "  if (demo) stages.push(...demoStages(demo,final.test.providerPlan.plan));\n" : '';
} else if (variant.constructor === 'typescript-contract-field-v1') {
  anchor = '    maxTechnicalRetries?: number;\n';
  added = '    fixtureRetryPolicy?: { maximum: number; mode: "bounded" | "disabled" };\n';
  replacement = operation === 'add' ? anchor + added
    : operation === 'change' ? '    maxTechnicalRetries: number | null;\n' : '';
} else if (variant.constructor === 'typescript-stage-kind-v1') {
  anchor = "  stages.push(...demoStages(demo,final.test.providerPlan.plan));\n";
  added = "  stages.push({ id: 'fixture-stage', type: 'kubeclaw.fixture.stage', dependsOn: [], config: {}, input: {} });\n";
  replacement = operation === 'add' ? anchor + added
    : operation === 'change' ? "  stages.push(...demoStages(demo,final.test.providerPlan.plan).map(stage => ({ ...stage, type: 'kubeclaw.fixture.replacement' })));\n" : '';
} else if (variant.constructor === 'typescript-progress-contract-v1') {
  anchor = '      version: valueOrDefault(scaffold.version, DEFAULTS.version),\n';
  added = '      fixtureRecoveryMode: valueOrDefault(scaffold.fixtureRecoveryMode, "manual"),\n';
  replacement = operation === 'add' ? anchor + added
    : operation === 'change' ? '      version: valueOrDefault(scaffold.version, "fixture-progress-v2"),\n' : '';
} else {
  throw new Error(`constructor not implemented: ${variant.constructor}`);
}
assert.equal(original.split(anchor).length, 2, 'fixture anchor must occur exactly once');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-ap09-patch-'));
try {
  for (const [side, content] of [['a', original], ['b', original.replace(anchor, replacement)]]) {
    const target = path.join(temporary, side, variant.sourceAuthority);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  const result = spawnSync('git', ['-c', 'core.autocrlf=false', 'diff', '--no-index', '--no-ext-diff', '--no-color', '--src-prefix=', '--dst-prefix=', `a/${variant.sourceAuthority}`, `b/${variant.sourceAuthority}`], { cwd: temporary, encoding: 'utf8' });
  assert.equal(result.status, 1, result.stderr || 'expected a nonempty patch');
  process.stdout.write(result.stdout);
} finally { fs.rmSync(temporary, { recursive: true, force: true }); }
