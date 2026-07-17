import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildBusterAgentJudgmentPolicy,
  buildBusterPayload,
  buildBusterTestConfig,
  computeFilesChanged,
  spawnAcpAgent,
} from '../../../../../skills/nova/pipeline/agents/orchestration.ts';
import { expandSwarmConfig } from '../../../../../skills/nova/pipeline/core/platform-config.ts';

function git(cwd, args) {
  return execFileSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
    },
  });
}

function initRepo(cwd) {
  execFileSync('git', ['init', cwd], { stdio: 'ignore' });
  fs.writeFileSync(path.join(cwd, 'tracked.txt'), 'initial\n');
  git(cwd, ['add', 'tracked.txt']);
  git(cwd, ['commit', '-m', 'initial']);
}

test('computeFilesChanged uses the cwd captured with the baseline', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orchestration-cwd-'));
  const repoRoot = path.join(root, 'repo-root');
  const agentCwd = path.join(root, 'agent-cwd');

  try {
    fs.mkdirSync(repoRoot);
    fs.mkdirSync(agentCwd);
    initRepo(repoRoot);
    initRepo(agentCwd);

    fs.writeFileSync(path.join(repoRoot, 'repo-only.txt'), 'changed outside agent cwd\n');

    const result = computeFilesChanged({
      gatewayLabel: 'agent-cwd-test',
      _baselineCwd: agentCwd,
      _baselineFiles: new Set(),
    }, {
      repo_root: repoRoot,
    });

    assert.deepEqual(result, { filesChanged: null, baselineTracked: true });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('computeFilesChanged suppresses telemetry when baseline cwd is missing', () => {
  const result = computeFilesChanged({
    gatewayLabel: 'legacy-baseline-test',
    _baselineFiles: new Set(),
  }, {
    repo_root: process.cwd(),
  });

  assert.deepEqual(result, { filesChanged: null, baselineTracked: false });
});

test('buildBusterTestConfig isolates standard PORT-based serve commands per dispatch', () => {
  const result = buildBusterTestConfig({
    test_config: {
      serve: {
        port: 43101,
        start_cmd: 'PORT=43101 npm start',
        health_path: '/health',
      },
    },
  }, {
    run_id: 'run-test',
    buster: { runtime: { suite_timeout_ms: 120000, max_crash_retries: 1 } },
  }, {
    config: { run_id: 'run-test' },
    targetId: '01-foundation',
    attempt: 2,
    dispatchId: 'buster-module-01-foundation-test',
  });

  assert.equal(result.suite_timeout_ms, 120000);
  assert.notEqual(result.serve.port, 43101);
  assert.match(result.serve.start_cmd, /^PORT=\d+ npm start$/);
  assert.equal(result.serve.start_cmd.includes('43101'), false);
  assert.equal(result.serve.configured_port, 43101);
  assert.equal(result.serve.port_source, 'pipeline_isolated_per_dispatch');
});

test('buildBusterTestConfig leaves non-standard serve commands unchanged', () => {
  const result = buildBusterTestConfig({
    test_config: {
      serve: {
        port: 43101,
        start_cmd: 'npm start -- --port 43101',
      },
    },
  }, {
    run_id: 'run-test',
    buster: { runtime: { suite_timeout_ms: 120000, max_crash_retries: 1 } },
  }, {
    config: { run_id: 'run-test' },
    targetId: '01-foundation',
    attempt: 1,
    dispatchId: 'buster-module-01-foundation-test',
  });

  assert.equal(result.serve.port, 43101);
  assert.equal(result.serve.start_cmd, 'npm start -- --port 43101');
  assert.equal(result.serve.configured_port, undefined);
});

test('buildBusterAgentJudgmentPolicy emits the canonical deterministic default', () => {
  assert.deepEqual(buildBusterAgentJudgmentPolicy({}), {
    required: false,
    reason: 'deterministic_suites_authoritative',
  });
});

test('buildBusterAgentJudgmentPolicy preserves explicit required agent judgment', () => {
  assert.deepEqual(buildBusterAgentJudgmentPolicy({
    agent_judgment: {
      required: true,
      reason: 'exploratory_accessibility_review_required',
    },
  }), {
    required: true,
    reason: 'exploratory_accessibility_review_required',
  });
});

test('buildBusterPayload carries pipeline Discord webhook authority for module and gate tasks', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buster-payload-discord-'));
  try {
    const config = {
      project: 'payload-discord-test',
      repo_root: root,
      run_id: 'run-payload-discord-test',
      discord_webhook_url: 'https://discord.example/webhook?wait=true',
      paths: {
        swarm_dir: path.join(root, '.swarm'),
        modules_dir: path.join(root, '.swarm', 'modules'),
      },
      buster: { runtime: { suite_timeout_ms: 120000, max_crash_retries: 1 } },
      rate_limit: { cooldown_hours: 1, max_pauses_per_module: 1 },
      pipeline_defaults: {
        timeout_minutes: 5,
        max_fails: 2,
        auto_retry_threshold: 1,
        agent_startup_retry_budget: 0,
        session_nudge_threshold: 0,
      },
      acp_monitor: {
        poll_limit: 10,
        max_transcript_extensions: 3,
        transcript_grace_ms: 300000,
        monitor_poll_ms: 10000,
      },
    };
    const progress = {
      modules: {
        '01-nginx': {
          dir: '01-nginx',
          timeout_minutes: 5,
          test_suites: ['unit'],
          test_config: { suite_timeout_ms: 120000, unit: { test_cmd: 'npm test' } },
        },
      },
      gates: {
        'final-buster': {
          id: 'final-buster',
          title: 'Final Buster',
          timeout_minutes: 5,
          test_suites: ['unit'],
          test_config: { suite_timeout_ms: 120000, unit: { test_cmd: 'npm test' } },
        },
      },
    };

    const modulePayload = buildBusterPayload(config, progress, '01-nginx', 'module_test', 'prompt', { forge_commit_hash: 'abc123' }, {
      attempt: 1,
      dispatch_id: 'buster-module-01-nginx-test',
      model: 'gpt-5',
    });
    const gatePayload = buildBusterPayload(config, progress, 'final-buster', 'gate_test', 'prompt', null, {
      commit_hash: 'abc123',
      attempt: 1,
      dispatch_id: 'buster-gate-final-buster-test',
      model: 'gpt-5',
    });

    assert.equal(modulePayload.discord_webhook_url, config.discord_webhook_url);
    assert.equal(gatePayload.discord_webhook_url, config.discord_webhook_url);
    assert.equal(modulePayload.session_key, 'buster-module-01-nginx-test');
    assert.equal(gatePayload.session_key, 'buster-gate-final-buster-test');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('buildBusterPayload rounds tiny positive timeout minutes up to valid task timeout seconds', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buster-payload-timeout-'));
  try {
    const config = {
      project: 'payload-timeout-test',
      repo_root: root,
      run_id: 'run-payload-timeout-test',
      paths: {
        swarm_dir: path.join(root, '.swarm'),
        modules_dir: path.join(root, '.swarm', 'modules'),
      },
      buster: { runtime: { suite_timeout_ms: 120000, max_crash_retries: 1 } },
      rate_limit: { cooldown_hours: 1, max_pauses_per_module: 1 },
      pipeline_defaults: {
        timeout_minutes: 5,
        max_fails: 2,
        auto_retry_threshold: 1,
        agent_startup_retry_budget: 0,
        session_nudge_threshold: 0,
      },
      acp_monitor: {
        poll_limit: 10,
        max_transcript_extensions: 3,
        transcript_grace_ms: 300000,
        monitor_poll_ms: 10000,
      },
    };
    const progress = {
      modules: {
        '01-nginx': {
          dir: '01-nginx',
          timeout_minutes: 0.001,
          test_suites: ['unit'],
          test_config: { suite_timeout_ms: 120000, unit: { test_cmd: 'npm test' } },
        },
      },
      gates: {
        'final-buster': {
          id: 'final-buster',
          title: 'Final Buster',
          timeout_minutes: 0.001,
          test_suites: ['unit'],
          test_config: { suite_timeout_ms: 120000, unit: { test_cmd: 'npm test' } },
        },
      },
    };

    const modulePayload = buildBusterPayload(config, progress, '01-nginx', 'module_test', 'prompt', { forge_commit_hash: 'abc123' }, {
      attempt: 1,
      dispatch_id: 'buster-module-01-nginx-test',
      model: 'gpt-5',
    });
    const gatePayload = buildBusterPayload(config, progress, 'final-buster', 'gate_test', 'prompt', null, {
      commit_hash: 'abc123',
      attempt: 1,
      dispatch_id: 'buster-gate-final-buster-test',
      model: 'gpt-5',
    });

    assert.equal(modulePayload.timeout_seconds, 1);
    assert.equal(modulePayload.session.timeout_seconds, 1);
    assert.equal(gatePayload.timeout_seconds, 1);
    assert.equal(gatePayload.session.timeout_seconds, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('spawnAcpAgent uses configured acp_agent_id before model harness mapping', async (t) => {
  const configPath = path.join(process.cwd(), 'charts', 'kubeclaw', 'files', 'config', 'swarm.config.json');
  const config = expandSwarmConfig(JSON.parse(fs.readFileSync(configPath, 'utf8')));
  const oldFetch = globalThis.fetch;
  const oldGatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  const oldGatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN;
  const bodies = [];

  config.project = 'spawn-agent-authority-test';
  config.repo_root = process.cwd();
  config.run_id = 'run-spawn-agent-authority-test';
  config._runId = config.run_id;
  config.paths = {
    ...config.paths,
    swarm_dir: path.join(process.cwd(), '.swarm'),
  };
  config._disable_discord_webhooks = true;
  config.agents.forge.dispatch = 'acp';
  config.agents.forge.acp_agent_id = 'real-e2e-missing-forge-agent';
  config.agents.forge.cwd = process.cwd();
  config.gateway.invoke.retry.max_attempts = 1;

  process.env.OPENCLAW_GATEWAY_URL = 'http://gateway.test';
  process.env.OPENCLAW_GATEWAY_TOKEN = 'token';
  globalThis.fetch = async (_url, init) => {
    bodies.push(JSON.parse(init.body));
    return new Response('bad request', { status: 400, statusText: 'Bad Request' });
  };
  t.after(() => {
    globalThis.fetch = oldFetch;
    if (oldGatewayUrl === undefined) delete process.env.OPENCLAW_GATEWAY_URL;
    else process.env.OPENCLAW_GATEWAY_URL = oldGatewayUrl;
    if (oldGatewayToken === undefined) delete process.env.OPENCLAW_GATEWAY_TOKEN;
    else process.env.OPENCLAW_GATEWAY_TOKEN = oldGatewayToken;
  });

  await assert.rejects(
    () => spawnAcpAgent(config, 'forge', '01-nginx', 'gpt-5.4/low', 'prompt', {
      agentObservabilityStartupTimeoutMs: 1,
    }),
    /real-e2e-missing-forge-agent|Gateway session spawn contract invalid/,
  );

  assert.equal(bodies[0]?.args?.agentId, 'real-e2e-missing-forge-agent');
});
