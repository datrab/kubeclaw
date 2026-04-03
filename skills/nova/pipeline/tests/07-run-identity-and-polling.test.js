import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { execFileSync, spawnSync } from 'child_process';

import { createPipelineContext } from '../core/context.js';
import { setActiveContext, clearActiveContext, log } from '../core/logger.js';
import { initLogDir } from '../services/status-store.js';
import { writeSummary, writePipelineReviewInstructions } from '../services/summary.js';
import { buildNovaEscalation } from '../services/failures.js';
import { buildBusterPayload } from '../agents/lifecycle.js';
import { gitPullForPolling } from '../integrations/git.js';
import { pollGeneric } from '../services/polling.js';
import { trackAgent, untrackAgent } from '../agents/shutdown.js';

const TEST_ROOT = '/home/node/.openclaw/workspace/pipeline-test-artifacts';
const SUPPORT_ROOT = path.join(TEST_ROOT, 'support');
const FAKE_REDIS_MODULE_PATH = path.join(SUPPORT_ROOT, 'fake-redis.mjs');

function mkdirp(p) {
  fs.mkdirSync(p, { recursive: true });
}

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function ensureFakeRedisModule() {
  mkdirp(SUPPORT_ROOT);
  if (!fs.existsSync(FAKE_REDIS_MODULE_PATH)) {
    fs.writeFileSync(FAKE_REDIS_MODULE_PATH, 'export default { setLogCallback() {}, async sendTask() { return { ok: true }; }, async readCompletion() { return null; }, async archiveCompletions() { return { archived: 0 }; }, async disconnect() {} };\n');
  }
  return FAKE_REDIS_MODULE_PATH;
}

function createRepoFixture(name) {
  mkdirp(TEST_ROOT);
  ensureFakeRedisModule();
  const baseDir = fs.mkdtempSync(path.join(TEST_ROOT, `${name}-`));
  const remoteDir = path.join(baseDir, 'remote.git');
  const repoRoot = path.join(baseDir, 'repo');
  const project = 'run-id';
  const swarmDir = path.join(repoRoot, 'Projects', project, 'src', '.swarm');
  const modulesDir = path.join(swarmDir, 'modules');
  const moduleDir = path.join(modulesDir, '01-foundation');

  git(baseDir, ['init', '--bare', remoteDir]);
  git(baseDir, ['init', '--initial-branch=main', repoRoot]);
  git(repoRoot, ['config', 'user.email', 'tests@example.com']);
  git(repoRoot, ['config', 'user.name', 'Pipeline Tests']);
  git(repoRoot, ['remote', 'add', 'origin', remoteDir]);

  mkdirp(moduleDir);
  fs.writeFileSync(path.join(moduleDir, 'BUSTER.md'), '# Buster\n');
  fs.writeFileSync(path.join(repoRoot, 'README.md'), '# fixture\n');
  fs.writeFileSync(path.join(repoRoot, 'tracked.txt'), 'base\n');
  fs.writeFileSync(path.join(repoRoot, 'Projects', project, 'src', 'Dockerfile'), 'FROM scratch\n');
  fs.writeFileSync(path.join(moduleDir, 'status.json'), JSON.stringify({
    module_id: 'module-01',
    title: 'Foundation',
    status: 'READY_FOR_TESTING',
    current_phase: null,
    fail_count: 1,
    fail_summaries: [{ attempt: 1, phase: 'forge', summary: 'boom', timestamp: new Date().toISOString() }],
    history: [],
    started_at: new Date().toISOString(),
    completed_at: null,
    cost: { total_duration_seconds: 0 },
    forge_commit_hash: null,
  }, null, 2) + '\n');
  fs.writeFileSync(path.join(swarmDir, 'progress.json'), JSON.stringify({
    project,
    execution_order: ['module-01'],
    modules: {
      'module-01': {
        dir: '01-foundation',
        title: 'Foundation',
        stages: ['forge', 'buster'],
      },
    },
    gates: {},
  }, null, 2) + '\n');

  git(repoRoot, ['add', '.']);
  git(repoRoot, ['commit', '-m', 'initial']);
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
    models: { buster: 'openai-codex/gpt-5.4', echo: 'openai-codex/gpt-5.4' },
  };
  const progress = JSON.parse(fs.readFileSync(config.paths.progress_file, 'utf8'));
  const ctx = createPipelineContext({ config, progress, runId: 'run-test-authority' });
  setActiveContext(ctx);
  initLogDir(config, ctx);

  return { baseDir, repoRoot, config, progress, ctx };
}

afterEach(() => {
  clearActiveContext();
  try { untrackAgent('forge-module-01'); } catch {}
});

