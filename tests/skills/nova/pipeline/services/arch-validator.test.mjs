import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { buildValidatorPrompt, isBlocking, runArchValidator } from '../../../../../skills/nova/pipeline/services/arch-validator.ts';

function gatewayPolicy(timeoutMs = 25) {
  return { timeout_ms: timeoutMs };
}

function sessionConfig() {
  return {
    gateway: {
      invoke: {
        retry: { max_attempts: 0, retry_delay_ms: 0 },
        session_spawn: gatewayPolicy(),
        session_status: gatewayPolicy(),
        session_send: gatewayPolicy(),
        subagent_kill: gatewayPolicy(),
        subagent_list: gatewayPolicy(),
        health: gatewayPolicy(),
      },
    },
    session: {
      spawn: {
        thread: true,
        mode: 'child',
        cleanup: 'manual',
        stream_to: 'none',
      },
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
  };
}

function archValidatorFixture(prefix, {
  project,
  model = 'gpt-5.4',
  thinking = 'none',
  agentMaxAttempts,
} = {}) {
  const root = fs.mkdtempSync(path.join(process.cwd(), '.swarm', prefix));
  const swarmDir = path.join(root, 'Projects', project, 'src', '.swarm');
  const modulesDir = path.join(swarmDir, 'modules');
  fs.mkdirSync(path.join(modulesDir, '01-nginx'), { recursive: true });
  fs.writeFileSync(path.join(modulesDir, '01-nginx', 'FORGE.md'), '# Forge\n');
  const progress = {
    project,
    execution_order: ['01-nginx'],
    modules: { '01-nginx': { dir: '01-nginx', depends_on: [] } },
    gates: {},
    arch_validation: {
      agent_enabled: true,
      timeout_minutes: 1,
      ...(agentMaxAttempts ? { agent_max_attempts: agentMaxAttempts } : {}),
    },
    defaults: {
      models: { arch_validator: model },
      thinking: { arch_validator: thinking },
    },
  };
  const config = {
    ...sessionConfig(),
    project,
    repo_root: root,
    fallback_model: model,
    paths: { swarm_dir: swarmDir, modules_dir: modulesDir, progress_file: path.join(swarmDir, 'progress.json') },
    agents: { echo: { dispatch: 'subagent', acp_agent_id: 'echo-agent' } },
    arch_validation: { enabled: true, agent_enabled: true, timeout_minutes: 1 },
    rate_limit: { max_pauses_per_module: 1, cooldown_hours: 0, cooldown_buffer_ms: 0 },
  };
  return { config, progress };
}

test('architecture validator treats error severity as blocking authority', () => {
  assert.equal(isBlocking([{ severity: 'error' }]), true);
  assert.equal(isBlocking([{ severity: 'warn' }, { severity: 'info' }]), false);
});

test('architecture validator spawned session receives explicit lifecycle policies', async () => {
  const { config, progress } = archValidatorFixture('arch-validator-policy-', {
    project: 'arch-validator-policy-test',
    model: 'openai/gpt-5-codex',
    thinking: 'low',
  });

  let spawnOptions = null;
  let terminateOptions = null;
  const result = await runArchValidator(config, progress, {
    deps: {
      modelToHarness: () => 'echo-agent',
      resolveRuntime: () => 'subagent',
      spawnSession: async (_request, _prompt, _timeoutSeconds, options) => {
        spawnOptions = options;
        return { childSessionKey: 'arch-validator-test-session' };
      },
      pollForFile: async (_config, outputPath) => {
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, '[]\n');
        return { ok: true };
      },
      terminateSession: async (_sessionKey, options) => {
        terminateOptions = options;
      },
    },
  });

  assert.equal(result.blocked, false);
  assert.equal(spawnOptions.runtime, 'subagent');
  assert.equal(spawnOptions.agentId, 'echo-agent');
  assert.deepEqual(spawnOptions.spawnPolicy, {
    gateway: { timeoutMs: 25, maxRetries: 0, retryDelayMs: 0 },
    thread: true,
    mode: 'child',
    cleanup: 'manual',
    streamTo: 'none',
  });
  assert.equal(spawnOptions.killPolicy.stopMessage, 'stop');
  assert.equal(spawnOptions.terminationPolicy.graceMs, 25);
  assert.equal(terminateOptions.runtime, 'subagent');
  assert.equal(terminateOptions.terminationPolicy.maxGraceMs, 25);
});

