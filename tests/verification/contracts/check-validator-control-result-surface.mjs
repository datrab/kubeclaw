import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'contracts/check-validator-control-result-surface' });
import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { pathToFileURL } from 'url';

function parseArgs(argv = process.argv.slice(2)) {
  const args = { sourceRoot: process.cwd() };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--source-root') args.sourceRoot = path.resolve(argv[i + 1]);
  }
  return args;
}

const { sourceRoot } = parseArgs();
const helperPath = path.join(sourceRoot, 'skills/nova/pipeline/services/contracts/validator-control-result.ts');
const moduleValidatorsPath = path.join(sourceRoot, 'skills/nova/pipeline/services/module-validators.ts');
const lintPath = path.join(sourceRoot, 'skills/nova/pipeline/services/lint.ts');
const schedulingPath = path.join(sourceRoot, 'skills/nova/pipeline/runners/pipeline-runner-scheduling.ts');
const registryPath = path.join(sourceRoot, 'skills/nova/pipeline/core/registry.ts');
const registryBuiltinsPath = path.join(sourceRoot, 'skills/nova/pipeline/core/registry/builtins.ts');
const constantsPath = path.join(sourceRoot, 'skills/nova/pipeline/core/constants.ts');
const helperSource = fs.readFileSync(helperPath, 'utf8');
const moduleValidatorsSource = fs.readFileSync(moduleValidatorsPath, 'utf8');
const lintSource = fs.readFileSync(lintPath, 'utf8');
const schedulingSource = fs.readFileSync(schedulingPath, 'utf8');
const registrySource = `${fs.readFileSync(registryPath, 'utf8')}\n${fs.readFileSync(registryBuiltinsPath, 'utf8')}`;
const constantsSource = fs.readFileSync(constantsPath, 'utf8');

for (const marker of [
  'export const VALIDATOR_CONTROL_NEXT_ACTIONS',
  'export function buildTypedValidatorControlResult(',
  'export function buildModuleValidatorControlResult(',
  'export function isTypedValidatorControlResult(',
  'export function coerceTypedValidatorControlResult(',
  'export function validateTypedValidatorControlResult(',
  'export function normalizeTypedValidatorControlResult(',
]) {
  assert.equal(helperSource.includes(marker), true, `validator control-result helper should expose ${marker}`);
}

assert.equal(helperSource.includes('compatibility-shaped validation results are not accepted at the validator boundary'), true, 'validator helper should reject compatibility-shaped validation outputs');
assert.equal(helperSource.includes('export function mapModuleValidatorResultToControl('), false, 'validator helper must not keep raw passed/blocked mapping bridge');
assert.equal(helperSource.includes('findCompatibilityAuthorityKeys('), false, 'validator helper must not depend on compatibility-authority helpers');
assert.equal(helperSource.includes("from './control-result-mapping.ts'"), false, 'validator control-result helper must not use generic compatibility mapping constructors');
assert.equal(helperSource.includes("String(stageId || '').split(':')[1]"), false, 'validator control-result helper must not infer producerType from stageId');
assert.equal(schedulingSource.includes('validateTypedValidatorControlResult(result, {'), true, 'architecture scheduled validator validation should reuse generic typed validator checks');
assert.equal(schedulingSource.includes("allowedNextActions: ['pass', 'block']"), true, 'architecture scheduled validator should keep pass/block-only actions');
assert.equal(lintSource.includes('Number.isFinite(failCount)'), true, 'pre-check lint attempt naming should normalize missing or malformed fail_count');

for (const marker of [
  'validator:delivery_lint',
  'validator:pre_check',
  'validator:full_lint',
]) {
  assert.equal(constantsSource.includes(marker), true, `constants should register ${marker} as a validator stage id`);
}

for (const marker of [
  'export function runDeliveryLintValidatorStage(',
  'export async function runPreCheckValidatorStage(',
  'export function runFullLintValidatorStage(',
  'buildModuleValidatorControlResult(',
]) {
  assert.equal(moduleValidatorsSource.includes(marker), true, `module validators helper should include ${marker}`);
}