describe('authoritative run identity', () => {
  it('keeps logs, summaries, review instructions, failure payloads, and buster payloads on one run_id', async () => {
    const fixture = createRepoFixture('run-authority');

    log('ERROR', 'authoritative error');
    writeSummary(fixture.config, 10, 'NEEDS_NOVA');
    const instructionsPath = writePipelineReviewInstructions(fixture.config, {});
    const escalation = buildNovaEscalation(
      fixture.config,
      JSON.parse(fs.readFileSync(path.join(fixture.config.paths.modules_dir, '01-foundation', 'status.json'), 'utf8')),
      'module-01',
      '01-foundation',
      3,
      'forge',
      false,
      1,
    );
    const payload = buildBusterPayload(
      fixture.config,
      fixture.progress,
      'module-01',
      'module_test',
      'run tests',
      { forge_commit_hash: 'abc123', fail_count: 1 },
      { run_id: fixture.config._runId, attempt: 2, model: 'openai-codex/gpt-5.4' },
    );

    await new Promise(resolve => fixture.ctx._pipelineLogFd.end(resolve));

    const summary = JSON.parse(fs.readFileSync(path.join(fixture.config._logDir, 'pipeline', 'summary.json'), 'utf8'));
    const logEntry = JSON.parse(fs.readFileSync(path.join(fixture.config._logDir, 'pipeline', 'pipeline.jsonl'), 'utf8').trim().split('\n').at(-1));
    const instructions = fs.readFileSync(instructionsPath, 'utf8');

    assert.equal(fixture.ctx.runId, 'run-test-authority');
    assert.equal(fixture.config._runId, 'run-test-authority');
    assert.equal(summary.run_id, 'run-test-authority');
    assert.equal(logEntry.run_id, 'run-test-authority');
    assert.equal(escalation.run_id, 'run-test-authority');
    assert.equal(escalation.resume_command, 'node pipeline.js --project run-id --resume --prompt "YOUR_NEW_APPROACH_HERE"');
    assert.doesNotMatch(escalation.resume_command, /--module\b/);
    assert.equal(payload.run_id, 'run-test-authority');
    assert.match(instructions, /"run_id": "run-test-authority"/);
  });

  it('documents full-pipeline resume flow in CLI help', () => {
    const cliPath = '/home/node/.openclaw/workspace/git-repo/Projects/refactoring/src/pipeline/cli.js';
    const help = spawnSync('node', [cliPath, '--help'], { encoding: 'utf8' });
    const output = `${help.stdout || ''}\n${help.stderr || ''}`;

    assert.equal(help.status, 0);
    assert.match(output, /Nova resumes the full pipeline: --resume --prompt/);
    assert.doesNotMatch(output, /--resume --module/);
  });
});

describe('polling git safety', () => {
  it('skips polling pulls when a live local session is tracked', () => {
    const fixture = createRepoFixture('polling-skip');
    const originalHead = git(fixture.repoRoot, ['rev-parse', 'HEAD']);

    const cloneDir = path.join(fixture.baseDir, 'remote-clone');
    git(fixture.baseDir, ['clone', '--branch', 'main', path.join(fixture.baseDir, 'remote.git'), cloneDir]);
    git(cloneDir, ['config', 'user.email', 'tests@example.com']);
    git(cloneDir, ['config', 'user.name', 'Pipeline Tests']);
    fs.writeFileSync(path.join(cloneDir, 'tracked.txt'), 'remote update\n');
    git(cloneDir, ['add', 'tracked.txt']);
    git(cloneDir, ['commit', '-m', 'remote change']);
    git(cloneDir, ['push', 'origin', 'main']);

    trackAgent(fixture.config, 'forge-module-01', 'session-1', 'forge', 'forge-module-01');
    const result = gitPullForPolling(fixture.config);
    const finalHead = git(fixture.repoRoot, ['rev-parse', 'HEAD']);

    assert.equal(result.skipped, true);
    assert.equal(result.reason, 'active_session');
    assert.equal(finalHead, originalHead, 'HEAD must not move while polling pull is skipped for a live session');
  });

  it('fails closed with a structured git_error when the shared worktree is dirty', async () => {
    const fixture = createRepoFixture('polling-fail-closed');
    fs.writeFileSync(path.join(fixture.repoRoot, 'tracked.txt'), 'dirty local change\n');

    const result = await pollGeneric(
      fixture.config,
      async () => ({ done: false, logMsg: 'waiting' }),
      0.01,
      'dirty-worktree',
    );

    assert.equal(result.ok, false);
    assert.equal(result.reason, 'git_error');
    assert.equal(result.status.code, 'POLLING_GIT_UNSAFE');
    assert.equal(result.status.details.reason, 'dirty_worktree');
    assert.match(git(fixture.repoRoot, ['status', '--porcelain']), /tracked\.txt/);
  });
});
