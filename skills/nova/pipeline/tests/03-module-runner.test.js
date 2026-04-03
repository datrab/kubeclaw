import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

import { generateLintReport, formatLintReportForReviewer, runPreCheck } from '../services/lint.js';
import { checkDependencies } from '../services/dependencies.js';
import { runModule } from '../runners/module-runner.js';
import { STATUS, EXIT_OK, EXIT_NEEDS_NOVA } from '../core/constants.js';
import { createRunStats } from '../core/runtime.js';
import { initStatus, loadStatus, saveStatus, initLogDir } from '../services/status-store.js';
import { createPipelineContext } from '../core/context.js';
import { setActiveContext, clearActiveContext } from '../core/logger.js';

// ─── generateLintReport ───────────────────────────────────────────────────────

describe('generateLintReport()', () => {
  it('returns error when lint-report.js does not exist', () => {
    const config = {
      repo_root: '/tmp',
      project: 'test',
      pre_check: { lint_report_path: '/app/nonexistent/lint-report.js' },
    };
    const result = generateLintReport(config, 'pre-check', {});
    assert.equal(result.report, null);
    assert.ok(result.error.includes('not found'));
  });
});

// ─── formatLintReportForReviewer ─────────────────────────────────────────────

describe('formatLintReportForReviewer()', () => {
  it('renders a clean tool as ✅', () => {
    const report = {
      tier: 'pre-check',
      timestamp: '2026-01-01T00:00:00Z',
      changed_files: [],
      summary: { total_errors: 0, total_warnings: 0, tools_ok: 1, tools_skipped: 0, tools_failed: 0 },
      tools: {
        tsc: { status: 'ok', errors: 0, warnings: 0, findings: [] },
      },
    };
    const output = formatLintReportForReviewer(report);
    assert.ok(output.includes('✅ tsc — clean'), 'clean tool should render as ✅');
    assert.ok(output.includes('STATIC ANALYSIS REPORT'), 'should include header');
  });

  it('renders errors with 🔴 icon', () => {
    const report = {
      tier: 'pre-check',
      timestamp: '2026-01-01T00:00:00Z',
      changed_files: [],
      summary: { total_errors: 1, total_warnings: 0, tools_ok: 0, tools_skipped: 0, tools_failed: 0 },
      tools: {
        tsc: {
          status: 'ok',
          errors: 1,
          warnings: 0,
          findings: [{ file: 'src/foo.ts', line: 10, severity: 'error', message: 'Type error', code: 'TS2345' }],
        },
      },
    };
    const output = formatLintReportForReviewer(report);
    assert.ok(output.includes('🔴'), 'errors should render with 🔴');
    assert.ok(output.includes('src/foo.ts:10'), 'should include file:line reference');
    assert.ok(output.includes('TS2345'), 'should include error code');
  });

  it('skips tools with status "skipped"', () => {
    const report = {
      tier: 'pre-check',
      timestamp: '2026-01-01T00:00:00Z',
      changed_files: [],
      summary: { total_errors: 0, total_warnings: 0, tools_ok: 0, tools_skipped: 1, tools_failed: 0 },
      tools: {
        ruff: { status: 'skipped', errors: 0, warnings: 0, findings: [] },
      },
    };
    const output = formatLintReportForReviewer(report);
    assert.ok(!output.includes('ruff'), 'skipped tools should not appear');
  });

  it('renders tool errors with ❌', () => {
    const report = {
      tier: 'pre-check',
      timestamp: '2026-01-01T00:00:00Z',
      changed_files: [],
      summary: { total_errors: 0, total_warnings: 0, tools_ok: 0, tools_skipped: 0, tools_failed: 1 },
      tools: {
        shellcheck: { status: 'error', error: 'shellcheck not found', errors: 0, warnings: 0, findings: [] },
      },
    };
    const output = formatLintReportForReviewer(report);
    assert.ok(output.includes('❌ shellcheck — TOOL ERROR'), 'tool error should render with ❌');
    assert.ok(output.includes('shellcheck not found'), 'should include error message');
  });

  it('truncates findings at 30 per tool', () => {
    const findings = Array.from({ length: 35 }, (_, i) => ({
      file: `src/file${i}.ts`, line: i, severity: 'warning', message: `Warning ${i}`,
    }));
    const report = {
      tier: 'buster',
      timestamp: '2026-01-01T00:00:00Z',
      changed_files: [],
      summary: { total_errors: 0, total_warnings: 35, tools_ok: 0, tools_skipped: 0, tools_failed: 0 },
      tools: {
        tsc: { status: 'ok', errors: 0, warnings: 35, findings },
      },
    };
    const output = formatLintReportForReviewer(report);
    assert.ok(output.includes('and 5 more findings'), 'should note truncated findings');
  });

  it('lists changed files when present', () => {
    const report = {
      tier: 'pre-check',
      timestamp: '2026-01-01T00:00:00Z',
      changed_files: ['src/foo.ts', 'src/bar.ts'],
      summary: { total_errors: 0, total_warnings: 0, tools_ok: 1, tools_skipped: 0, tools_failed: 0 },
      tools: {},
    };
    const output = formatLintReportForReviewer(report);
    assert.ok(output.includes('src/foo.ts'), 'should list changed files');
    assert.ok(output.includes('src/bar.ts'), 'should list changed files');
  });
});