for (const marker of [
  "moduleId: 'builtin.validator.delivery_lint'",
  "moduleId: 'builtin.validator.pre_check'",
  "moduleId: 'builtin.validator.full_lint'",
  'runDeliveryLintValidatorStage(config, progress, input',
  'runPreCheckValidatorStage(config, progress, input',
  'runFullLintValidatorStage(config, progress, input',
]) {
  assert.equal(registrySource.includes(marker), true, `registry should include ${marker}`);
}

const helperMod = await import(pathToFileURL(helperPath).href);
const moduleValidatorsMod = await import(pathToFileURL(moduleValidatorsPath).href);
const lintMod = await import(pathToFileURL(lintPath).href);
const schedulingMod = await import(pathToFileURL(schedulingPath).href);

for (const exportName of [
  'buildTypedValidatorControlResult',
  'buildModuleValidatorControlResult',
  'isTypedValidatorControlResult',
  'coerceTypedValidatorControlResult',
  'validateTypedValidatorControlResult',
  'normalizeTypedValidatorControlResult',
]) {
  assert.equal(typeof helperMod[exportName], 'function', `validator helper should export ${exportName}`);
}

for (const exportName of [
  'runDeliveryLintValidatorStage',
  'runPreCheckValidatorStage',
  'runFullLintValidatorStage',
]) {
  assert.equal(typeof moduleValidatorsMod[exportName], 'function', `module validators helper should export ${exportName}`);
}

const config = { project: 'validator-control-contract', _runId: 'run-validator-control-contract-1' };
const pass = helperMod.buildModuleValidatorControlResult(config, { passed: true }, {
  producerType: 'pre_check', stageId: 'validator:pre_check', moduleId: '01', moduleDir: '/workspace/modules/01', nextAction: 'pass', outcomeClass: 'passed',
});
assert.equal(pass.schemaVersion, 'v1');
assert.equal(pass.producerKind, 'validator');
assert.equal(pass.producerType, 'pre_check');
assert.equal(pass.nextAction, 'pass');
assert.equal(pass.diagnostics.typed.validator.scope, 'module');
assert.equal(helperMod.validateTypedValidatorControlResult(pass, { producerType: 'pre_check' }).length, 0);

const requestFix = helperMod.buildModuleValidatorControlResult(config, {
  passed: false,
  failures: [{ stage: 'delivery_lint', code: 'STATIC_PATH_MISMATCH', explanation: 'static path mismatch', next_step: 'fix Dockerfile COPY' }],
}, {
  producerType: 'delivery_lint', stageId: 'validator:delivery_lint', moduleId: '01', nextAction: 'request_fix', issueType: 'code', outcomeClass: 'validation_failed',
});
assert.equal(requestFix.nextAction, 'request_fix');
assert.equal(requestFix.issueType, 'code');
assert.equal(requestFix.diagnostics.findings[0].code, 'STATIC_PATH_MISMATCH');

const block = helperMod.buildModuleValidatorControlResult(config, { passed: false, error: 'lint tool crashed' }, {
  producerType: 'full_lint', stageId: 'validator:full_lint', executionFailed: true, nextAction: 'block', issueType: 'environment', outcomeClass: 'execution_failed',
});
assert.equal(block.nextAction, 'block');
assert.equal(block.issueType, 'environment');
assert.equal(block.diagnostics.metadata.execution_failed, true);

assert.throws(
  () => helperMod.coerceTypedValidatorControlResult({ passed: true }, { producerType: 'pre_check' }),
  /compatibility-shaped validation results are not accepted at the validator boundary/,
  'raw compatibility-shaped validation results must not be accepted as typed validator controls',
);
assert.deepEqual(
  helperMod.validateTypedValidatorControlResult(pass, { producerType: 'pre_check' }),
  [],
  'typed validator controls should validate from schema/action fields without compatibility-authority helpers',
);

const deliveryPass = moduleValidatorsMod.runDeliveryLintValidatorStage(
  { project: 'validator-control-contract', _runId: 'run-validator-control-contract-1', paths: { modules_dir: '/tmp' }, repo_root: '/tmp' },
  { modules: { '01': { test_config: {} } } },
  {
    ids: { runId: 'run-validator-control-contract-1', moduleId: '01', stageId: 'validator:delivery_lint', producerType: 'delivery_lint' },
    executionContext: { moduleDir: '01' },
  },
);
assert.equal(deliveryPass.producerType, 'delivery_lint');
assert.equal(deliveryPass.nextAction, 'pass');

