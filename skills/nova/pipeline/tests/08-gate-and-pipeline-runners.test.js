import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { EXIT_ERROR, EXIT_NEEDS_NOVA, EXIT_OK } from '../core/constants.js';
import { createRunStats } from '../core/runtime.js';
import { gateStatusPath } from '../core/paths.js';
import { runGate } from '../runners/gate-runner.js';
import { runBusterGate } from '../runners/buster-gate-runner.js';
import { runReviewGate } from '../runners/review-gate-runner.js';
import { runPipeline } from '../runners/pipeline-runner.js';

function createHarness() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-pipeline-'));
  const repoRoot = path.join(tmp, 'repo');
  const swarmDir = path.join(repoRoot, '.swarm');
  fs.mkdirSync(swarmDir, { recursive: true });
  return {
    tmp,
    config: {
      project: 'governance-test',
      repo_root: repoRoot,
      default_timeout_minutes: 1,
      default_max_fails: 2,
      rate_limit: { max_pauses_per_module: 1, cooldown_hours: 0 },
      review_defaults: { reviewers: [{ label: 'echo-1', model: 'openai-codex/gpt-5.4' }], max_fix_cycles: 1, timeout_minutes: 1 },
      paths: {
        swarm_dir: swarmDir,
        modules_dir: path.join(swarmDir, 'modules'),
        progress_file: path.join(swarmDir, 'progress.json'),
      },
      agents: { forge: {}, buster: {}, review: {} },
      models: { buster: 'openai-codex/gpt-5.4', echo: 'openai-codex/gpt-5.4' },
      _runId: 'run-gate-tests',
      _runStats: createRunStats(),
    },
  };
}

function cleanupHarness(harness) {
  fs.rmSync(harness.tmp, { recursive: true, force: true });
}

describe('runGate()', () => {
  it('dispatches through the gate strategy map', async () => {
    const harness = createHarness();
    try {
      const progress = {
        execution_order: ['gate:custom-gate'],
        modules: {},
        gates: {
          'custom-gate': { type: 'custom', title: 'Custom Gate' },
        },
      };
      harness.config._testOverrides = {
        gateRunner: {
          runners: {
            custom: async () => ({ exit: EXIT_OK, dispatched: true }),
          },
        },
      };

      const result = await runGate(harness.config, progress, 'custom-gate');
      assert.equal(result.exit, EXIT_OK);
      assert.equal(result.dispatched, true);
    } finally {
      cleanupHarness(harness);
    }
  });

  it('returns EXIT_ERROR for unknown gate types', async () => {
    const harness = createHarness();
    try {
      const progress = {
        execution_order: ['gate:missing-runner'],
        modules: {},
        gates: {
          'missing-runner': { type: 'does-not-exist', title: 'Missing Runner' },
        },
      };

      const result = await runGate(harness.config, progress, 'missing-runner');
      assert.equal(result.exit, EXIT_ERROR);
      assert.match(result.reason, /Unknown gate type/);
    } finally {
      cleanupHarness(harness);
    }
  });
});

describe('runBusterGate()', () => {
  it('retests after a fix cycle and persists PASS state', async () => {
    const harness = createHarness();
    const commits = [];
    const attempts = [];
    try {
      const progress = {
        execution_order: ['gate:quality-gate'],
        modules: {},
        gates: {
          'quality-gate': {
            type: 'buster',
            title: 'Quality Gate',
            on_fail: 'fix_and_retest',
            max_fix_cycles: 2,
            timeout_minutes: 1,
            output_file: 'quality-gate.json',
          },
        },
      };

      harness.config._testOverrides = {
        busterGate: {
          readGateInstructions: () => 'gate instructions',
          resolveModel: (_config, _progress, phase) => `${phase}-model`,
          discord: async () => {},
          runOnce: async (_deps, _config, _progress, _gateId, _gate, _model, _timeout, _instructions, attempt) => {
            attempts.push(attempt);
            if (attempt === 1) {
              return { ok: false, status: { issues: [{ title: 'Broken contract', severity: 'critical' }] } };
            }
            return { ok: true, status: { _source: 'redis' } };
          },
          buildGateFixPrompt: () => ({ prompt: 'fix prompt' }),
          spawnAgent: async () => {},
          verifyAgentAlive: async () => true,
          pollForSessionEnd: async () => ({ hasChanges: true, completed: true }),
          getTrackedAgent: () => null,
          killAgent: async () => {},
          gitCommitAndPush: async (_config, message) => { commits.push(message); },
          archiveGateOutputIfPresent: () => null,
        },
      };

      const result = await runBusterGate(harness.config, progress, 'quality-gate');
      const persisted = JSON.parse(fs.readFileSync(gateStatusPath(harness.config, 'quality-gate'), 'utf8'));

      assert.equal(result.exit, EXIT_OK);
      assert.deepEqual(attempts, [1, 2]);
      assert.equal(persisted.status, 'PASS');
      assert.equal(persisted.fix_cycles, 1);
      assert.ok(commits.some(msg => msg.includes('Gate fix: quality-gate attempt 1')));
      assert.ok(commits.some(msg => msg.includes("Gate 'quality-gate' PASS (persisted)")));
    } finally {
      cleanupHarness(harness);
    }
  });
});