test('architecture validator retries after canonical rate-limit cooldown', async () => {
  const { config, progress } = archValidatorFixture('arch-validator-rate-limit-', {
    project: 'arch-validator-rate-limit-test',
  });

  const spawned = [];
  const terminated = [];
  let polls = 0;
  const result = await runArchValidator(config, progress, {
    deps: {
      modelToHarness: () => 'echo-agent',
      resolveRuntime: () => 'subagent',
      spawnSession: async (request) => {
        spawned.push(request.session.label);
        return { childSessionKey: `session-${spawned.length}` };
      },
      pollForFile: async (_config, outputPath) => {
        polls += 1;
        if (polls === 1) {
          return {
            ok: false,
            reason: 'rate_limited',
            status: {
              detail: 'provider returned rate limit without reset metadata',
            },
          };
        }
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, '[]\n');
        return { ok: true };
      },
      terminateSession: async (sessionKey) => {
        terminated.push(sessionKey);
      },
    },
  });

  assert.equal(result.blocked, false);
  assert.equal(polls, 2);
  assert.equal(spawned.length, 2);
  assert.deepEqual(terminated, ['session-1', 'session-2']);
});

test('architecture validator retries agent no-output failures within explicit attempt budget', async () => {
  const { config, progress } = archValidatorFixture('arch-validator-no-output-', {
    project: 'arch-validator-no-output-test',
    agentMaxAttempts: 2,
  });

  const spawned = [];
  let polls = 0;
  const result = await runArchValidator(config, progress, {
    deps: {
      modelToHarness: () => 'echo-agent',
      resolveRuntime: () => 'subagent',
      spawnSession: async (request) => {
        spawned.push(request.session.label);
        return { childSessionKey: `session-${spawned.length}` };
      },
      pollForFile: async (_config, outputPath) => {
        polls += 1;
        if (polls === 1) return { ok: false, reason: 'session_ended_no_output' };
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, '[]\n');
        return { ok: true };
      },
      terminateSession: async () => {},
    },
  });

  assert.equal(result.blocked, false);
  assert.equal(polls, 2);
  assert.equal(spawned.length, 2);
  assert.match(spawned[1], /attempt-2/);
});

async function runAgentFindingCase({ findingScope = 'module' } = {}) {
  const { config, progress } = archValidatorFixture('arch-validator-agent-finding-', {
    project: 'arch-validator-agent-finding',
  });

  return runArchValidator(config, progress, {
    deps: {
      modelToHarness: () => 'echo-agent',
      resolveRuntime: () => 'subagent',
      spawnSession: async () => ({ childSessionKey: 'arch-agent-finding-session' }),
      pollForFile: async (_config, outputPath) => {
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, JSON.stringify([{
          id: 'ARCHITECTURE_BOUNDARY_RISK',
          severity: 'blocking',
          scope: findingScope,
          paths: [],
          explanation: 'The module ownership boundary is unclear for the proposed software architecture.',
          remediation: 'Split ownership responsibilities before implementation.',
        }]));
        return { ok: true };
      },
      terminateSession: async () => {},
    },
  });
}

test('architecture validator agent blocking findings block by severity', async () => {
  const result = await runAgentFindingCase();
  const finding = result.findings.find((entry) => entry.id === 'ARCHITECTURE_BOUNDARY_RISK');

  assert.equal(result.blocked, true);
  assert.equal(finding?.severity, 'blocking');
});

test('architecture validator accepts advertised architecture judgment scopes', async () => {
  for (const findingScope of ['domain_model', 'integration_boundary']) {
    const result = await runAgentFindingCase({ findingScope });
    const finding = result.findings.find((entry) => entry.id === 'ARCHITECTURE_BOUNDARY_RISK');

    assert.equal(result.blocked, true);
    assert.equal(finding?.scope, findingScope);
    assert.equal(finding?.severity, 'blocking');
  }
});

test('architecture validator rejects invented agent judgment scopes', async () => {
  const result = await runAgentFindingCase({ findingScope: 'preview_boundary_thing' });
  const finding = result.findings[0];

  assert.equal(result.blocked, true);
  assert.equal(result.execution_failed, true);
  assert.match(result.error, /invalid scope 'preview_boundary_thing'/);
  assert.equal(finding?.id, 'VALIDATOR_INTERNAL_ERROR');
  assert.equal(finding?.scope, 'project');
  assert.equal(finding?.severity, 'blocking');
});

test('architecture validator agent prompt is scoped to software architecture judgment', () => {
  const prompt = buildValidatorPrompt({
    project: 'arch-scope-test',
    modules: {
      '01-api': {
        dir: '01-api',
        title: 'API module',
        stages: ['forge', 'buster'],
        depends_on: [],
      },
    },
    gates: {},
  }, { project: 'arch-scope-test' }, [], '/tmp/findings.json');

  assert.match(prompt, /opinionated architecture review of the software being built or refactored/);
  assert.match(prompt, /module design, boundaries, responsibilities, dependencies, and product\/refactor shape/);
  assert.match(prompt, /NOT checking progress tracking, tracing, control-flow artifacts, execution metadata/);
  assert.match(prompt, /Do not report findings about progress\.json correctness, tracing, execution-order bookkeeping/);
  assert.match(prompt, /"domain_model" \| "integration_boundary"/);
  assert.doesNotMatch(prompt, /"test_spec" \| "config"/);
});
