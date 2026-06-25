#!/usr/bin/env node
import assert from 'node:assert/strict';
import path from 'node:path';

function parseArgs(argv = process.argv.slice(2)) {
  const args = { sourceRoot: process.cwd() };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--source-root') {
      args.sourceRoot = path.resolve(argv[i + 1]);
      i += 1;
    }
  }
  return args;
}

const { sourceRoot } = parseArgs();
const service = await import(path.join(sourceRoot, 'skills/nova/pipeline/services/agent-observability-forge-completion.ts'));
const polling = await import(path.join(sourceRoot, 'skills/nova/pipeline/services/polling.ts'));
const modulesDir = path.join(sourceRoot, 'Projects/pipeline-smoke-landing/src/.swarm/modules');

function forgeCompletionObservability() {
  return {
    profile: 'test',
    profiles: {
      test: {
        forge_completion: { xread_block_ms: 1, settle_ms: 0 },
      },
    },
  };
}

const identity = {
  run_id: 'run-ao5',
  module_id: '01',
  dispatch_id: 'dispatch-1',
  session_key: 'agent:forge:session-1',
  gateway_label: 'forge-01',
};

const agentEnded = {
  type: 'agent.ended',
  run_id: 'run-ao5',
  project: 'kubeclaw-main',
  agent_type: 'forge',
  agent_scope: 'agent',
  module_id: '01',
  dispatch_id: 'dispatch-1',
  session_key: 'agent:forge:session-1',
  gateway_label: 'forge-01',
  outcome: 'success',
  reason: 'done',
  ended_at: '2026-05-17T18:00:00.000Z',
};

const pathConfig = {
  repo_root: '/repo',
  paths: {
    modules_dir: '/repo/modules',
  },
};

assert.equal(service.matchesForgeAgentEndedTelemetry(agentEnded, identity), true);
assert.equal(service.matchesForgeAgentEndedTelemetry({ ...agentEnded, agent_type: 'buster' }, identity), false);
assert.equal(service.matchesForgeAgentEndedTelemetry({ ...agentEnded, module_id: '02' }, identity), false);
assert.equal(service.matchesForgeAgentEndedTelemetry({ ...agentEnded, session_key: null }, identity), true, 'missing actual optional identity should not reject otherwise matching evidence');

assert.equal(service.isForgeCompletionControlPath('modules/01/forge-completion.json', pathConfig, '01'), true);
assert.equal(service.isForgeCompletionControlPath('modules/01/status.json', pathConfig, '01'), false);
assert.equal(service.isForgeCompletionControlPath('.swarm/logs/session.jsonl', pathConfig, '01'), true);
assert.equal(service.isForgeCompletionControlPath('src/index.js', pathConfig, '01'), false);

const injectedDiff = service.collectMeaningfulForgeDiffEvidence({ project: 'contract-test' }, '01', {
  headBefore: 'abc',
  diffEvidence: {
    paths: ['src/index.js'],
    ignored_paths: ['modules/01/forge-completion.json'],
    head_now: 'def',
  },
});
assert.equal(injectedDiff.ok, true);
assert.equal(injectedDiff.hasMeaningfulChanges, true);
assert.deepEqual(injectedDiff.paths, ['src/index.js']);
assert.deepEqual(injectedDiff.ignoredPaths, ['modules/01/forge-completion.json']);

const readyStatus = service.buildForgeCompletionStatusFromDiff(injectedDiff, agentEnded, { identity });
assert.equal(readyStatus.status, 'READY_FOR_TESTING');
assert.equal(readyStatus.source, service.AGENT_OBSERVABILITY_FORGE_COMPLETION_SOURCE);
assert.equal(readyStatus.session_key, 'agent:forge:session-1');
assert.deepEqual(readyStatus.meaningful_paths, ['src/index.js']);

let readerClosed = false;
const pollResult = await polling.pollForgeCompletion({
  project: 'contract-test',
  repo_root: sourceRoot,
  paths: { modules_dir: modulesDir },
  _runId: 'run-ao5',
  poll_interval_seconds: 0,
  polling: {
    progress_log_interval_ms: 1,
    session_progress_emit_interval_ms: 1,
  },
  telemetry: { enabled: false },
  agent_observability: forgeCompletionObservability(),
}, '01', 1, {
  moduleId: '01',
  runId: 'run-ao5',
  dispatchId: 'dispatch-1',
  sessionKey: 'agent:forge:session-1',
  gatewayLabel: 'forge-01',
  agentEndedReader: {
    async read(readIdentity) {
      assert.equal(readIdentity.module_id, '01');
      assert.equal(readIdentity.dispatch_id, 'dispatch-1');
      return agentEnded;
    },
    close() { readerClosed = true; },
  },
  diffEvidence: injectedDiff,
});
assert.equal(readerClosed, true);
assert.equal(pollResult.ok, true);
assert.equal(pollResult.reason, service.AGENT_OBSERVABILITY_FORGE_READY_REASON);
assert.equal(pollResult.status.status, 'READY_FOR_TESTING');
assert.equal(pollResult.status.source, service.AGENT_OBSERVABILITY_FORGE_COMPLETION_SOURCE);

const noWork = await polling.pollForgeCompletion({
  project: 'contract-test',
  repo_root: sourceRoot,
  paths: { modules_dir: modulesDir },
  _runId: 'run-ao5',
  poll_interval_seconds: 0,
  polling: {
    progress_log_interval_ms: 1,
    session_progress_emit_interval_ms: 1,
  },
  telemetry: { enabled: false },
  agent_observability: forgeCompletionObservability(),
}, '01', 1, {
  moduleId: '01',
  agentEndedReader: { async read() { return agentEnded; }, close() {} },
  diffEvidence: { paths: [], ignored_paths: ['modules/01/forge-completion.json'], hasMeaningfulChanges: false },
});
assert.equal(noWork.ok, false);
assert.equal(noWork.reason, service.AGENT_OBSERVABILITY_FORGE_NO_WORK_REASON);
assert.equal(noWork.status.status, 'FAIL');
assert.deepEqual(noWork.status.ignored_paths, ['modules/01/forge-completion.json']);

console.log(JSON.stringify({ ok: true, checked: 24 }));