describe('runReviewGate()', () => {
  it('runs a fix-and-rereview loop to GO', async () => {
    const harness = createHarness();
    const commits = [];
    const attempts = [];
    try {
      const progress = {
        execution_order: ['gate:architecture-review'],
        modules: {},
        gates: {
          'architecture-review': {
            type: 'review',
            title: 'Architecture Review',
            review_name: 'architecture',
            reviewers: [{ label: 'echo-1', model: 'openai-codex/gpt-5.4' }],
            max_fix_cycles: 1,
            timeout_minutes: 1,
          },
        },
      };

      harness.config._testOverrides = {
        reviewGate: {
          generateLintReport: () => ({ report: null, error: null }),
          formatLintReportForReviewer: () => 'lint ok',
          readGateInstructions: () => 'review instructions',
          discord: async () => {},
          runOnce: async (_deps, _config, _progress, _gateId, _gate, _reviewConfig, attempt = 1) => {
            attempts.push(attempt);
            if (attempt === 1) {
              return {
                ok: false,
                mergedResult: {
                  critical_issues: [
                    {
                      description: 'Missing rollback strategy',
                      location: 'src/deploy.js',
                      recommended_fix: 'Add rollback protection',
                    },
                  ],
                },
              };
            }
            return { ok: true, mergedResult: { critical_issues: [] } };
          },
          resolveModel: (_config, _progress, phase) => `${phase}-model`,
          spawnAgent: async () => {},
          verifyAgentAlive: async () => true,
          pollForSessionEnd: async () => ({ hasChanges: true, completed: true }),
          killAgent: async () => {},
          getTrackedAgent: () => null,
          gitCommitAndPush: async (_config, message) => { commits.push(message); },
        },
      };

      const result = await runReviewGate(harness.config, progress, 'architecture-review');
      assert.equal(result.exit, EXIT_OK);
      assert.deepEqual(attempts, [1, 2]);
      assert.ok(commits.some(msg => msg.includes('Review fix: architecture-review cycle 1')));
    } finally {
      cleanupHarness(harness);
    }
  });
});

describe('runPipeline()', () => {
  it('halts on NEEDS_NOVA and injects Nova exactly once', async () => {
    const harness = createHarness();
    const outputs = [];
    const summaries = [];
    const injections = [];
    try {
      const progress = {
        execution_order: ['module-01'],
        modules: {
          'module-01': { dir: '01-module', title: 'Module 01' },
        },
        gates: {},
      };

      harness.config._testOverrides = {
        pipelineRunner: {
          releaseGateFiles: async () => {},
          syncControlFiles: async () => {},
          loadStatus: () => null,
          discord: async () => {},
          output: (payload) => outputs.push(payload),
          runModule: async () => ({
            exit: EXIT_NEEDS_NOVA,
            reason: 'Forge exhausted retries',
            module: 'module-01',
            fail_count: 2,
            max_fails: 3,
          }),
          injectNeedsNova: async (...args) => { injections.push(args); },
          writeSummary: (...args) => { summaries.push(args); },
          generateProjectSummary: async () => {},
          generatePipelineReview: async () => {},
        },
      };

      const exitCode = await runPipeline(harness.config, progress, { novaChannel: 'channel-1' });
      assert.equal(exitCode, EXIT_NEEDS_NOVA);
      assert.equal(injections.length, 1);
      assert.equal(summaries.length, 1);
      assert.equal(summaries[0][1], EXIT_NEEDS_NOVA);
      assert.equal(outputs[0].exit, EXIT_NEEDS_NOVA);
    } finally {
      cleanupHarness(harness);
    }
  });
});
