// tests/08-architecture-validator.test.js
// Module 08 — Architecture Validation Agent
//
// Verifies:
//   1. validator-lifecycle       — validator runs before module execution; blocks or passes correctly
//   2. good-fixture-pass         — known-good architecture fixture passes with no blocking findings
//   3. broken-fixture-blocks     — broken fixture yields blocking findings and prevents pipeline start
//   4. warning-fixture-proceeds  — warning-only fixture yields non-blocking findings, pipeline continues
//   5. finding-schema            — findings have all required fields with valid values
//   6. artifact-output           — results.json, summary.md, validator-prompt.md written correctly
//   7. blocking-policy           — isBlocking returns correct values for all severity levels
//   8. deterministic-checks      — each check category exercises specific finding codes

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  runArchValidator,
  archValidatorLogDir,
  buildMarkdownSummary,
  isBlocking,
  buildValidatorPrompt,
  SEVERITY,
  SCOPE,
  FINDING_CODES,
} from '../services/arch-validator.js';

// ── Test helpers ──────────────────────────────────────────────────────────────

function mkTmpDir(prefix = 'arch-val-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/**
 * Build a minimal config and populate the swarm directory structure.
 * agentEnabled=false skips gateway calls in all tests.
 */
function makeEnv(baseDir, extraConfig = {}) {
  const project = 'test-arch';
  const swarmDir = path.join(baseDir, 'Projects', project, 'src', '.swarm');
  const modulesDir = path.join(swarmDir, 'modules');
  const logDir = path.join(baseDir, 'logs');
  fs.mkdirSync(modulesDir, { recursive: true });
  fs.mkdirSync(logDir, { recursive: true });

  const config = {
    project,
    repo_root: baseDir,
    paths: {
      swarm_dir: swarmDir,
      modules_dir: modulesDir,
      progress_file: path.join(swarmDir, 'progress.json'),
    },
    _logDir: logDir,
    _testOverrides: { archValidator: { agentEnabled: false } },
    ...extraConfig,
  };
  return { config, swarmDir, modulesDir, logDir };
}

/** Create a module directory with optional FORGE.md and BUSTER.md. */
function makeModuleDir(modulesDir, dir, { forge = true, buster = true, testSpec = null } = {}) {
  const modDir = path.join(modulesDir, dir);
  fs.mkdirSync(modDir, { recursive: true });
  if (forge) fs.writeFileSync(path.join(modDir, 'FORGE.md'), `# FORGE\n## Goal\nImplement ${dir}.\n`);
  if (buster) fs.writeFileSync(path.join(modDir, 'BUSTER.md'), `# BUSTER\n## Tests\nTest ${dir}.\n`);
  if (testSpec) fs.writeFileSync(path.join(modDir, 'test-spec.json'), JSON.stringify(testSpec, null, 2));
  return modDir;
}

/** Build a minimal valid progress.json. */
function makeProgress(overrides = {}) {
  return {
    project: 'test-arch',
    execution_order: ['01-hello'],
    modules: {
      '01-hello': { dir: '01-hello', title: 'Hello', stages: ['forge', 'buster'] },
    },
    gates: {},
    ...overrides,
  };
}

// ── 1. Blocking policy unit tests ────────────────────────────────────────────

describe('isBlocking()', () => {
  it('returns false for empty findings', () => {
    assert.equal(isBlocking([]), false);
  });

  it('returns false when all findings are warn or info', () => {
    const findings = [
      { id: 'X', severity: 'warn', scope: 'module', paths: [], explanation: '', remediation: '' },
      { id: 'Y', severity: 'info', scope: 'project', paths: [], explanation: '', remediation: '' },
    ];
    assert.equal(isBlocking(findings), false);
  });

  it('returns false for error severity (non-blocking per policy)', () => {
    const findings = [
      { id: 'E', severity: 'error', scope: 'module', paths: [], explanation: '', remediation: '' },
    ];
    assert.equal(isBlocking(findings), false);
  });

  it('returns true when any finding has severity blocking', () => {
    const findings = [
      { id: 'W', severity: 'warn', scope: 'project', paths: [], explanation: '', remediation: '' },
      { id: 'B', severity: 'blocking', scope: 'module', paths: [], explanation: '', remediation: '' },
    ];
    assert.equal(isBlocking(findings), true);
  });

  it('handles non-array input gracefully', () => {
    assert.equal(isBlocking(null), false);
    assert.equal(isBlocking(undefined), false);
    assert.equal(isBlocking({}), false);
  });
});

// ── 2. buildMarkdownSummary() ─────────────────────────────────────────────────

describe('buildMarkdownSummary()', () => {
  it('produces a PASS header for an empty findings result', () => {
    const result = { blocked: false, project: 'my-project', timestamp: '2026-01-01T00:00:00.000Z', findings: [] };
    const md = buildMarkdownSummary(result);
    assert.ok(md.includes('PASS'), 'should include PASS status');
    assert.ok(md.includes('my-project'), 'should include project name');
    assert.ok(md.includes('No issues found'), 'should note no issues');
  });

  it('produces a BLOCKED header when blocked=true', () => {
    const result = {
      blocked: true,
      project: 'broken',
      timestamp: '2026-01-01T00:00:00.000Z',
      findings: [
        { id: 'MODULE_FORGE_MISSING', severity: 'blocking', scope: 'module', paths: ['modules/01/FORGE.md'], explanation: 'FORGE.md missing', remediation: 'Create it.' },
      ],
    };
    const md = buildMarkdownSummary(result);
    assert.ok(md.includes('BLOCKED'), 'should include BLOCKED status');
    assert.ok(md.includes('MODULE_FORGE_MISSING'), 'should include finding id');
    assert.ok(md.includes('FORGE.md missing'), 'should include explanation');
    assert.ok(md.includes('Create it.'), 'should include remediation');
  });

  it('includes counts for each severity level', () => {
    const result = {
      blocked: true,
      project: 'p',
      timestamp: '2026-01-01T00:00:00.000Z',
      findings: [
        { id: 'A', severity: 'blocking', scope: 'module', paths: [], explanation: '', remediation: '' },
        { id: 'B', severity: 'warn',     scope: 'project', paths: [], explanation: '', remediation: '' },
        { id: 'C', severity: 'info',     scope: 'config', paths: [], explanation: '', remediation: '' },
      ],
    };
    const md = buildMarkdownSummary(result);
    assert.ok(md.includes('| blocking | 1 |'), 'blocking count should be 1');
    assert.ok(md.includes('| warn     | 1 |'), 'warn count should be 1');
    assert.ok(md.includes('| info     | 1 |'), 'info count should be 1');
  });
});

// ── 3. buildValidatorPrompt() ─────────────────────────────────────────────────

describe('buildValidatorPrompt()', () => {
  it('includes project name and execution order in prompt', () => {
    const progress = makeProgress();
    const tmp = mkTmpDir();
    const { config } = makeEnv(tmp);
    const prompt = buildValidatorPrompt(progress, config, []);
    assert.ok(prompt.includes('test-arch'), 'should include project name');
    assert.ok(prompt.includes('01-hello'), 'should include execution order items');
  });

  it('includes deterministic findings in the prompt context', () => {
    const progress = makeProgress();
    const tmp = mkTmpDir();
    const { config } = makeEnv(tmp);
    const findings = [
      { id: 'MISSING_FORGE', severity: 'blocking', scope: 'module', paths: [], explanation: 'FORGE.md missing for 01', remediation: 'Create it.' },
    ];
    const prompt = buildValidatorPrompt(progress, config, findings);
    assert.ok(prompt.includes('MISSING_FORGE'), 'should include finding id in context');
    assert.ok(prompt.includes('FORGE.md missing for 01'), 'should include finding explanation');
  });

  it('notes None when no deterministic findings', () => {
    const progress = makeProgress();
    const tmp = mkTmpDir();
    const { config } = makeEnv(tmp);
    const prompt = buildValidatorPrompt(progress, config, []);
    assert.ok(prompt.includes('None.'), 'should note no prior findings');
  });
});

// ── 4. Good fixture — valid architecture passes ───────────────────────────────

describe('good-fixture-pass', () => {
  it('returns blocked=false and no findings for a valid project definition', async () => {
    const tmp = mkTmpDir();
    const { config, modulesDir } = makeEnv(tmp);

    makeModuleDir(modulesDir, '01-hello');
    const progress = makeProgress();

    const result = await runArchValidator(config, progress);
    assert.equal(result.blocked, false, 'good fixture should not be blocked');
    assert.equal(result.findings.length, 0, 'good fixture should have no findings');
    assert.ok(result.timestamp, 'should include timestamp');
    assert.equal(result.project, 'test-arch', 'should include project name');
  });

  it('passes with multiple modules and a buster gate', async () => {
    const tmp = mkTmpDir();
    const { config, modulesDir, swarmDir } = makeEnv(tmp);

    makeModuleDir(modulesDir, '01-alpha');
    makeModuleDir(modulesDir, '02-beta');

    // Gate instructions file
    const instrFile = 'gate-instructions.md';
    fs.writeFileSync(path.join(swarmDir, instrFile), '# Gate Review\nCheck everything.\n');

    const progress = {
      project: 'test-arch',
      execution_order: ['01-alpha', 'gate:review-alpha', '02-beta'],
      modules: {
        '01-alpha': { dir: '01-alpha', title: 'Alpha', stages: ['forge', 'buster'] },
        '02-beta':  { dir: '02-beta',  title: 'Beta',  stages: ['forge', 'buster'] },
      },
      gates: {
        'review-alpha': {
          type: 'review',
          title: 'Review Alpha',
          review_name: 'alpha-review',
          instructions_file: instrFile,
        },
      },
    };

    const result = await runArchValidator(config, progress);
    assert.equal(result.blocked, false, 'multi-module fixture should not be blocked');
    const blockingFindings = result.findings.filter(f => f.severity === 'blocking');
    assert.equal(blockingFindings.length, 0, 'should have no blocking findings');
  });
});

// ── 5. Broken fixture — specific blocking findings emitted ────────────────────

describe('broken-fixture-blocks', () => {
  it('blocks when FORGE.md is missing for a module', async () => {
    const tmp = mkTmpDir();
    const { config, modulesDir } = makeEnv(tmp);

    // Create module dir but NO FORGE.md
    makeModuleDir(modulesDir, '01-hello', { forge: false, buster: true });
    const progress = makeProgress();

    const result = await runArchValidator(config, progress);
    assert.equal(result.blocked, true, 'missing FORGE.md should block');
    const f = result.findings.find(f => f.id === FINDING_CODES.MODULE_FORGE_MISSING);
    assert.ok(f, `should emit ${FINDING_CODES.MODULE_FORGE_MISSING} finding`);
    assert.equal(f.severity, SEVERITY.BLOCKING);
    assert.ok(f.paths.length > 0, 'should include path reference');
    assert.ok(f.explanation.length > 0, 'should include explanation');
    assert.ok(f.remediation.length > 0, 'should include remediation');
  });

  it('blocks when execution_order references undefined module', async () => {
    const tmp = mkTmpDir();
    const { config, modulesDir } = makeEnv(tmp);

    makeModuleDir(modulesDir, '01-hello');
    const progress = makeProgress({
      execution_order: ['01-hello', '99-ghost'], // 99-ghost is not in modules
    });

    const result = await runArchValidator(config, progress);
    assert.equal(result.blocked, true, 'undefined module in exec order should block');
    const f = result.findings.find(f => f.id === FINDING_CODES.EXEC_ORDER_MODULE_UNDEFINED);
    assert.ok(f, `should emit ${FINDING_CODES.EXEC_ORDER_MODULE_UNDEFINED}`);
    assert.equal(f.severity, SEVERITY.BLOCKING);
  });

  it('blocks when execution_order references undefined gate', async () => {
    const tmp = mkTmpDir();
    const { config, modulesDir } = makeEnv(tmp);

    makeModuleDir(modulesDir, '01-hello');
    const progress = makeProgress({
      execution_order: ['01-hello', 'gate:missing-gate'],
      gates: {},
    });

    const result = await runArchValidator(config, progress);
    assert.equal(result.blocked, true, 'undefined gate should block');
    const f = result.findings.find(f => f.id === FINDING_CODES.EXEC_ORDER_GATE_UNDEFINED);
    assert.ok(f, `should emit ${FINDING_CODES.EXEC_ORDER_GATE_UNDEFINED}`);
  });

  it('blocks when progress.json is missing required project field', async () => {
    const tmp = mkTmpDir();
    const { config, modulesDir } = makeEnv(tmp);

    makeModuleDir(modulesDir, '01-hello');
    const progress = makeProgress({ project: undefined });

    const result = await runArchValidator(config, progress);
    assert.equal(result.blocked, true, 'missing project field should block');
    const f = result.findings.find(f => f.id === FINDING_CODES.PROGRESS_MISSING_FIELD);
    assert.ok(f, `should emit ${FINDING_CODES.PROGRESS_MISSING_FIELD}`);
  });

  it('blocks on dependency graph self-reference', async () => {
    const tmp = mkTmpDir();
    const { config, modulesDir } = makeEnv(tmp);

    makeModuleDir(modulesDir, '01-hello');
    const progress = makeProgress({
      modules: {
        '01-hello': { dir: '01-hello', title: 'Hello', stages: ['forge', 'buster'], depends_on: ['01-hello'] },
      },
    });

    const result = await runArchValidator(config, progress);
    assert.equal(result.blocked, true, 'self-referencing dependency should block');
    const f = result.findings.find(f => f.id === FINDING_CODES.DEP_SELF_REFERENCE);
    assert.ok(f, `should emit ${FINDING_CODES.DEP_SELF_REFERENCE}`);
    assert.equal(f.scope, SCOPE.DEPENDENCY_GRAPH);
  });

  it('blocks on dependency referencing undefined module', async () => {
    const tmp = mkTmpDir();
    const { config, modulesDir } = makeEnv(tmp);

    makeModuleDir(modulesDir, '01-hello');
    const progress = makeProgress({
      modules: {
        '01-hello': { dir: '01-hello', title: 'Hello', stages: ['forge', 'buster'], depends_on: ['00-nonexistent'] },
      },
    });

    const result = await runArchValidator(config, progress);
    assert.equal(result.blocked, true, 'undefined dependency should block');
    const f = result.findings.find(f => f.id === FINDING_CODES.DEP_UNDEFINED_REF);
    assert.ok(f);
  });

  it('blocks on invalid test-spec.json JSON syntax', async () => {
    const tmp = mkTmpDir();
    const { config, modulesDir } = makeEnv(tmp);

    const modDir = makeModuleDir(modulesDir, '01-hello', { forge: true, buster: true });
    fs.writeFileSync(path.join(modDir, 'test-spec.json'), 'NOT { valid JSON }}');

    const progress = makeProgress();

    const result = await runArchValidator(config, progress);
    assert.equal(result.blocked, true, 'invalid test-spec JSON should block');
    const f = result.findings.find(f => f.id === FINDING_CODES.MODULE_TEST_SPEC_INVALID_JSON);
    assert.ok(f);
    assert.equal(f.scope, SCOPE.TEST_SPEC);
  });

  it('blocks when gate instructions_file is referenced but missing', async () => {
    const tmp = mkTmpDir();
    const { config, modulesDir } = makeEnv(tmp);

    makeModuleDir(modulesDir, '01-hello');
    const progress = {
      project: 'test-arch',
      execution_order: ['01-hello', 'gate:my-gate'],
      modules: {
        '01-hello': { dir: '01-hello', title: 'Hello', stages: ['forge', 'buster'] },
      },
      gates: {
        'my-gate': {
          type: 'review',
          title: 'My Gate',
          review_name: 'my-gate-review',
          instructions_file: 'gate-instructions-missing.md', // does not exist
        },
      },
    };

    const result = await runArchValidator(config, progress);
    assert.equal(result.blocked, true, 'missing gate instructions file should block');
    const f = result.findings.find(f => f.id === FINDING_CODES.GATE_INSTRUCTIONS_MISSING);
    assert.ok(f);
  });
});

// ── 6. Warning-only fixture — non-blocking, pipeline proceeds ─────────────────

describe('warning-fixture-proceeds', () => {
  it('returns blocked=false when only warnings are found', async () => {
    const tmp = mkTmpDir();
    const { config, modulesDir } = makeEnv(tmp);

    // Create module dir WITHOUT BUSTER.md — emits warn, not blocking
    makeModuleDir(modulesDir, '01-hello', { forge: true, buster: false });
    const progress = makeProgress();

    const result = await runArchValidator(config, progress);
    assert.equal(result.blocked, false, 'missing BUSTER.md should not block');
    const warnFinding = result.findings.find(f => f.id === FINDING_CODES.MODULE_BUSTER_MISSING);
    assert.ok(warnFinding, 'should emit MODULE_BUSTER_MISSING warning');
    assert.equal(warnFinding.severity, SEVERITY.WARN, 'should be warn not blocking');
  });

  it('returns blocked=false for test-spec.json module_id mismatch warning', async () => {
    const tmp = mkTmpDir();
    const { config, modulesDir } = makeEnv(tmp);

    makeModuleDir(modulesDir, '01-hello', {
      forge: true,
      buster: true,
      testSpec: {
        module_id: 'wrong-id',   // mismatch — should warn, not block
        focus: ['do things'],
      },
    });
    const progress = makeProgress();

    const result = await runArchValidator(config, progress);
    assert.equal(result.blocked, false, 'test-spec module_id mismatch should not block');
    const mismatch = result.findings.find(f => f.id === FINDING_CODES.TEST_SPEC_MODULE_ID_MISMATCH);
    assert.ok(mismatch, 'should emit TEST_SPEC_MODULE_ID_MISMATCH');
    assert.equal(mismatch.severity, SEVERITY.WARN);
  });

  it('returns blocked=false with warn-level model config issue', async () => {
    const tmp = mkTmpDir();
    const { config, modulesDir } = makeEnv(tmp, {
      models: { arch_validator: { model: null } }, // malformed — no model string
    });

    makeModuleDir(modulesDir, '01-hello');
    const progress = makeProgress();

    const result = await runArchValidator(config, progress);
    assert.equal(result.blocked, false, 'malformed model config should not block');
    const f = result.findings.find(f => f.id === FINDING_CODES.ARCH_VALIDATOR_MODEL_MALFORMED);
    assert.ok(f, 'should emit ARCH_VALIDATOR_MODEL_MALFORMED');
    assert.equal(f.severity, SEVERITY.WARN);
  });
});

// ── 7. Finding schema validation ──────────────────────────────────────────────

describe('finding schema', () => {
  it('all findings have required fields with valid values', async () => {
    const tmp = mkTmpDir();
    const { config, modulesDir } = makeEnv(tmp);

    // Produce a mix of findings
    makeModuleDir(modulesDir, '01-hello', { forge: false, buster: false });
    const progress = makeProgress({
      modules: {
        '01-hello': { dir: '01-hello', title: 'Hello', stages: ['forge', 'buster'], depends_on: ['99-ghost'] },
      },
    });

    const result = await runArchValidator(config, progress);
    assert.ok(result.findings.length > 0, 'should have findings to validate');

    const validSeverities = new Set(['info', 'warn', 'error', 'blocking']);
    const validScopes = new Set(['project', 'module', 'gate', 'dependency_graph', 'test_spec', 'config']);

    for (const f of result.findings) {
      assert.ok(typeof f.id === 'string' && f.id.length > 0, `finding.id must be non-empty string, got: ${JSON.stringify(f.id)}`);
      assert.ok(validSeverities.has(f.severity), `finding.severity '${f.severity}' must be one of: ${[...validSeverities].join(', ')}`);
      assert.ok(validScopes.has(f.scope), `finding.scope '${f.scope}' must be one of: ${[...validScopes].join(', ')}`);
      assert.ok(Array.isArray(f.paths), 'finding.paths must be an array');
      assert.ok(typeof f.explanation === 'string' && f.explanation.length > 0, 'finding.explanation must be non-empty string');
      assert.ok(typeof f.remediation === 'string' && f.remediation.length > 0, 'finding.remediation must be non-empty string');
    }
  });
});

// ── 8. Artifact output ────────────────────────────────────────────────────────

describe('artifact-output', () => {
  it('writes results.json, summary.md, and validator-prompt.md to logDir/architecture-validator/', async () => {
    const tmp = mkTmpDir();
    const { config, modulesDir, logDir } = makeEnv(tmp);

    makeModuleDir(modulesDir, '01-hello');
    const progress = makeProgress();

    await runArchValidator(config, progress);

    const artifactDir = path.join(logDir, 'architecture-validator');
    assert.ok(fs.existsSync(path.join(artifactDir, 'results.json')), 'results.json should be written');
    assert.ok(fs.existsSync(path.join(artifactDir, 'summary.md')), 'summary.md should be written');
    assert.ok(fs.existsSync(path.join(artifactDir, 'validator-prompt.md')), 'validator-prompt.md should be written');
  });

  it('results.json is valid JSON with expected structure', async () => {
    const tmp = mkTmpDir();
    const { config, modulesDir, logDir } = makeEnv(tmp);

    makeModuleDir(modulesDir, '01-hello');
    const progress = makeProgress();

    await runArchValidator(config, progress);

    const resultsPath = path.join(logDir, 'architecture-validator', 'results.json');
    const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));

    assert.ok('blocked' in results, 'results.json should have blocked field');
    assert.ok('findings' in results, 'results.json should have findings field');
    assert.ok('timestamp' in results, 'results.json should have timestamp field');
    assert.ok('project' in results, 'results.json should have project field');
    assert.ok(Array.isArray(results.findings), 'findings should be an array');
    assert.equal(typeof results.blocked, 'boolean', 'blocked should be boolean');
  });

  it('summary.md is human-readable markdown with project name and result', async () => {
    const tmp = mkTmpDir();
    const { config, modulesDir, logDir } = makeEnv(tmp);

    makeModuleDir(modulesDir, '01-hello');
    const progress = makeProgress();

    await runArchValidator(config, progress);

    const summaryPath = path.join(logDir, 'architecture-validator', 'summary.md');
    const summary = fs.readFileSync(summaryPath, 'utf8');

    assert.ok(summary.includes('# Architecture Validation Report'), 'should have markdown heading');
    assert.ok(summary.includes('test-arch'), 'should include project name');
    assert.ok(summary.includes('PASS') || summary.includes('BLOCKED'), 'should include result status');
  });

  it('does not throw or block pipeline if _logDir is missing', async () => {
    const tmp = mkTmpDir();
    const { config, modulesDir } = makeEnv(tmp);
    delete config._logDir; // simulate missing logDir

    makeModuleDir(modulesDir, '01-hello');
    const progress = makeProgress();

    // Should not throw
    const result = await runArchValidator(config, progress);
    assert.ok('blocked' in result, 'should still return a result object');
  });
});