// ─── runPreCheck ─────────────────────────────────────────────────────────────

describe('runPreCheck()', () => {
  it('returns passed:true when pre_check is disabled in config', async () => {
    const config = { pre_check: { enabled: false } };
    const status = { fail_count: 0, forge_diff_stat: null };
    const result = await runPreCheck(config, 'some-module', status, 'some-module');
    assert.equal(result.passed, true);
    assert.equal(result.report, null);
  });

  it('returns passed:true (skipped) when lint-report.js is not found', async () => {
    const config = {
      repo_root: '/tmp',
      project: 'test',
      pre_check: { lint_report_path: '/app/nonexistent/lint-report.js', timeout_seconds: 5 },
    };
    const status = { fail_count: 0, forge_diff_stat: null };
    const result = await runPreCheck(config, 'some-module', status, 'some-module');
    // No lint-report.js → generateLintReport returns null → passed:true (skip, not fail)
    assert.equal(result.passed, true);
    assert.ok(result.error.includes('not found'));
  });
});

// ─── checkDependencies ───────────────────────────────────────────────────────

describe('checkDependencies()', () => {
  it('returns met:true when there are no dependencies', () => {
    const config = { paths: { modules_dir: '/tmp', swarm_dir: '/tmp' } };
    const progress = {
      modules: { 'module-01': { dir: '01-foo', title: 'Foo', depends_on: [] } },
      gates: {},
    };
    const result = checkDependencies(config, progress, 'module-01');
    assert.equal(result.met, true);
  });

  it('returns met:false when the module is not found', () => {
    const config = { paths: { modules_dir: '/tmp', swarm_dir: '/tmp' } };
    const progress = { modules: {}, gates: {} };
    const result = checkDependencies(config, progress, 'nonexistent');
    assert.equal(result.met, false);
    assert.ok(result.reason.includes('not found'));
  });

  it('returns met:false when a module dependency is not defined', () => {
    const config = { paths: { modules_dir: '/tmp', swarm_dir: '/tmp' } };
    const progress = {
      modules: { 'module-02': { dir: '02-bar', title: 'Bar', depends_on: ['module-01'] } },
      gates: {},
    };
    const result = checkDependencies(config, progress, 'module-02');
    assert.equal(result.met, false);
    assert.ok(result.reason.includes("'module-01' not defined"));
  });

  it('returns met:false when a dependent module has not passed', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dep-test-'));
    const modDir = path.join(tmp, '01-foo');
    fs.mkdirSync(modDir);
    // Write a status.json that is IN_PROGRESS (not PASS)
    fs.writeFileSync(path.join(modDir, 'status.json'), JSON.stringify({ status: 'IN_PROGRESS' }));

    const config = {
      paths: { modules_dir: tmp, swarm_dir: tmp },
    };
    const progress = {
      modules: {
        'module-01': { dir: '01-foo', title: 'Foo', depends_on: [] },
        'module-02': { dir: '02-bar', title: 'Bar', depends_on: ['module-01'] },
      },
      gates: {},
    };
    const result = checkDependencies(config, progress, 'module-02');
    assert.equal(result.met, false);
    assert.ok(result.reason.includes('IN_PROGRESS'));

    fs.rmSync(tmp, { recursive: true });
  });

  it('returns met:true when all module dependencies have passed', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dep-test-'));
    const modDir = path.join(tmp, '01-foo');
    fs.mkdirSync(modDir);
    fs.writeFileSync(path.join(modDir, 'status.json'), JSON.stringify({ status: 'PASS' }));

    const config = {
      paths: { modules_dir: tmp, swarm_dir: tmp },
    };
    const progress = {
      modules: {
        'module-01': { dir: '01-foo', title: 'Foo', depends_on: [] },
        'module-02': { dir: '02-bar', title: 'Bar', depends_on: ['module-01'] },
      },
      gates: {},
    };
    const result = checkDependencies(config, progress, 'module-02');
    assert.equal(result.met, true);

    fs.rmSync(tmp, { recursive: true });
  });

  it('returns met:false when a gate dependency output file is not found', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dep-test-'));
    const config = { paths: { modules_dir: tmp, swarm_dir: tmp } };
    const progress = {
      modules: {
        'module-02': { dir: '02-bar', title: 'Bar', depends_on: ['gate:review-gate'] },
      },
      gates: {
        'review-gate': { output_file: 'review-output.json' },
      },
    };
    const result = checkDependencies(config, progress, 'module-02');
    assert.equal(result.met, false);
    assert.ok(result.reason.includes("'review-gate' not completed"));

    fs.rmSync(tmp, { recursive: true });
  });
});

