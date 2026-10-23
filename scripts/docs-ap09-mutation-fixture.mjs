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
} else if (variant.constructor === 'typescript-capability-v1') {
  anchor = "  'state.read': definition(['read'], ['state.namespace'], ['allowedNamespaces']),\n";
  added = "  'fixture.state.inspect': definition(['inspect'], ['fixture.namespace'], ['allowedFixtureNamespaces']),\n";
  replacement = operation === 'add' ? anchor + added
    : operation === 'change' ? "  'state.read': definition(['inspect'], ['fixture.namespace'], ['allowedFixtureNamespaces']),\n" : '';
} else if (variant.constructor === 'json-role-grant-v1') {
  // A real requesting registration and vocabulary-supported constraint; no invented swarm role.
  anchor = '      "operator.request": { "allowedTargets": ["operators"] },\n';
  added = '      "operator.request": { "allowedTargets": ["operators", "fixture-operators"] },\n';
  replacement = operation === 'add' ? added
    : operation === 'change' ? '      "operator.request": { "allowedTargets": ["fixture-operators"] },\n' : '';
} else if (variant.constructor === 'plugin-manifest-registration-v1') {
  // Reuse existing executable/schema paths; discovery does not execute the added registration.
  anchor = '  "stages": [\n';
  added = '    {"id":"fixture-lint","type":"kubeclaw.lint.fixture","module":"src/stage.ts","export":"executePreCheck","requiredCapabilities":["lint.execute"],"configSchema":"schemas/config.schema.json","inputSchema":"schemas/input.schema.json","resultSchema":"schemas/result.schema.json"},\n';
  if (operation === 'add') replacement = anchor + added;
  else {
    const manifest = JSON.parse(original);
    anchor = JSON.stringify(manifest.stages[0], null, 2).split('\n').map(line => '    ' + line).join('\n') + ',\n';
    if (operation === 'change') replacement = anchor.replace('kubeclaw.lint.pre-check', 'kubeclaw.lint.fixture-replacement');
    else replacement = '';
  }
} else if (variant.constructor === 'typescript-extension-class-v1') {
  anchor = '  readonly stages: ReadonlyMap<string, StageRegistryEntry>;\n';
  added = '  readonly fixtureStages: ReadonlyMap<string, StageRegistryEntry>;\n';
  replacement = operation === 'add' ? anchor + added
    : operation === 'change' ? '  readonly stages: ReadonlyMap<string, ObserverRegistryEntry>;\n' : '';
} else if (variant.constructor === 'javascript-provider-registration-v1') {
  // The registered authority is the E2E remote capability catalogue, not a plugin manifest.
  anchor = '      agentRole: value.agentRole,\n';
  added = "      namespace: value.namespace ?? 'default',\n";
  replacement = operation === 'add' ? anchor + added
    : operation === 'change' ? '      providerRole: value.agentRole,\n' : '';
} else if (variant.constructor === 'javascript-fixture-registration-v1') {
  // Actual authority is the E2E coverage requirement policy, not fixture-provider discovery.
  anchor = "  'size-budget': 'The assembled project stays within the declared artifact byte budget.',\n";
  added = "  'fixture-budget': 'The assembled fixture stays within the declared artifact byte budget.',\n";
  replacement = operation === 'add' ? anchor + added
    : operation === 'change' ? anchor.replace('declared artifact byte budget', 'declared compressed artifact byte budget') : '';
} else if (variant.constructor === 'json-report-registration-v1') {
  // Production composition does not declare report formats; the adapter manifest does.
  anchor = JSON.stringify(JSON.parse(original).reportAdapters[0], null, 2).split('\n').map(line => '    ' + line).join('\n') + '\n';
  added = anchor.replace('"id": "junit"', '"id": "fixture-junit"').replace('"format": "junit"', '"format": "fixture-junit"');
  replacement = operation === 'add' ? anchor.trimEnd() + ',\n' + added
    : operation === 'change' ? anchor.replace('"format": "junit"', '"format": "fixture-junit"')
    : anchor.replace('        "application/xml",\n        "text/xml"', '        "application/xml"');
} else if (variant.constructor === 'json-schema-nested-field-v1') {
  // Use an existing nested target field, not a flat lint flag masquerading
  // as nested removal. The runtime consumer independently bounds this value.
  anchor = '          "maxRequestBytes": { "type": "integer", "minimum": 1, "maximum": 8388608, "default": 1048576 },\n';
  if (operation === 'add') {
    // Add a condition-specific bound for an existing consumer-qualified field.
    anchor = '"then": { "properties": { "endpoint":';
    replacement = '"then": { "properties": { "maxRequestBytes": { "type": "integer", "maximum": 524288 }, "endpoint":';
  } else replacement = operation === 'change'
    ? anchor.replace('"default": 1048576', '"default": 524288') : '';
} else if (variant.constructor === 'yaml-secret-reference-v1') {
  // Remove a unique complete reference: the gateway reference is repeated
  // elsewhere, so removing only one gateway occurrence does not remove identity.
  anchor = '            - name: CODE_BUNDLE_AUTH_TOKEN\n              valueFrom:\n                secretKeyRef:\n                  name: {{ .Values.codeBundle.auth.existingSecret }}\n                  key: {{ .Values.codeBundle.auth.existingSecretKey | default "token" }}\n';
  added = '            - name: FIXTURE_GATEWAY_TOKEN\n              valueFrom: { secretKeyRef: { name: fixture-gateway-secret, key: fixture-token, optional: true } }\n';
  replacement = operation === 'add' ? anchor + added
    : operation === 'change' ? anchor.replace('{{ .Values.codeBundle.auth.existingSecretKey | default "token" }}', 'fixture-rotated-token')
    : '';
} else if (variant.constructor === 'typescript-export-v1') {
  anchor = "export const PLUGIN_API_VERSION = 'pipeline-plugin-v2' as const;\n";
  added = "export const FIXTURE_PLUGIN_COMPATIBILITY = 'fixture-plugin-v1' as const;\n";
  replacement = operation === 'add' ? anchor + added
    : operation === 'change' ? anchor.replace('pipeline-plugin-v2', 'fixture-plugin-v3') : '';
} else if (variant.constructor === 'typescript-contract-member-v1') {
  anchor = "  schemaVersion: 'review-cache-profile.v1';\n";
  added = '  fixtureCompatibility?: { version: "fixture.v1"; strict: boolean };\n';
  replacement = operation === 'add' ? anchor + added
    : operation === 'change' ? "  schemaVersion?: 'review-cache-profile.v2';\n" : '';
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
