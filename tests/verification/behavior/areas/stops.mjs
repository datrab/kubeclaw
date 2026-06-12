import fs from 'fs';
import os from 'os';
import path from 'path';
import assert from 'assert';

import {
  materializeRuntimeTree,
  importRuntimeModule,
  runGateViaRegistry,
} from '../../lib/lifecycle-audit-lib.mjs';

export async function registerStopsArea({
  record,
  sourceRoot,
  overlayRoot,
  installFakeRedis,
  flushAsync,
  xaddEvents,
}) {
function stepExit(result) {
  const status = result?.terminal?.status ?? result?.terminal_status ?? null;
  return status === "succeeded" ? 0 : (status ? 1 : null);
}

function stepMetadata(result) {
  return result?.diagnostics?.metadata || {};
}

function stepRateLimit(result) {
  return result?.rateLimit || {};
}

function gateRuntimeEvents(xaddEvents, streamKey) {
  return xaddEvents(streamKey)
    .filter((event) => !String(event.type || '').startsWith('plugin.gate.'))
    .map((event, index) => ({ ...event, seq: index + 1 }));
}

async function buildBuiltInRegistry(runtimeRootForRegistry) {
  const registryMod = await importRuntimeModule(runtimeRootForRegistry, '/app/skills/pipeline/core/registry.ts');
  const { registry, errors } = registryMod.buildPluginRegistry({ enabled: true, allowCustomModules: false, extraModulePaths: [], modules: {}, stageOwners: {}, restrictedCapabilityAllowlist: {} }, { throwOnError: false });
  assert.equal(errors.length, 0);
  return registry;
}

  await record('buster gate post-start terminal failures still emit authoritative gate failure telemetry', async () => {
    const { runtimeRoot: busterRuntimeRoot } = materializeRuntimeTree(sourceRoot, overlayRoot, 'general');
    installFakeRedis(busterRuntimeRoot);
    globalThis.__fakeRedisCalls = [];
    globalThis.__fakeRedisCounters = Object.create(null);
  
    const busterGateRunnerMod = await importRuntimeModule(busterRuntimeRoot, '/app/skills/pipeline/runners/buster-gate-runner.ts');
    const runtimeCoreMod = await importRuntimeModule(busterRuntimeRoot, '/app/skills/pipeline/core/runtime.ts');
  
    const scenarios = [
      {
        name: 'config invalid',
        project: 'behavior-buster-config-invalid',
        runId: 'run-buster-config-invalid-1',
        expectedExit: 1,
        result: { ok: false, reason: 'config_invalid', status: { error: 'missing suite config', gateway_label: 'gate-buster-dispatch', session_key: 'agent:main:acp:gate-buster' } },
        expectedReason: "Gate 'gate:buster' config invalid: missing suite config",
      },
      {
        name: 'spawn failed',
        project: 'behavior-buster-spawn-failed',
        runId: 'run-buster-spawn-failed-1',
        expectedExit: 1,
        result: { ok: false, reason: 'spawn_failed', status: { error: 'spawn unavailable', gateway_label: 'gate-buster-dispatch', session_key: 'agent:main:acp:gate-buster' } },
        expectedReason: "Gate 'gate:buster' spawn failed: spawn unavailable",
      },
      {
        name: 'parse corrupted',
        project: 'behavior-buster-parse-corrupted',
        runId: 'run-buster-parse-corrupted-1',
        expectedExit: 1,
        result: { ok: false, reason: 'parse_corrupted', status: { attempt: 1, gateway_label: 'gate-buster-dispatch', session_key: 'agent:main:acp:gate-buster' } },
        expectedReason: "Gate 'gate:buster' status file permanently corrupted",
      },
      {
        name: 'timeout',
        project: 'behavior-buster-timeout',
        runId: 'run-buster-timeout-1',
        expectedExit: 1,
        result: { ok: false, reason: 'timeout', status: { attempt: 1, gateway_label: 'gate-buster-dispatch', session_key: 'agent:main:acp:gate-buster' } },
        expectedReason: "Gate 'gate:buster' timed out",
      },
      {
        name: 'git error',
        project: 'behavior-buster-git-error',
        runId: 'run-buster-git-error-1',
        expectedExit: 1,
        result: { ok: false, reason: 'git_error', status: { message: 'polling git unsafe', gateway_label: 'gate-buster-dispatch', session_key: 'agent:main:acp:gate-buster' } },
        expectedReason: 'polling git unsafe',
      },
      {
        name: 'rate limit exhausted',
        project: 'behavior-buster-rate-limit-exhausted',
        runId: 'run-buster-rate-limit-exhausted-1',
        expectedExit: 1,
        rateLimit: { max_pauses_per_module: 0 },
        result: { ok: false, reason: 'rate_limited', status: { attempt: 1, provider: 'anthropic', dispatch_id: 'dispatch-buster-rate-limit-1', gateway_label: 'gate-buster-dispatch', session_key: 'agent:main:acp:gate-buster' } },
        expectedReason: "Gate 'gate:buster' exceeded max rate limit pauses",
      },
      {
        name: 'no fix loop',
        project: 'behavior-buster-no-fix-loop',
        runId: 'run-buster-no-fix-loop-1',
        expectedExit: 1,
        result: {
          ok: false,
          reason: 'verdict_fail',
          status: {
            attempt: 1,
            gateway_label: 'gate-buster-dispatch',
            session_key: 'agent:main:acp:gate-buster',
            issues: [
              { title: 'Accessibility regression', description: 'Button has no accessible name', severity: 'critical' },
              { title: 'Visual mismatch', description: 'Dashboard layout shifted', severity: 'moderate' },
            ],
          },
        },
        expectedReason: "Gate 'gate:buster' failed: Accessibility regression; Visual mismatch",
        expectedVerdictReason: 'Accessibility regression; Visual mismatch',
      },
    ];
  
    for (const scenario of scenarios) {
      const discordCalls = [];
            const deps = {
          busterGate: {
            discord: async (...args) => { discordCalls.push(args); },
            readGateInstructions: () => 'buster gate instructions',
            resolvePolicy: () => ({ model: 'buster-model', model_source: 'test' }),
            logEffectivePolicy: () => {},
            runOnce: async () => scenario.result,
          },
        };
const config = {
        project: scenario.project,
        paths: { swarm_dir: `/tmp/${scenario.project}-swarm` },
        telemetry: { enabled: true },
        _runId: scenario.runId,
        run_id: scenario.runId,
        _runStats: runtimeCoreMod.createRunStats('2026-04-09T00:00:00.000Z'),
        pluginRegistry: await buildBuiltInRegistry(busterRuntimeRoot),
        default_timeout_minutes: 5,
        default_max_fails: 2,
        rate_limit: scenario.rateLimit || { max_pauses_per_module: 2, cooldown_hours: 0 },
              };
  
      const progress = {
        modules: {},
        gates: {
          'gate:buster': { type: 'buster', title: 'Buster Gate', timeout_minutes: 5 },
        },
      };
  
      const result = await runGateViaRegistry(busterRuntimeRoot, config, progress, 'gate:buster', { deps });
      await flushAsync();
  
      assert.equal(stepExit(result), scenario.expectedExit, scenario.name);
      if (['config invalid', 'spawn failed', 'parse corrupted', 'timeout', 'git error', 'rate limit exhausted'].includes(scenario.name)) {
        assert.equal(stepMetadata(result).gateway_label, 'gate-buster-dispatch', `${scenario.name} missing returned gateway label`);
        assert.equal(stepMetadata(result).session_key, 'agent:main:acp:gate-buster', `${scenario.name} missing returned session key`);
        if (scenario.name === 'rate limit exhausted') {
          assert.equal(stepMetadata(result).dispatch_id, 'dispatch-buster-rate-limit-1', `${scenario.name} missing returned dispatch id`);
          assert.equal(result.correlation.gate_type, 'buster', `${scenario.name} missing returned gate type`);
          assert.equal(stepRateLimit(result).max_rate_limit_pauses, 0, `${scenario.name} missing returned pause budget`);
        }
      }
  
      const streamKey = `pipeline:telemetry:${scenario.project}:${scenario.runId}`;
      const events = gateRuntimeEvents(xaddEvents, streamKey);
      const signalEvents = events.filter((event) => event.type !== 'observability.degraded' && event.type !== 'observability.restored');
      if (scenario.name === "rate limit exhausted") {
        assert.deepEqual(signalEvents.map((event) => event.type), ['gate.started', 'gate.verdict', 'retry.exhausted'], scenario.name);
      } else {
        assert.deepEqual(signalEvents.map((event) => event.type), ['gate.started', 'gate.verdict'], scenario.name);
      }
      assert.equal(signalEvents[0].gate_id, 'gate:buster', scenario.name);
      assert.equal(signalEvents[0].gate_type, 'buster', scenario.name);
      assert.equal(signalEvents[1].gate_id, 'gate:buster', scenario.name);
      assert.equal(signalEvents[1].gate_type, 'buster', scenario.name);
      assert.equal(signalEvents[1].verdict, 'NO-GO', scenario.name);
      assert.equal(signalEvents[1].reason, scenario.expectedVerdictReason ?? scenario.expectedReason, scenario.name);
      assert.equal(signalEvents[1].session_key, 'agent:main:acp:gate-buster', scenario.name);
      if (scenario.name === "rate limit exhausted") {
        assert.equal(signalEvents[1].dispatch_id, 'dispatch-buster-rate-limit-1', scenario.name);
        assert.equal(signalEvents[2].gate_id, 'gate:buster', scenario.name);
        assert.equal(signalEvents[2].module_id, null, scenario.name);
        assert.equal(signalEvents[2].phase, 'buster_gate', scenario.name);
        assert.equal(signalEvents[2].dispatch_id, 'dispatch-buster-rate-limit-1', scenario.name);
        assert.equal(signalEvents[2].session_key, 'agent:main:acp:gate-buster', scenario.name);
        assert.equal(signalEvents[2].reason, "Gate 'gate:buster' exceeded max rate limit pauses", scenario.name);
        assert.equal(signalEvents[2].max_attempts, 0, scenario.name);
        assert.equal(signalEvents[2].max_fails, 0, scenario.name);
      }
  
      if (scenario.name === 'spawn failed') {
        const failureDiscordCall = discordCalls.find(([, , title]) => title === "Gate 'gate:buster' Spawn Failed");
        assert.equal(Boolean(failureDiscordCall), true, `${scenario.name} missing Discord alert`);
        assert.equal(failureDiscordCall[4].some((field) => field.name === 'Session' && field.value === 'agent:main:acp:gate-buster'), true, `${scenario.name} missing Discord session correlation`);
      }
      if (scenario.name === 'no fix loop') {
        const failureDiscordCall = discordCalls.find(([, , title]) => title === "Gate 'gate:buster' FAIL");
        assert.equal(Boolean(failureDiscordCall), true, `${scenario.name} missing Discord alert`);
        assert.equal(failureDiscordCall[4].some((field) => field.name === 'Session' && field.value === 'agent:main:acp:gate-buster'), true, `${scenario.name} missing Discord session correlation`);
      }
    }
  });

}