const preCheckPass = await moduleValidatorsMod.runPreCheckValidatorStage(
  { project: 'validator-control-contract', _runId: 'run-validator-control-contract-1', pre_check: { enabled: false }, paths: { modules_dir: '/tmp' }, repo_root: '/tmp' },
  { modules: { '01': {} } },
  {
    ids: { runId: 'run-validator-control-contract-1', moduleId: '01', stageId: 'validator:pre_check', producerType: 'pre_check' },
    executionContext: { moduleDir: '01' },
    stateSnapshot: { module: { statusRaw: { fail_count: 0 } } },
  },
);
assert.equal(preCheckPass.producerType, 'pre_check');
assert.equal(preCheckPass.nextAction, 'pass');

const lintAttemptRoot = fs.mkdtempSync(path.join(sourceRoot, '.tmp-validator-lint-attempt-'));
try {
  const lintReportPath = path.join(lintAttemptRoot, 'fake-lint-report.mjs');
  fs.writeFileSync(lintReportPath, `
import fs from 'fs';
import path from 'path';
const args = process.argv.slice(2);
const valueAfter = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? null : args[index + 1];
};
const output = valueAfter('--output');
const logPath = valueAfter('--log-path');
if (logPath) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.writeFileSync(logPath, JSON.stringify({ event: 'trace' }) + '\\n');
}
fs.writeFileSync(output, JSON.stringify({
  tier: valueAfter('--tier') || 'pre-check',
  timestamp: '2026-05-07T00:00:00.000Z',
  summary: { total_errors: 0, total_warnings: 0, tools_ok: 1, tools_skipped: 0, tools_failed: 0 },
  tools: {},
}, null, 2));
`);
  const repoRoot = path.join(lintAttemptRoot, 'repo');
  const moduleDir = '01';
  const modulesDir = path.join(repoRoot, '.swarm', 'modules');
  const logDir = path.join(repoRoot, '.swarm', 'logs');
  fs.mkdirSync(path.join(modulesDir, moduleDir), { recursive: true });
  const beforePreCheckTmp = new Set(fs.readdirSync('/tmp'));
  const lintResult = await lintMod.runPreCheck({
    project: 'validator-control-contract-lint-attempt',
    repo_root: repoRoot,
    paths: { modules_dir: modulesDir, swarm_dir: path.join(repoRoot, '.swarm') },
    pre_check: { lint_report_path: lintReportPath, timeout_seconds: 60 },
  }, moduleDir, {}, moduleDir);
  assert.equal(lintResult.passed, true, 'pre-check should pass with fake clean lint report and missing fail_count');
  const lintDir = path.join(logDir, 'modules', moduleDir, 'lint');
  assert.equal(fs.existsSync(path.join(lintDir, 'precheck-trace-attempt-1.jsonl')), true, 'missing fail_count should produce attempt-1 trace path');
  assert.equal(fs.existsSync(path.join(lintDir, 'precheck-attempt-1.json')), true, 'missing fail_count should produce attempt-1 report path');
  assert.equal(fs.readdirSync(lintDir).some((name) => name.includes('NaN')), false, 'pre-check lint artifacts must not contain attempt-NaN');
  assert.deepEqual(
    fs.readdirSync('/tmp').filter((name) => name.startsWith(`swarm-pipeline-lint-pre-check-${moduleDir}-`) && !beforePreCheckTmp.has(name)),
    [],
    'pre-check must remove lint-report /tmp scratch output after saving canonical lint artifacts',
  );

  const beforeFullLintTmp = new Set(fs.readdirSync('/tmp'));
  const fullLintResult = moduleValidatorsMod.runFullLintValidatorStage({
    project: 'validator-control-contract-lint-attempt',
    repo_root: repoRoot,
    paths: { modules_dir: modulesDir, swarm_dir: path.join(repoRoot, '.swarm') },
    _runId: 'run-validator-control-contract-lint-attempt',
    pre_check: { lint_report_path: lintReportPath },
  }, {}, {
    ids: { runId: 'run-validator-control-contract-lint-attempt', gateId: 'review', stageId: 'validator:full_lint', producerType: 'full_lint' },
    executionContext: { scheduleKey: 'mandatory:before:gate:review:validator:full_lint' },
  });
  assert.equal(fullLintResult.nextAction, 'pass', 'full lint validator should pass with fake clean lint report');
  const gateLintDir = path.join(logDir, 'gates', 'review', 'lint');
  const fullLintArtifacts = fs.existsSync(gateLintDir) ? fs.readdirSync(gateLintDir).filter((name) => name.startsWith('full-lint-') && name.endsWith('.json')) : [];
  assert.deepEqual(fullLintArtifacts, ['full-lint-mandatory-before-gate-review-validator-full_lint.json'], 'full lint validator should retain a canonical .swarm/logs gate lint report');
  assert.equal(fullLintResult.diagnostics.metadata.report_artifact, path.join(gateLintDir, fullLintArtifacts[0]), 'typed full lint diagnostics should point at retained report artifact');
  assert.deepEqual(
    fs.readdirSync('/tmp').filter((name) => name.startsWith('swarm-pipeline-lint-full-review-') && !beforeFullLintTmp.has(name)),
    [],
    'full lint validator must remove lint-report /tmp scratch output after saving canonical lint artifact',
  );
} finally {
  fs.rmSync(lintAttemptRoot, { recursive: true, force: true });
}

