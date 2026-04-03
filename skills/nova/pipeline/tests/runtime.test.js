import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  createRunId,
  createRunStats,
  getRunId,
  getRunStats,
  output,
  loadProgress,
} from '../core/runtime.js';
import { createPipelineContext } from '../core/context.js';
import { setActiveContext, clearActiveContext, log } from '../core/logger.js';
import { initLogDir } from '../services/status-store.js';
import { writeSummary, pipelineReviewInstructionsPath, writePipelineReviewInstructions } from '../services/summary.js';
import { injectNeedsNova } from '../services/failures.js';
import { buildBusterPayload } from '../agents/lifecycle.js';

function mkdirp(p) {
  fs.mkdirSync(p, { recursive: true });
}

function createRunContextFixture() {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-runtime-'));
  const project = 'runtime-fixture';
  const swarmDir = path.join(baseDir, 'Projects', project, 'src', '.swarm');
  const modulesDir = path.join(swarmDir, 'modules');
  const moduleDir = path.join(modulesDir, '01-foundation');
  mkdirp(moduleDir);

  const progress = {
    project,
    execution_order: ['module-01'],
    modules: {
      'module-01': {
        dir: '01-foundation',
        title: 'Foundation module',
        stages: ['forge', 'buster'],
        timeout_minutes: 1,
      },
    },
    gates: {},
  };

  const config = {
    project,
    repo_root: baseDir,
    default_timeout_minutes: 1,
    default_max_fails: 2,
    paths: {
      swarm_dir: swarmDir,
      modules_dir: modulesDir,
      progress_file: path.join(swarmDir, 'progress.json'),
    },
    agents: {
      buster: { dispatch: 'redis', redis_js_path: '/tmp/fake-redis.mjs' },
    },
    models: {
      buster: 'openai-codex/gpt-5.4',
      echo: 'openai-codex/gpt-5.4',
    },
  };

  mkdirp(path.dirname(config.paths.progress_file));
  fs.writeFileSync(config.paths.progress_file, JSON.stringify(progress, null, 2) + '\n');

  const ctx = createPipelineContext({ config, progress, runId: 'run-shared-context' });
  setActiveContext(ctx);
  initLogDir(config, ctx);

  return { baseDir, config, progress, ctx };
}

afterEach(() => {
  clearActiveContext();
});

describe('runtime context ownership', () => {
  it('creates run ids in the expected format', () => {
    assert.match(createRunId(), /^run-\d+-[a-z0-9]+$/);
  });

  it('creates mutable run stats with expected defaults', () => {
    const stats = createRunStats('2026-01-01T00:00:00.000Z');
    assert.equal(stats.started_at, '2026-01-01T00:00:00.000Z');
    assert.deepEqual(stats.modules_completed, []);
    assert.equal(stats.total_forge_attempts, 0);
    stats.total_forge_attempts += 1;
    assert.equal(stats.total_forge_attempts, 1);
  });

  it('binds one run_id and stats object across logs, summary, review instructions, payloads, and Nova injections', async () => {
    const { config, progress, ctx } = createRunContextFixture();
    ctx.stats.total_forge_attempts = 2;
    ctx.stats.errors.push({ phase: 'forge', reason: 'none' });

    log('INFO', 'runtime test log entry');
    writeSummary(config, 0, 'PIPELINE_COMPLETE');
    writePipelineReviewInstructions(config);
    await injectNeedsNova(config, {
      exit: 10,
      module: 'module-01',
      reason: 'needs nova',
      fail_count: 1,
      max_fails: 3,
    }, null);

    const payload = buildBusterPayload(
      config,
      progress,
      'module-01',
      'module_test',
      'Run tests',
      { forge_commit_hash: 'abc123' },
      { run_id: config._runId, attempt: 1, model: config.models.buster },
    );

    await new Promise(resolve => ctx._pipelineLogFd.end(resolve));

    const summary = JSON.parse(fs.readFileSync(path.join(config._logDir, 'pipeline', 'summary.json'), 'utf8'));
    const pipelineLog = fs.readFileSync(path.join(config._logDir, 'pipeline', 'pipeline.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line));
    const reviewInstructions = fs.readFileSync(pipelineReviewInstructionsPath(config), 'utf8');
    const injections = fs.readFileSync(path.join(config._logDir, 'pipeline', 'nova-injections.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line));

    const logEntry = pipelineLog.find(entry => entry.msg === 'runtime test log entry');
    assert.equal(config._runId, 'run-shared-context');
    assert.equal(getRunId(config), 'run-shared-context');
    assert.equal(getRunStats(config), ctx.stats);
    assert.equal(summary.run_id, 'run-shared-context');
    assert.equal(summary.total_forge_attempts, 2);
    assert.equal(summary.errors.length, 1);
    assert.equal(logEntry.run_id, 'run-shared-context');
    assert.match(reviewInstructions, /"run_id": "run-shared-context"/);
    assert.equal(injections[0].run_id, 'run-shared-context');
    assert.equal(injections[0].status, 'skipped_no_channel');
    assert.equal(payload.run_id, 'run-shared-context');
  });
});

describe('output()', () => {
  it('writes valid JSON to stdout', () => {
    const captured = [];
    const original = console.log;
    console.log = (msg) => captured.push(msg);
    try {
      output({ status: 'OK', value: 42 });
    } finally {
      console.log = original;
    }
    assert.equal(captured.length, 1);
    assert.deepEqual(JSON.parse(captured[0]), { status: 'OK', value: 42 });
  });
});

describe('loadProgress()', () => {
  it('loads and parses a valid progress.json file', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-test-'));
    const progressPath = path.join(tmp, 'progress.json');
    const data = { modules: [{ name: 'foo', status: 'PASS' }] };
    fs.writeFileSync(progressPath, JSON.stringify(data));
    const result = loadProgress({ paths: { progress_file: progressPath } });
    assert.deepEqual(result, data);
    fs.rmSync(tmp, { recursive: true });
  });

  it('throws when the progress file does not exist', () => {
    assert.throws(
      () => loadProgress({ paths: { progress_file: '/nonexistent/path/progress.json' } }),
      /Progress file not found/,
    );
  });
});