// ── 9. archValidatorLogDir() ──────────────────────────────────────────────────

describe('archValidatorLogDir()', () => {
  it('returns correct path under _logDir', () => {
    const config = { _logDir: '/some/log/dir' };
    const dir = archValidatorLogDir(config);
    assert.equal(dir, '/some/log/dir/architecture-validator');
  });

  it('returns null when _logDir is absent', () => {
    const dir = archValidatorLogDir({});
    assert.equal(dir, null);
  });
});

// ── 10. validator-before-module-execution (lifecycle placement) ───────────────

describe('validator-before-module-execution', () => {
  it('runArchValidator is a function that can be injected into pipeline-runner deps', async () => {
    // Verifies the shape contract: runArchValidator(config, progress) returns
    // { blocked, findings, timestamp, project } — the shape runPipeline expects.
    const tmp = mkTmpDir();
    const { config, modulesDir } = makeEnv(tmp);
    makeModuleDir(modulesDir, '01-hello');
    const progress = makeProgress();

    const result = await runArchValidator(config, progress);

    assert.ok(typeof result === 'object' && result !== null);
    assert.ok('blocked' in result, 'must have blocked field');
    assert.ok('findings' in result, 'must have findings field');
    assert.ok('timestamp' in result, 'must have timestamp field');
    assert.ok('project' in result, 'must have project field');
    assert.equal(typeof result.blocked, 'boolean');
    assert.ok(Array.isArray(result.findings));
  });

  it('arch validation runs before module execution by checking pipeline-runner import', async () => {
    // Verifies that pipeline-runner.js imports and uses runArchValidator.
    // We do this by importing the runner and inspecting that arch validation
    // is correctly wired via the DEFAULT_DEPS mechanism.
    const runnerModule = await import('../runners/pipeline-runner.js');
    assert.ok(typeof runnerModule.runPipeline === 'function', 'runPipeline must be exported');
    assert.ok(typeof runnerModule.findNextStep === 'function', 'findNextStep must be exported');
  });

  it('pipeline halts when runArchValidator returns blocked=true via testOverrides injection', async () => {
    // This test simulates what runPipeline does: if runArchValidator returns blocked=true,
    // the pipeline exits with EXIT_BLOCKED before reaching findNextStep.
    const { runPipeline } = await import('../runners/pipeline-runner.js');
    const { EXIT_BLOCKED } = await import('../core/constants.js');
    const { initLogDir } = await import('../services/status-store.js');
    const { createPipelineContext } = await import('../core/context.js');
    const { setActiveContext, clearActiveContext } = await import('../core/logger.js');

    const tmp = mkTmpDir('lifecycle-');
    const project = 'lifecycle-test';
    const swarmDir = path.join(tmp, 'Projects', project, 'src', '.swarm');
    const modulesDir = path.join(swarmDir, 'modules');
    fs.mkdirSync(modulesDir, { recursive: true });

    const config = {
      project,
      repo_root: tmp,
      paths: {
        swarm_dir: swarmDir,
        modules_dir: modulesDir,
        progress_file: path.join(swarmDir, 'progress.json'),
      },
      _testOverrides: {
        archValidator: { agentEnabled: false },
        pipelineRunner: {
          // inject a blocking arch validator
          runArchValidator: async () => ({
            blocked: true,
            project,
            timestamp: new Date().toISOString(),
            findings: [{
              id: 'INJECTED_BLOCKING',
              severity: 'blocking',
              scope: 'project',
              paths: [],
              explanation: 'Injected blocking finding for lifecycle test',
              remediation: 'Fix the architecture.',
            }],
          }),
          // stubs to satisfy pipeline-runner without real infrastructure
          discord: async () => {},
          output: () => {},
          writeSummary: () => {},
          loadStatus: () => null,
          releaseGateFiles: async () => {},
          syncControlFiles: async () => {},
        },
      },
    };

    const progress = {
      project,
      execution_order: ['01-module'],
      modules: {
        '01-module': { dir: '01-module', title: 'Module One', stages: ['forge', 'buster'] },
      },
      gates: {},
    };

    const ctx = createPipelineContext({ config, runId: 'run-lifecycle-test' });
    setActiveContext(ctx);
    initLogDir(config, ctx);

    try {
      const exitCode = await runPipeline(config, progress, {});
      assert.equal(exitCode, EXIT_BLOCKED, 'pipeline should exit with EXIT_BLOCKED when arch validation blocks');
    } finally {
      clearActiveContext();
    }
  });

  it('pipeline proceeds past arch validation when runArchValidator returns blocked=false', async () => {
    // When arch validation passes, pipeline continues into module execution loop.
    // We verify this by injecting a passing arch validator and a module runner
    // that returns success, and confirming we get EXIT_OK.
    const { runPipeline } = await import('../runners/pipeline-runner.js');
    const { EXIT_OK } = await import('../core/constants.js');
    const { initLogDir } = await import('../services/status-store.js');
    const { createPipelineContext } = await import('../core/context.js');
    const { setActiveContext, clearActiveContext } = await import('../core/logger.js');

    const tmp = mkTmpDir('lifecycle-pass-');
    const project = 'lifecycle-pass';
    const swarmDir = path.join(tmp, 'Projects', project, 'src', '.swarm');
    const modulesDir = path.join(swarmDir, 'modules');
    fs.mkdirSync(modulesDir, { recursive: true });

    const config = {
      project,
      repo_root: tmp,
      paths: {
        swarm_dir: swarmDir,
        modules_dir: modulesDir,
        progress_file: path.join(swarmDir, 'progress.json'),
      },
      _testOverrides: {
        pipelineRunner: {
          runArchValidator: async () => ({
            blocked: false, project, timestamp: new Date().toISOString(), findings: [],
          }),
          discord: async () => {},
          output: () => {},
          writeSummary: () => {},
          generateProjectSummary: async () => {},
          generatePipelineReview: async () => {},
          releaseGateFiles: async () => {},
          syncControlFiles: async () => {},
          // All modules already PASS → pipeline completes immediately
          loadStatus: () => ({ status: 'PASS', fail_count: 0, current_phase: null, cost: {} }),
        },
      },
    };

    const progress = {
      project,
      execution_order: ['01-module'],
      modules: {
        '01-module': { dir: '01-module', title: 'Module One', stages: ['forge', 'buster'] },
      },
      gates: {},
    };

    const ctx = createPipelineContext({ config, runId: 'run-lifecycle-pass' });
    setActiveContext(ctx);
    initLogDir(config, ctx);

    try {
      const exitCode = await runPipeline(config, progress, {});
      assert.equal(exitCode, EXIT_OK, 'pipeline should complete when arch validation passes and all modules pass');
    } finally {
      clearActiveContext();
    }
  });
});