afterEach(() => {
  clearActiveContext();
});

const TEST_WORKSPACE_ROOT = '/home/node/.openclaw/workspace/pipeline-test-artifacts';
const SUPPORT_ROOT = path.join(TEST_WORKSPACE_ROOT, 'support');
const FAKE_REDIS_MODULE_PATH = path.join(SUPPORT_ROOT, 'fake-redis.mjs');

function mkdirp(p) {
  fs.mkdirSync(p, { recursive: true });
}

function writeJson(filePath, value) {
  mkdirp(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n');
}

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function ensureFakeRedisModule() {
  mkdirp(SUPPORT_ROOT);
  fs.writeFileSync(FAKE_REDIS_MODULE_PATH, `
import fs from 'fs';
import path from 'path';

function readState() {
  const statePath = process.env.FAKE_REDIS_STATE_PATH;
  if (!statePath) return {};
  try {
    return JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch {
    return {};
  }
}

function writeState(state) {
  const statePath = process.env.FAKE_REDIS_STATE_PATH;
  if (!statePath) return;
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\\n');
}

const api = {
  setLogCallback() {},
  async sendTask(agentType, taskType, payload) {
    const state = readState();
    state.events = state.events || [];
    const statusPath = payload.status_json_path
      ? path.join(payload.session.cwd, payload.status_json_path)
      : null;
    let validation = null;
    if (statusPath && fs.existsSync(statusPath)) {
      validation = JSON.parse(fs.readFileSync(statusPath, 'utf8')).validation || null;
    }
    state.events.push({
      type: 'sendTask',
      agentType,
      taskType,
      module: payload.module,
      run_id: payload.run_id || null,
      attempt: payload.attempt || null,
      validation,
    });
    state.completion = {
      status: 'PASS',
      source: 'agent',
      summary: 'fake buster pass',
      commit_hash: payload.commit_hash || null,
    };
    writeState(state);
    return { ok: true, accepted: true };
  },
  async readCompletion(stream, moduleId) {
    const state = readState();
    state.events = state.events || [];
    state.events.push({ type: 'readCompletion', stream, moduleId });
    writeState(state);
    return state.completion || null;
  },
  async archiveCompletions(stream, archiveStream, moduleId) {
    const state = readState();
    state.events = state.events || [];
    state.events.push({ type: 'archiveCompletions', stream, archiveStream, moduleId });
    writeState(state);
    return { archived: 0 };
  },
  async disconnect() {},
};

export default api;
`, 'utf8');
  return FAKE_REDIS_MODULE_PATH;
}

function createLintScript(baseDir, statePath) {
  const scriptPath = path.join(baseDir, 'fake-lint-report.mjs');
  fs.writeFileSync(scriptPath, `
import fs from 'fs';
import path from 'path';
const args = process.argv.slice(2);
const getArg = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
};
const outputPath = getArg('--output');
const tier = getArg('--tier') || 'pre-check';
const changedFiles = (getArg('--changed-files') || '').split(',').filter(Boolean);
const statePath = ${JSON.stringify(statePath)};
let state = {};
try { state = JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch {}
state.events = state.events || [];
state.events.push({ type: 'lint', tier, changedFiles });
fs.mkdirSync(path.dirname(statePath), { recursive: true });
fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\\n');
const report = {
  tier,
  timestamp: new Date().toISOString(),
  changed_files: changedFiles,
  summary: { total_errors: 0, total_warnings: 0, tools_ok: 1, tools_skipped: 0, tools_failed: 0 },
  tools: {
    fake: { status: 'ok', errors: 0, warnings: 0, findings: [] }
  }
};
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\\n');
`, 'utf8');
  return scriptPath;
}

function createRunModuleFixture(testName) {
  mkdirp(TEST_WORKSPACE_ROOT);
  ensureFakeRedisModule();
  const baseDir = fs.mkdtempSync(path.join(TEST_WORKSPACE_ROOT, `${testName}-`));
  const remoteDir = path.join(baseDir, 'remote.git');
  const repoRoot = path.join(baseDir, 'repo');
  const project = 'runner-fixture';
  const swarmDir = path.join(repoRoot, 'Projects', project, 'src', '.swarm');
  const modulesDir = path.join(swarmDir, 'modules');
  const moduleDir = path.join(modulesDir, '01-foundation');
  const statusJsonPath = path.join(moduleDir, 'status.json');
  const redisStatePath = path.join(baseDir, 'redis-state.json');
  const lintStatePath = path.join(baseDir, 'lint-state.json');
  const lintScriptPath = createLintScript(baseDir, lintStatePath);

  git(baseDir, ['init', '--bare', remoteDir]);
  git(baseDir, ['init', '--initial-branch=main', repoRoot]);
  git(repoRoot, ['config', 'user.email', 'tests@example.com']);
  git(repoRoot, ['config', 'user.name', 'Pipeline Tests']);
  git(repoRoot, ['remote', 'add', 'origin', remoteDir]);

  mkdirp(moduleDir);
  mkdirp(path.join(repoRoot, 'Projects', project, 'src', 'public'));
  fs.writeFileSync(path.join(moduleDir, 'BUSTER.md'), '# Fake Buster\nRun the fake test harness.\n');
  fs.writeFileSync(path.join(moduleDir, 'FORGE.md'), '# Fake Forge\nDockerfile\n');
  fs.writeFileSync(path.join(repoRoot, 'Projects', project, 'src', 'Dockerfile'), 'FROM scratch\nCOPY public /app/public\n');
  writeJson(statusJsonPath, {
    module_id: 'module-01',
    title: 'Foundation module',
    status: 'READY_FOR_TESTING',
    current_phase: null,
    fail_count: 0,
    fail_summaries: [],
    history: [],
    started_at: new Date().toISOString(),
    completed_at: null,
    cost: { total_duration_seconds: 0 },
    forge_commit: null,
    buster_commit: null,
    forge_commit_hash: null,
    forge_diff_stat: 'Projects/runner-fixture/src/Dockerfile | 1 +',
  });
  writeJson(path.join(swarmDir, 'progress.json'), {
    project,
    execution_order: ['module-01'],
    modules: {
      'module-01': {
        dir: '01-foundation',
        title: 'Foundation module',
        stages: ['forge', 'buster'],
        timeout_minutes: 1,
        max_fails: 2,
        test_config: {
          serve: {
            dockerfile: 'Dockerfile',
            static_path: '/app/public',
          },
        },
      },
    },
    gates: {},
  });
  fs.writeFileSync(path.join(repoRoot, 'README.md'), '# fixture\n');
  git(repoRoot, ['add', '.']);
  git(repoRoot, ['commit', '-m', 'initial fixture']);
  git(repoRoot, ['push', '-u', 'origin', 'main']);

  const config = {
    project,
    repo_root: repoRoot,
    poll_interval_seconds: 0.01,
    default_timeout_minutes: 1,
    default_max_fails: 2,
    paths: {
      swarm_dir: swarmDir,
      modules_dir: modulesDir,
      progress_file: path.join(swarmDir, 'progress.json'),
    },
    agents: {
      forge: { dispatch: 'acp', acp_agent_id: 'forge' },
      buster: { dispatch: 'redis', redis_js_path: FAKE_REDIS_MODULE_PATH },
    },
    pre_check: {
      enabled: true,
      lint_report_path: lintScriptPath,
      timeout_seconds: 5,
    },
    models: {
      buster: 'openai-codex/gpt-5.4',
    },
  };
  const progress = JSON.parse(fs.readFileSync(config.paths.progress_file, 'utf8'));
  process.env.FAKE_REDIS_STATE_PATH = redisStatePath;
  const ctx = createPipelineContext({ config, progress, runId: 'run-test-module-flow' });
  setActiveContext(ctx);
  initLogDir(config, ctx);

  return {
    baseDir,
    config,
    progress,
    lintStatePath,
    redisStatePath,
  };
}

describe('runModule() — orchestration flow', () => {
  it('reruns persisted post-Forge validation on resume before dispatching Buster', async () => {
    const fixture = createRunModuleFixture('module-runner');

    const result = await runModule(fixture.config, fixture.progress, 'module-01');
    assert.equal(result.exit, 0);

    const status = loadStatus(fixture.config, '01-foundation');
    assert.equal(status.status, 'PASS');
    assert.equal(status.validation.attempt, 1);
    assert.equal(status.validation.delivery_lint_passed, true);
    assert.equal(status.validation.pre_check_passed, true);

    const lintState = JSON.parse(fs.readFileSync(fixture.lintStatePath, 'utf8'));
    const redisState = JSON.parse(fs.readFileSync(fixture.redisStatePath, 'utf8'));
    assert.equal(lintState.events.filter(e => e.type === 'lint').length, 1, 'pre-check should rerun on resume from READY_FOR_TESTING');

    const eventTypes = redisState.events.map(e => e.type);
    assert.deepEqual(eventTypes.slice(0, 3), ['archiveCompletions', 'sendTask', 'readCompletion']);
    const dispatch = redisState.events.find(e => e.type === 'sendTask');
    assert.equal(dispatch.run_id, 'run-test-module-flow');
    assert.equal(dispatch.validation.delivery_lint_passed, true);
    assert.equal(dispatch.validation.pre_check_passed, true);
    assert.equal(dispatch.attempt, 1);
  });
});
