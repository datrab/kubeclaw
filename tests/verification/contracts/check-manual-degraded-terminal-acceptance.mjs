#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  completePipeline,
  processExitCodeForTerminalStatus,
} from '../../../skills/nova/pipeline/runners/pipeline-runner-terminal.ts';
import {
  appendPipelineLifecycleEvent,
} from '../../../skills/nova/pipeline/services/status-store.ts';

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
}

const previousRepoRoot = process.env.REPO_ROOT;
const previousWebhook = process.env.DISCORD_WEBHOOK;
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'manual-degraded-terminal-contract-'));
const repo = path.join(root, 'repo');
const swarmDir = path.join(repo, '.swarm');

try {
  fs.mkdirSync(repo, { recursive: true });
  git(['init'], repo);
  git(['config', 'user.email', 'degraded-terminal@example.test'], repo);
  git(['config', 'user.name', 'Degraded Terminal Contract'], repo);
  fs.writeFileSync(path.join(repo, 'README.md'), '# degraded terminal contract\n');
  git(['add', 'README.md'], repo);
  git(['commit', '-m', 'fixture'], repo);
  process.env.REPO_ROOT = repo;
  process.env.DISCORD_WEBHOOK = '';

  const outputs = [];
  const summaries = [];
  const config = {
    project: 'manual-degraded-terminal-contract',
    repo_root: repo,
    run_id: 'run-degraded-terminal',
    _runId: 'run-degraded-terminal',
    paths: {
      swarm_dir: swarmDir,
    },
    telemetry: {
      enabled: false,
    },
    _startupDegradedEvidence: [{
      code: 'gate_fix_git_persistence_degraded',
      surface: 'git_persistence',
      message: 'Git persistence degraded; manual fallback required',
    }],
  };
  const progress = {
    modules: {},
    gates: {},
    execution_order: [],
  };
  appendPipelineLifecycleEvent(config, 'pipeline_run.started', { progress, opts: { resume: false } });

  const exitCode = await completePipeline(config, progress, {
    deps: {
      pipelineRunner: {
        output(payload) {
          outputs.push(payload);
        },
        writeSummary(_config, terminalStatus, reasonCode) {
          summaries.push({ terminalStatus, reasonCode });
          return { failed: false };
        },
        async injectNeedsNova() {},
        async discord() {},
      },
    },
  });

  assert.equal(exitCode, processExitCodeForTerminalStatus('blocked'));
  assert.equal(outputs.length, 1);
  assert.equal(outputs[0].exit, 1);
  assert.equal(outputs[0].terminal_status, 'blocked');
  assert.equal(outputs[0].terminal_decision.status, 'blocked');
  assert.equal(outputs[0].terminal_decision.action, 'request_handoff');
  assert.equal(outputs[0].terminal_decision.reasonCode, 'degraded_evidence_requires_handoff');
  assert.equal(outputs[0].degraded_evidence_count, 1);
  assert.equal(outputs[0].degraded_evidence[0].code, 'gate_fix_git_persistence_degraded');
  assert.notEqual(outputs[0].status, 'PIPELINE_COMPLETE');
  assert.equal(summaries.at(-1).terminalStatus, 'blocked');
  assert.equal(summaries.at(-1).reasonCode, 'degraded_evidence_requires_handoff');

  const lifecyclePath = path.join(swarmDir, 'logs', 'pipeline', 'runs', config.run_id, 'lifecycle', 'canonical-events.jsonl');
  const lifecycle = fs.readFileSync(lifecyclePath, 'utf8');
  assert.match(lifecycle, /pipeline_run\.halted/);
  assert.doesNotMatch(lifecycle, /pipeline_run\.completed/);

  console.log(JSON.stringify({
    ok: true,
    contract: 'manual-degraded-terminal',
    run_id: config.run_id,
    terminal_status: outputs[0].terminal_status,
    reason_code: outputs[0].terminal_decision.reasonCode,
  }, null, 2));
} finally {
  if (previousRepoRoot === undefined) delete process.env.REPO_ROOT;
  else process.env.REPO_ROOT = previousRepoRoot;
  if (previousWebhook === undefined) delete process.env.DISCORD_WEBHOOK;
  else process.env.DISCORD_WEBHOOK = previousWebhook;
  fs.rmSync(root, { recursive: true, force: true });
}
