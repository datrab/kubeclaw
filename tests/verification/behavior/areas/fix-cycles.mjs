import fs from 'fs';
import os from 'os';
import path from 'path';
import assert from 'assert';

import {
  materializeRuntimeTree,
  importRuntimeModule,
} from '../../lib/lifecycle-audit-lib.mjs';

function getFieldValue(fields = [], name) {
  return fields.find((field) => field.name === name)?.value;
}

export async function registerFixCyclesArea({
  record,
  sourceRoot,
  overlayRoot,
  installFakeRedis,
  flushAsync,
  xaddEvents,
}) {
  await record('review gate fix-cycle interruption paths emit authoritative failure telemetry', async () => {
    const { runtimeRoot: reviewRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(reviewRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);
  
    const reviewGateRunnerMod = await importRuntimeModule(reviewRuntimeRoot, '/app/skills/pipeline/runners/review-gate-runner.js');
    const runtimeCoreMod = await importRuntimeModule(reviewRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
  
    const initialNoGo = {
      ok: false,
      gateway_label: 'echo-quality',
      session_key: 'agent:main:acp:echo-review-initial',
      mergedResult: {
        critical_blockers: [{ description: 'Missing auth middleware' }],
        critical_issues: [{ description: 'SQL injection risk in user endpoint' }],
      },
    };
    const reviewFixRateLimitResult = {
      completed: false,
      hasChanges: false,
      reason: 'rate_limit_exhausted',
      transcript: null,
      rate_limit_status: {
        attempt: 4,
        dispatch_id: 'reviewfix-dispatch-4',
        provider: 'anthropic',
        reason: 'provider overloaded',
        session_key: 'agent:reviewfix-gate:review-1',
        max_rate_limit_pauses: 3,
      },
    };
  
    const scenarios = [
      {
        name: 'forge spawn failed',
        project: 'behavior-review-fix-spawn-failed',
        runId: 'run-review-fix-spawn-failed-1',
        overrides: {
          runOnce: async () => initialNoGo,
          resolvePolicy: () => ({ model: 'forge-model', model_source: 'test', thinking: 'high' }),
          logEffectivePolicy: () => {},
          spawnAgent: async () => { throw new Error('gateway unavailable'); },
          acpLabel: (_agent, label) => label,
          getTrackedAgent: () => null,
          discord: async () => {},
        },
        expectedReason: 'Review fix Forge spawn failed: gateway unavailable',
        expectedIssuesCount: 2,
      },
      {
        name: 'forge health check failed',
        project: 'behavior-review-fix-health-failed',
        runId: 'run-review-fix-health-failed-1',
        overrides: {
          runOnce: async () => initialNoGo,
          resolvePolicy: () => ({ model: 'forge-model', model_source: 'test', thinking: 'high' }),
          logEffectivePolicy: () => {},
          spawnAgent: async () => ({}),
          acpLabel: (_agent, label) => label,
          getTrackedAgent: (label) => ({ sessionKey: `agent:${label}`, gatewayLabel: 'reviewfix-review-dispatch', streamLogPath: null }),
          verifyAgentAlive: async () => false,
          killAgent: async () => true,
          discord: async () => {},
        },
        expectedReason: 'Review fix Forge health check failed',
        expectedIssuesCount: 2,
      },
      {
        name: 'no usable output',
        project: 'behavior-review-fix-no-output',
        runId: 'run-review-fix-no-output-1',
        overrides: {
          runOnce: async () => initialNoGo,
          resolvePolicy: () => ({ model: 'forge-model', model_source: 'test', thinking: 'high' }),
          logEffectivePolicy: () => {},
          spawnAgent: async () => ({}),
          acpLabel: (_agent, label) => label,
          getTrackedAgent: (label) => ({ sessionKey: `agent:${label}`, gatewayLabel: 'reviewfix-review-dispatch', streamLogPath: null }),
          verifyAgentAlive: async () => true,
          pollForSessionEnd: async () => ({ completed: false, hasChanges: false, transcript: null }),
          killAgent: async () => true,
          discord: async () => {},
        },
        expectedReason: 'Review fix produced no usable output (timeout)',
        expectedIssuesCount: 2,
      },
      {
        name: 'fix rate limit exhausted',
        project: 'behavior-review-fix-rate-limit-exhausted',
        runId: 'run-review-fix-rate-limit-exhausted-1',
        overrides: {
          runOnce: async () => initialNoGo,
          resolvePolicy: () => ({ model: 'forge-model', model_source: 'test', thinking: 'high' }),
          logEffectivePolicy: () => {},
          spawnAgent: async () => ({}),
          acpLabel: (_agent, label) => label,
          getTrackedAgent: (label) => ({ sessionKey: `agent:${label}`, gatewayLabel: 'reviewfix-review-dispatch', streamLogPath: null }),
          verifyAgentAlive: async () => true,
          pollForSessionEnd: async () => reviewFixRateLimitResult,
          killAgent: async () => true,
          discord: async () => {},
        },
        expectedExit: 40,
        expectedResultReason: "Review fix 'reviewfix-gate:review-1' exceeded max rate limit pauses",
        expectedReason: "Review fix 'reviewfix-gate:review-1' exceeded max rate limit pauses",
        expectedIssuesCount: 2,
        expectedDiscordTitle: 'Review Fix Rate Limit Exhausted: Review Gate',
        expectedDiscordDescription: 'Fix attempt 4 exceeded max ACP rate limit pauses (3).',
        expectedExhaustedResult: reviewFixRateLimitResult,
      },
      {
        name: 're-review error',
        project: 'behavior-review-rereview-error',
        runId: 'run-review-rereview-error-1',
        overrides: {
          runOnce: (() => {
            const results = [initialNoGo, { error: 'reviewer transport crashed again' }];
            return async () => results.shift();
          })(),
          resolvePolicy: () => ({ model: 'forge-model', model_source: 'test', thinking: 'high' }),
          logEffectivePolicy: () => {},
          spawnAgent: async () => ({}),
          acpLabel: (_agent, label) => label,
          getTrackedAgent: (label) => ({ sessionKey: `agent:${label}`, gatewayLabel: 'reviewfix-review-dispatch', streamLogPath: null }),
          verifyAgentAlive: async () => true,
          pollForSessionEnd: async () => ({ completed: true, hasChanges: true, transcript: null }),
          killAgent: async () => true,
          gitCommitAndPush: async () => {},
          discord: async () => {},
        },
        expectedReason: 'Review re-review failed: reviewer transport crashed again',
        expectedIssuesCount: null,
      },
    ];
  
    for (const scenario of scenarios) {
      const discordCalls = [];
      const scenarioDiscord = scenario.overrides.discord;
      const config = {
        project: scenario.project,
        repo_root: `/tmp/${scenario.project}`,
        paths: { swarm_dir: `/tmp/${scenario.project}/swarm` },
        telemetry: { enabled: true },
        _runId: scenario.runId,
        run_id: scenario.runId,
        _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
        default_timeout_minutes: 5,
        default_max_fails: 1,
        _testOverrides: {
          reviewGate: {
            ...scenario.overrides,
            discord: async (...args) => {
              discordCalls.push(args);
              if (scenarioDiscord) await scenarioDiscord(...args);
            },
          },
        },
      };
  
      const progress = {
        modules: {},
        gates: {
          'gate:review': {
            type: 'review',
            title: 'Review Gate',
            review_name: 'quality',
            reviewers: [{ label: 'echo-quality', model: 'anthropic/claude-sonnet-4-6' }],
            max_fix_cycles: 1,
          },
        },
      };
  
      const result = await reviewGateRunnerMod.runReviewGate(config, progress, 'gate:review');
      await flushAsync();
  
      assert.equal(result.exit, scenario.expectedExit ?? 10, scenario.name);
      assert.equal(result.reason, scenario.expectedResultReason ?? "Review gate 'gate:review' NO-GO after 1 fix cycles", scenario.name);
      if (scenario.expectedExit === 40) {
        assert.equal(result.run_id, scenario.runId, `${scenario.name} missing returned run id`);
        assert.equal(result.gate, 'gate:review', `${scenario.name} missing returned gate alias`);
        assert.equal(result.gate_id, 'gate:review', `${scenario.name} missing returned gate id`);
        assert.equal(result.gate_type, 'review', `${scenario.name} missing returned gate type`);
        assert.equal(result.attempt, 4, `${scenario.name} missing returned attempt`);
        assert.equal(result.dispatch_id, 'reviewfix-dispatch-4', `${scenario.name} missing returned dispatch id`);
        assert.equal(result.gateway_label, 'reviewfix-dispatch-4', `${scenario.name} missing returned gateway label`);
        assert.equal(result.session_key, 'agent:reviewfix-gate:review-1', `${scenario.name} missing returned session key`);
        assert.equal(result.max_rate_limit_pauses, 3, `${scenario.name} missing returned pause budget`);
        assert.equal(result.rate_limit_status?.max_rate_limit_pauses, 3, `${scenario.name} missing returned nested pause budget`);
      } else {
        assert.equal(result.gateway_label, 'echo-quality', `${scenario.name} missing returned gateway label`);
        assert.equal(result.session_key, 'agent:main:acp:echo-review-initial', `${scenario.name} missing returned session key`);
      }
      if (scenario.expectedDiscordTitle) {
        const discordCall = discordCalls.find(([, , title]) => title === scenario.expectedDiscordTitle);
        assert.equal(discordCall?.[3], scenario.expectedDiscordDescription, `${scenario.name} missing canonical Discord description`);
        assert.equal(getFieldValue(discordCall?.[4], 'Attempt'), '4', `${scenario.name} missing canonical Discord attempt`);
        assert.equal(getFieldValue(discordCall?.[4], 'Dispatch'), 'reviewfix-dispatch-4', `${scenario.name} missing canonical Discord dispatch`);
      }
      if (scenario.expectedExhaustedResult) {
        assert.equal(scenario.expectedExhaustedResult.max_rate_limit_pauses, undefined, `${scenario.name} should omit top-level pause budget`);
        assert.equal(scenario.expectedExhaustedResult.rate_limit_status?.max_rate_limit_pauses, 3, `${scenario.name} should preserve nested pause budget`);
      }
  
      const streamKey = `pipeline:telemetry:${scenario.project}:${scenario.runId}`;
      const events = xaddEvents(streamKey);
      const signalEvents = events.filter((event) => event.type !== 'observability.degraded');
      const expectedMaxRateLimitPauses = config.rate_limit?.max_pauses_per_module ?? 5;
      if (scenario.expectedExit === 40) {
        assert.deepEqual(signalEvents.map((event) => event.type), ['gate.started', 'gate.verdict', 'gate.verdict', 'retry.exhausted'], scenario.name);
      } else {
        assert.deepEqual(signalEvents.map((event) => event.type), ['gate.started', 'gate.verdict', 'gate.verdict', 'gate.verdict', 'retry.exhausted'], scenario.name);
      }
      assert.equal(signalEvents[1].verdict, 'NO-GO', scenario.name);
      assert.equal(signalEvents[1].fix_cycle, 0, scenario.name);
      if (scenario.expectedExit === 40) {
        assert.equal(signalEvents[2].verdict, 'NO-GO', scenario.name);
        assert.equal(signalEvents[2].fix_cycle, 1, scenario.name);
        assert.equal(signalEvents[2].issues_count, scenario.expectedIssuesCount, scenario.name);
        assert.equal(signalEvents[2].attempt, 4, scenario.name);
        assert.equal(signalEvents[2].dispatch_id, 'reviewfix-dispatch-4', scenario.name);
        assert.equal(signalEvents[2].gateway_label, 'reviewfix-dispatch-4', scenario.name);
        assert.equal(signalEvents[2].session_key, 'agent:reviewfix-gate:review-1', scenario.name);
        assert.equal(signalEvents[2].reason, "Review fix 'reviewfix-gate:review-1' exceeded max rate limit pauses", scenario.name);
        assert.equal(signalEvents[3].gate_id, 'gate:review', scenario.name);
        assert.equal(signalEvents[3].module_id, null, scenario.name);
        assert.equal(signalEvents[3].phase, 'review_gate_fix', scenario.name);
        assert.equal(signalEvents[3].attempt, 4, scenario.name);
        assert.equal(signalEvents[3].dispatch_id, 'reviewfix-dispatch-4', scenario.name);
        assert.equal(signalEvents[3].gateway_label, 'reviewfix-dispatch-4', scenario.name);
        assert.equal(signalEvents[3].session_key, 'agent:reviewfix-gate:review-1', scenario.name);
        assert.equal(signalEvents[3].reason, "Review fix 'reviewfix-gate:review-1' exceeded max rate limit pauses", scenario.name);
        assert.equal(signalEvents[3].max_attempts, 3, scenario.name);
        assert.equal(signalEvents[3].max_fails, 3, scenario.name);
      } else {
        assert.equal(signalEvents[2].verdict, 'NO-GO', scenario.name);
        assert.equal(signalEvents[2].fix_cycle, 1, scenario.name);
        assert.equal(signalEvents[2].reason, scenario.expectedReason, scenario.name);
        if (scenario.expectedIssuesCount !== null) {
          assert.equal(signalEvents[2].issues_count, scenario.expectedIssuesCount, scenario.name);
        }
        assert.equal(signalEvents[3].verdict, 'NO-GO', scenario.name);
        assert.equal(signalEvents[3].fix_cycle, 1, scenario.name);
        assert.equal(signalEvents[3].reason, 'NO-GO after 1 fix cycles', scenario.name);
        assert.equal(signalEvents[4].gate_id, 'gate:review', scenario.name);
        assert.equal(signalEvents[4].module_id, null, scenario.name);
        assert.equal(signalEvents[4].phase, 'review_gate_fix', scenario.name);
        assert.equal(signalEvents[4].session_key, 'agent:main:acp:echo-review-initial', scenario.name);
        assert.equal(signalEvents[4].reason, "Review gate 'gate:review' NO-GO after 1 fix cycles", scenario.name);
        assert.equal(signalEvents[4].max_attempts, 1, scenario.name);
        assert.equal(signalEvents[4].max_fails, 1, scenario.name);
      }
    }
  });

  await record('review gate fix-and-rereview cycles emit authoritative NO-GO verdict telemetry before final resolution', async () => {
    const { runtimeRoot: reviewRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(reviewRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);

    const reviewGateRunnerMod = await importRuntimeModule(reviewRuntimeRoot, '/app/skills/pipeline/runners/review-gate-runner.js');
    const runtimeCoreMod = await importRuntimeModule(reviewRuntimeRoot, '/app/skills/pipeline/core/runtime.js');

    const reviewResults = [
      {
        ok: false,
        mergedResult: {
          critical_blockers: [{ description: 'Missing auth middleware' }],
          critical_issues: [{ description: 'SQL injection risk in user endpoint' }],
        },
      },
      {
        ok: false,
        mergedResult: {
          critical_blockers: [{ description: 'CSRF protection still missing' }],
          critical_issues: [{ description: 'Unsafe admin mutation remains exposed' }],
        },
      },
      { ok: true, mergedResult: { status: 'GO' } },
    ];

    const config = {
      project: 'behavior-review-fix-cycles',
      repo_root: '/tmp/behavior-review-fix-cycles',
      paths: { swarm_dir: '/tmp/behavior-review-fix-cycles/swarm' },
      telemetry: { enabled: true },
      _runId: 'run-review-fix-cycles-1',
      run_id: 'run-review-fix-cycles-1',
      _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
      default_timeout_minutes: 5,
      default_max_fails: 2,
      _testOverrides: {
        reviewGate: {
          discord: async () => {},
          runOnce: async () => reviewResults.shift(),
          resolvePolicy: () => ({ model: 'forge-model', model_source: 'test', thinking: 'high' }),
          logEffectivePolicy: () => {},
          spawnAgent: async () => ({}),
          acpLabel: (_agent, label) => label,
          getTrackedAgent: (label) => ({ sessionKey: `agent:${label}`, streamLogPath: null }),
          verifyAgentAlive: async () => true,
          pollForSessionEnd: async () => ({ completed: true, hasChanges: true, transcript: null }),
          killAgent: async () => true,
          gitCommitAndPush: async () => {},
        },
      },
    };

    const progress = {
      modules: {},
      gates: {
        'gate:review': {
          type: 'review',
          title: 'Review Gate',
          review_name: 'quality',
          reviewers: [{ label: 'echo-quality', model: 'anthropic/claude-sonnet-4-6' }],
          max_fix_cycles: 2,
        },
      },
    };

    const result = await reviewGateRunnerMod.runReviewGate(config, progress, 'gate:review');
    await flushAsync();

    assert.equal(result.exit, 0);
    assert.equal(result.status, 'PASS');

    const streamKey = 'pipeline:telemetry:behavior-review-fix-cycles:run-review-fix-cycles-1';
    const events = xaddEvents(streamKey);
    const signalEvents = events.filter((event) => event.type !== 'observability.degraded');
    assert.deepEqual(signalEvents.map((event) => event.type), ['gate.started', 'gate.verdict', 'gate.verdict', 'gate.verdict']);
    assert.equal(signalEvents[1].gate_id, 'gate:review');
    assert.equal(signalEvents[1].verdict, 'NO-GO');
    assert.equal(signalEvents[1].fix_cycle, 0);
    assert.equal(signalEvents[1].issues_count, 2);
    assert.equal(signalEvents[1].blockers_count, 1);
    assert.equal(signalEvents[1].reason, 'SQL injection risk in user endpoint; Missing auth middleware');
    assert.equal(signalEvents[2].gate_id, 'gate:review');
    assert.equal(signalEvents[2].verdict, 'NO-GO');
    assert.equal(signalEvents[2].fix_cycle, 1);
    assert.equal(signalEvents[2].issues_count, 2);
    assert.equal(signalEvents[2].blockers_count, 1);
    assert.equal(signalEvents[2].reason, 'Unsafe admin mutation remains exposed; CSRF protection still missing');
    assert.equal(signalEvents[3].gate_id, 'gate:review');
    assert.equal(signalEvents[3].verdict, 'GO');
    assert.equal(signalEvents[3].fix_cycle, 2);
  });

  await record('buster gate fix-cycle interruption paths emit authoritative failure telemetry', async () => {
    const { runtimeRoot: busterRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(busterRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);
  
    const busterGateRunnerMod = await importRuntimeModule(busterRuntimeRoot, '/app/skills/pipeline/runners/buster-gate-runner.js');
    const runtimeCoreMod = await importRuntimeModule(busterRuntimeRoot, '/app/skills/pipeline/core/runtime.js');
  
    const initialNoGo = {
      ok: false,
      reason: 'gate_fail',
      status: {
        gateway_label: 'gate-buster-dispatch',
        session_key: 'agent:main:acp:gate-buster',
        issues: [
          { title: 'Accessibility regression', description: 'Button has no accessible name', severity: 'critical' },
          { title: 'Visual mismatch', description: 'Dashboard layout shifted', severity: 'moderate' },
        ],
      },
    };
    const busterFixRateLimitResult = {
      completed: false,
      hasChanges: false,
      reason: 'rate_limit_exhausted',
      transcript: null,
      rate_limit_status: {
        attempt: 4,
        provider: 'anthropic',
        reason: 'provider overloaded',
        session_key: 'agent:gatefix-gate:buster-1',
        max_rate_limit_pauses: 3,
      },
    };
  
    const scenarios = [
      {
        name: 'forge spawn failed',
        project: 'behavior-buster-fix-spawn-failed',
        runId: 'run-buster-fix-spawn-failed-1',
        overrides: {
          runOnce: async () => initialNoGo,
          readGateInstructions: () => 'Run the gate',
          resolvePolicy: () => ({ model: 'forge-model', model_source: 'test' }),
          logEffectivePolicy: () => {},
          buildGateFixPrompt: () => ({ prompt: 'fix the gate issues' }),
          spawnAgent: async () => { throw new Error('gateway unavailable'); },
          acpLabel: (_agent, label) => label,
          getTrackedAgent: () => null,
          discord: async () => {},
        },
        expectedReason: 'Gate fix Forge spawn failed: gateway unavailable',
      },
      {
        name: 'forge health check failed',
        project: 'behavior-buster-fix-health-failed',
        runId: 'run-buster-fix-health-failed-1',
        overrides: {
          runOnce: async () => initialNoGo,
          readGateInstructions: () => 'Run the gate',
          resolvePolicy: () => ({ model: 'forge-model', model_source: 'test' }),
          logEffectivePolicy: () => {},
          buildGateFixPrompt: () => ({ prompt: 'fix the gate issues' }),
          spawnAgent: async () => ({}),
          acpLabel: (_agent, label) => label,
          getTrackedAgent: (label) => ({ sessionKey: `agent:${label}`, gatewayLabel: 'gatefix-buster-dispatch', streamLogPath: null }),
          verifyAgentAlive: async () => false,
          killAgent: async () => true,
          discord: async () => {},
        },
        expectedReason: 'Gate fix Forge health check failed',
      },
      {
        name: 'no usable output',
        project: 'behavior-buster-fix-no-output',
        runId: 'run-buster-fix-no-output-1',
        overrides: {
          runOnce: async () => initialNoGo,
          readGateInstructions: () => 'Run the gate',
          resolvePolicy: () => ({ model: 'forge-model', model_source: 'test' }),
          logEffectivePolicy: () => {},
          buildGateFixPrompt: () => ({ prompt: 'fix the gate issues' }),
          spawnAgent: async () => ({}),
          acpLabel: (_agent, label) => label,
          getTrackedAgent: (label) => ({ sessionKey: `agent:${label}`, gatewayLabel: 'gatefix-buster-dispatch', streamLogPath: null }),
          verifyAgentAlive: async () => true,
          pollForSessionEnd: async () => ({ completed: false, hasChanges: false, transcript: null }),
          killAgent: async () => true,
          discord: async () => {},
        },
        expectedExit: 10,
        expectedResultReason: "Gate 'gate:buster' failed after 1 fix attempts",
        expectedReason: 'Gate fix produced no usable output (timeout)',
      },
      {
        name: 'fix rate limit exhausted',
        project: 'behavior-buster-fix-rate-limit-exhausted',
        runId: 'run-buster-fix-rate-limit-exhausted-1',
        overrides: {
          runOnce: async () => initialNoGo,
          readGateInstructions: () => 'Run the gate',
          resolvePolicy: () => ({ model: 'forge-model', model_source: 'test' }),
          logEffectivePolicy: () => {},
          buildGateFixPrompt: () => ({ prompt: 'fix the gate issues' }),
          spawnAgent: async () => ({}),
          acpLabel: (_agent, label) => label,
          getTrackedAgent: (label) => ({ sessionKey: `agent:${label}`, telemetry_dispatch_id: 'gatefix-dispatch-4', gatewayLabel: 'gatefix-buster-dispatch', streamLogPath: null }),
          verifyAgentAlive: async () => true,
          pollForSessionEnd: async () => busterFixRateLimitResult,
          killAgent: async () => true,
          discord: async () => {},
        },
        expectedExit: 40,
        expectedResultReason: "Gate fix 'gatefix-gate:buster-1' exceeded max rate limit pauses",
        expectedReason: "Gate fix 'gatefix-gate:buster-1' exceeded max rate limit pauses",
        expectedDiscordDescription: 'Fix attempt 4 exceeded max ACP rate limit pauses (3).',
        expectedExhaustedResult: busterFixRateLimitResult,
      },
    ];
  
    for (const scenario of scenarios) {
      const discordCalls = [];
      const scenarioDiscord = scenario.overrides.discord;
      const config = {
        project: scenario.project,
        repo_root: `/tmp/${scenario.project}`,
        paths: { swarm_dir: `/tmp/${scenario.project}/swarm` },
        telemetry: { enabled: true },
        _runId: scenario.runId,
        run_id: scenario.runId,
        _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
        default_timeout_minutes: 5,
        default_max_fails: 1,
        _testOverrides: {
          busterGate: {
            ...scenario.overrides,
            discord: async (...args) => {
              discordCalls.push(args);
              if (scenarioDiscord) await scenarioDiscord(...args);
            },
          },
        },
      };
  
      const progress = {
        modules: {},
        gates: {
          'gate:buster': {
            type: 'buster',
            title: 'Buster Gate',
            on_fail: 'fix_and_retest',
            max_fix_cycles: 1,
          },
        },
      };
  
      const result = await busterGateRunnerMod.runBusterGate(config, progress, 'gate:buster');
      await flushAsync();
  
      assert.equal(result.exit, scenario.expectedExit ?? 10, scenario.name);
      assert.equal(result.reason, scenario.expectedResultReason ?? "Gate 'gate:buster' failed after 1 fix attempts", scenario.name);
      if (scenario.name === 'no usable output') {
        assert.equal(result.gateway_label, 'gate-buster-dispatch', `${scenario.name} missing returned gateway label`);
        assert.equal(result.session_key, 'agent:main:acp:gate-buster', `${scenario.name} missing returned session key`);
      }
      if (scenario.name === 'fix rate limit exhausted') {
        assert.equal(result.attempt, 4, `${scenario.name} missing returned attempt`);
        assert.equal(result.dispatch_id, 'gatefix-dispatch-4', `${scenario.name} missing returned dispatch id`);
        assert.equal(result.gateway_label, 'gatefix-buster-dispatch', `${scenario.name} missing returned gateway label`);
        assert.equal(result.session_key, 'agent:gatefix-gate:buster-1', `${scenario.name} missing returned session key`);
        assert.equal(result.gate_type, 'buster', `${scenario.name} missing returned gate type`);
        assert.equal(result.max_rate_limit_pauses, 3, `${scenario.name} missing returned pause budget`);
        assert.equal(result.rate_limit_status?.max_rate_limit_pauses, 3, `${scenario.name} missing returned nested pause budget`);
      }
  
      const streamKey = `pipeline:telemetry:${scenario.project}:${scenario.runId}`;
      const events = xaddEvents(streamKey);
      const signalEvents = events.filter((event) => event.type !== 'observability.degraded');
      const expectedMaxRateLimitPauses = config.rate_limit?.max_pauses_per_module ?? 5;
      if (scenario.expectedExit === 40) {
        assert.deepEqual(signalEvents.map((event) => event.type), ['gate.started', 'gate.verdict', 'gate.verdict', 'retry.exhausted'], scenario.name);
      } else {
        assert.deepEqual(signalEvents.map((event) => event.type), ['gate.started', 'gate.verdict', 'gate.verdict', 'gate.verdict', 'retry.exhausted'], scenario.name);
      }
      assert.equal(signalEvents[1].verdict, 'NO-GO', scenario.name);
      assert.equal(signalEvents[1].fix_cycle, 0, scenario.name);
      assert.equal(signalEvents[1].issues_count, 2, scenario.name);
      assert.equal(signalEvents[1].reason, 'Accessibility regression; Visual mismatch', scenario.name);
      assert.equal(signalEvents[1].session_key, 'agent:main:acp:gate-buster', scenario.name);
      assert.equal(signalEvents[2].verdict, 'NO-GO', scenario.name);
      assert.equal(signalEvents[2].fix_cycle, 1, scenario.name);
      assert.equal(signalEvents[2].issues_count, 2, scenario.name);
      assert.equal(signalEvents[2].reason, scenario.expectedReason, scenario.name);
      const expectedFixCycleSessionKey = scenario.name === 'forge spawn failed'
        ? 'agent:main:acp:gate-buster'
        : 'agent:gatefix-gate:buster-1';
      if (scenario.expectedExit === 40) {
        assert.equal(signalEvents[2].session_key, 'agent:gatefix-gate:buster-1', scenario.name);
      } else {
        assert.equal(signalEvents[2].session_key, expectedFixCycleSessionKey, scenario.name);
        assert.equal(signalEvents[3].verdict, 'NO-GO', scenario.name);
        assert.equal(signalEvents[3].fix_cycle, 1, scenario.name);
        assert.equal(signalEvents[3].reason, 'Fix loop exhausted after 1 attempts', scenario.name);
      }
  
      const autoFixCall = discordCalls.find(([, , title]) => title === "Gate 'gate:buster' FAIL — Auto-Fix");
      assert.equal(autoFixCall?.[4]?.some((field) => field.name === 'Session' && field.value === 'agent:main:acp:gate-buster'), true, `${scenario.name} auto-fix alert missing gate session correlation`);
  
      const expectedFollowupTitle = ({
        'forge spawn failed': 'Gate Fix: Forge Spawn Failed',
        'forge health check failed': 'Gate Fix: Forge Not Responding',
        'no usable output': 'Gate Fix timeout: gate:buster',
        'fix rate limit exhausted': 'Gate Fix Rate Limit Exhausted: gate:buster',
      })[scenario.name];
      const followupCall = discordCalls.find(([, , title]) => title === expectedFollowupTitle);
      assert.equal(followupCall?.[4]?.some((field) => field.name === 'Session' && field.value === expectedFixCycleSessionKey), true, `${scenario.name} follow-up alert missing fix-cycle session correlation`);
      if (scenario.name === 'fix rate limit exhausted') {
        assert.equal(followupCall?.[3], scenario.expectedDiscordDescription, `${scenario.name} missing canonical Discord description`);
        assert.equal(getFieldValue(followupCall?.[4], 'Attempt'), '4', `${scenario.name} missing canonical Discord attempt`);
        assert.equal(getFieldValue(followupCall?.[4], 'Dispatch'), 'gatefix-dispatch-4', `${scenario.name} missing canonical Discord dispatch`);
      }
      if (scenario.expectedExhaustedResult) {
        assert.equal(scenario.expectedExhaustedResult.max_rate_limit_pauses, undefined, `${scenario.name} should omit top-level pause budget`);
        assert.equal(scenario.expectedExhaustedResult.rate_limit_status?.max_rate_limit_pauses, 3, `${scenario.name} should preserve nested pause budget`);
      }
      if (scenario.expectedExit === 40) {
        assert.equal(signalEvents[2].attempt, 4, scenario.name);
        assert.equal(signalEvents[2].dispatch_id, 'gatefix-dispatch-4', scenario.name);
        assert.equal(signalEvents[2].gateway_label, 'gatefix-buster-dispatch', scenario.name);
        assert.equal(signalEvents[2].session_key, 'agent:gatefix-gate:buster-1', scenario.name);
      }
      const exhaustedEvent = scenario.expectedExit === 40 ? signalEvents[3] : signalEvents[4];
      assert.equal(exhaustedEvent.gate_id, 'gate:buster', scenario.name);
      assert.equal(exhaustedEvent.module_id, null, scenario.name);
      assert.equal(exhaustedEvent.phase, 'buster_gate_fix', scenario.name);
      if (scenario.expectedExit === 40) {
        assert.equal(exhaustedEvent.attempt, 4, scenario.name);
        assert.equal(exhaustedEvent.dispatch_id, 'gatefix-dispatch-4', scenario.name);
        assert.equal(exhaustedEvent.gateway_label, 'gatefix-buster-dispatch', scenario.name);
        assert.equal(exhaustedEvent.session_key, 'agent:gatefix-gate:buster-1', scenario.name);
        assert.equal(exhaustedEvent.reason, "Gate fix 'gatefix-gate:buster-1' exceeded max rate limit pauses", scenario.name);
        assert.equal(exhaustedEvent.max_attempts, 3, scenario.name);
        assert.equal(exhaustedEvent.max_fails, 3, scenario.name);
      } else {
        assert.equal(exhaustedEvent.session_key, 'agent:main:acp:gate-buster', scenario.name);
        assert.equal(exhaustedEvent.reason, "Gate 'gate:buster' failed after 1 fix attempts", scenario.name);
        assert.equal(exhaustedEvent.max_attempts, 1, scenario.name);
        assert.equal(exhaustedEvent.max_fails, 1, scenario.name);
      }
    }
  });
}
