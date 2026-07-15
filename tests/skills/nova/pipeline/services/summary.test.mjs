import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createRunStats } from '../../../../../skills/nova/pipeline/core/runtime.ts';
import { generatePipelineReview, pipelineReviewJsonPath, pipelineReviewOutputPath, writeSummary } from '../../../../../skills/nova/pipeline/services/summary.ts';

test('writeSummary persists terminal decision into summary and latest artifacts', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-summary-'));
  const terminalDecision = {
    schemaVersion: 'v1',
    kind: 'pipeline_terminal_decision',
    status: 'failed',
    action: 'stop',
    reasonCode: 'failed/git_sync_before_buster',
    humanReason: 'Module batch failed',
    scope: 'module',
    correlation: { run_id: 'run-summary', module_id: '03-nginx' },
    source: null,
    metadata: {
      module_results: [
        { module_id: '02-nginx', status: 'PASS' },
        { module_id: '03-nginx', status: 'FAIL', reason: 'failed/git_sync_before_buster' },
      ],
    },
  };
  const config = {
    project: 'summary-test',
    repo_root: root,
    _runId: 'run-summary',
    _runStats: createRunStats('2026-07-10T00:00:00.000Z'),
    paths: {
      swarm_dir: path.join(root, '.swarm'),
    },
  };

  const result = writeSummary(config, 'failed', 'failed/git_sync_before_buster', null, { modules: {}, gates: {} }, terminalDecision);

  assert.equal(result.failed, false);
  const summary = JSON.parse(fs.readFileSync(result.summary_json_path, 'utf8'));
  const latest = JSON.parse(fs.readFileSync(result.latest_json_path, 'utf8'));
  assert.equal(summary.terminal_decision.reasonCode, 'failed/git_sync_before_buster');
  assert.deepEqual(summary.terminal_decision.metadata.module_results, terminalDecision.metadata.module_results);
  assert.equal(summary.pipeline_run_id, 'run-summary');
  assert.equal(summary.modules.total, 0);
  assert.equal(summary.gates.total, 0);
  assert.equal(summary.tests.source, 'run_facts');
  assert.equal(summary.cost.source, 'model_usage');
  assert.equal(latest.terminal_decision.reasonCode, 'failed/git_sync_before_buster');
  assert.equal(latest.terminal_status, 'failed');
  assert.equal(latest.pipeline_run_id, 'run-summary');
  assert.equal(latest.modules.total, 0);
  assert.equal(latest.gates.total, 0);
  assert.equal(latest.tests.source, 'run_facts');
  assert.equal(latest.cost.source, 'model_usage');
});

test('pipeline review retries no-output sessions within explicit attempt budget', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-review-retry-'));
  const config = {
    project: 'pipeline-review-retry-test',
    repo_root: root,
    _runId: 'run-review-retry',
    paths: {
      swarm_dir: path.join(root, '.swarm'),
    },
    pipeline_review: {
      model: 'gpt-5.4',
      agent_id: 'codex',
      timeout_minutes: 1,
      agent_max_attempts: 2,
    },
    review_defaults: {
      timeout_minutes: 1,
      max_fix_cycles: 0,
      lint_tier: 'standard',
      lint_required: true,
    },
    rate_limit: {
      max_pauses_per_module: 1,
      cooldown_hours: 0,
      cooldown_buffer_ms: 0,
    },
    session: {
      spawn: { thread: true, mode: 'child', cleanup: 'manual', stream_to: 'none' },
      kill: {
        acp_confirm_timeout_ms: 25,
        subagent_confirm_timeout_ms: 25,
        confirm_poll_ms: 5,
        cleanup_confirm_timeout_ms: 25,
        acpx_timeout_ms: 25,
        stop_message: 'stop',
      },
      termination: {
        grace_ms: 25,
        max_grace_ms: 25,
        poll_ms: 5,
        gateway_request_max_ms: 25,
        cleanup_confirm_timeout_ms: 25,
        gateway_operation_timeout_ms: 25,
        acpx_timeout_ms: 25,
      },
    },
    gateway: {
      invoke: {
        retry: { max_attempts: 0, retry_delay_ms: 0 },
        session_spawn: { timeout_ms: 25 },
        session_status: { timeout_ms: 25 },
        session_send: { timeout_ms: 25 },
        subagent_kill: { timeout_ms: 25 },
        subagent_list: { timeout_ms: 25 },
        health: { timeout_ms: 25 },
      },
    },
  };

  const spawned = [];
  const terminated = [];
  let polls = 0;
  const result = await generatePipelineReview(config, { pipeline_review: config.pipeline_review }, {
    deps: {
      spawnSession: async ({ session }) => {
        spawned.push(session.label);
        return { childSessionKey: `review-session-${spawned.length}` };
      },
      pollForFile: async (_config, outputPath) => {
        polls += 1;
        if (polls === 1) {
          return {
            ok: false,
            reason: 'session_ended_no_output',
            status: { detail: 'agent ended before writing review', session_key: 'review-session-1' },
          };
        }
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, '# Pipeline Review\n');
        fs.writeFileSync(pipelineReviewJsonPath(config), JSON.stringify({ status: 'REVIEWED' }));
        return { ok: true, status: { session_key: 'review-session-2' } };
      },
      terminateSession: async (sessionKey) => {
        terminated.push(sessionKey);
        return {
          sessionKey,
          requested: true,
          confirmed: true,
          unconfirmed: false,
          terminal: true,
          state: 'stopped',
          cleanupAttempted: false,
          cleanupConfirmed: false,
          cleanupError: null,
          graceMs: 25,
        };
      },
      trackAgent: () => {},
      untrackAgent: () => {},
      discord: async () => {},
      copyTranscriptArtifact: () => {},
      sleep: async () => {},
    },
  });

  assert.equal(result.outputs.status, 'ok');
  assert.equal(polls, 2);
  assert.equal(spawned.length, 2);
  assert.deepEqual(terminated, ['review-session-1', 'review-session-2']);
  assert.equal(fs.existsSync(pipelineReviewOutputPath(config)), true);
});