function buildArchitectureValidatorRegistry(rawResult) {
  const record = {
    enabled: true,
    manifest: {
      moduleId: 'contract.validator.architecture',
      kind: 'validator',
      hookFamily: 'validator.run',
      stageIds: ['validator:architecture'],
      capabilities: [],
      sourceType: 'local',
      trustTier: 'trusted',
    },
    config: {},
    implementation: {
      run: async () => rawResult,
    },
  };
  return {
    enabled: true,
    stageOwners: {
      'validator.run': {
        'validator:architecture': record,
      },
    },
  };
}

for (const [label, rawResult, expectedError] of [
  ['missing diagnostics summary', {
    schemaVersion: 'v1',
    producerKind: 'validator',
    producerType: 'architecture',
    nextAction: 'pass',
    diagnostics: {},
  }, 'diagnostics.summary must be a non-empty string'],
  ['block missing issueType', {
    schemaVersion: 'v1',
    producerKind: 'validator',
    producerType: 'architecture',
    nextAction: 'block',
    diagnostics: { summary: 'Architecture blocked' },
  }, 'block action requires issueType'],
]) {
  const archResult = await schedulingMod.runScheduledValidator({
    project: `validator-control-contract-${label.replace(/\s+/g, '-')}`,
    _runId: 'run-validator-control-contract-arch-1',
    pluginRegistry: buildArchitectureValidatorRegistry(rawResult),
  }, { modules: {}, gates: {}, execution_order: [] }, 'validator:architecture');
  assert.equal(archResult.nextAction, 'block', `malformed architecture validator output should fail closed for ${label}`);
  assert.equal(archResult.diagnostics.metadata.contract_invalid, true, `malformed architecture validator output should be marked contract-invalid for ${label}`);
  assert(archResult.diagnostics.metadata.contract_diagnostic.validationErrors.includes(expectedError), `expected architecture validator contract error for ${label}`);
}

assert.throws(
  () => helperMod.normalizeTypedValidatorControlResult({
    schemaVersion: 'v0',
    producerKind: 'validator',
    producerType: 'pre_check',
    nested: { auth: { api_key: 'sk-proj12345678901234567890' } },
  }, {
    producerType: 'pre_check',
    label: 'pre_check validator',
    coerce: (value) => value,
  }),
  (error) => {
    const diagnosticText = JSON.stringify(error?.diagnostics || {});
    return error?.diagnostics?.diagnosticType === 'plugin_contract_invalid'
      && error.diagnostics.rawResultPreview === undefined
      && error.diagnostics.coercedResultPreview === undefined
      && error.diagnostics.rawResultSummary?.redacted === true
      && error.diagnostics.coercedResultSummary?.redacted === true
      && !diagnosticText.includes('sk-proj12345678901234567890');
  },
  'validator contract diagnostics must summarize/redact nested secret-like raw plugin output at source',
);

quietConsole.restore();
console.log(JSON.stringify({ ok: true, checked: 73 }));
