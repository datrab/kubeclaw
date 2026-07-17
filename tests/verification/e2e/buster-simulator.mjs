#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import { ensureTaskConsumerGroup, processOneQueuedTask, disconnectRedisClient, getRedisClient } from '../../../skills/buster/pipeline/services/task-queue.ts';
import { processTask } from '../../../skills/buster/pipeline/services/task-lifecycle.ts';
import { publishTaskCompletionWithArtifact } from '../../../skills/buster/pipeline/services/task-completion.ts';
import { resolveBusterOutputFilePath } from '../../../skills/buster/pipeline/services/pipeline-helpers.ts';
import { assertScenarioMutationChannel } from './failure-scenarios.mjs';

function parseArgs(argv) {
  const args = {
    timeoutMs: Number(process.env.REAL_E2E_BUSTER_SIMULATOR_TIMEOUT_MS || 30 * 60 * 1000),
    pollMs: Number(process.env.REAL_E2E_BUSTER_SIMULATOR_POLL_MS || 1000),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--timeout-ms') {
      args.timeoutMs = Number(argv[++index]);
    } else if (arg === '--poll-ms') {
      args.pollMs = Number(argv[++index]);
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs <= 0) throw new Error('--timeout-ms must be positive');
  if (!Number.isFinite(args.pollMs) || args.pollMs <= 0) throw new Error('--poll-ms must be positive');
  return args;
}

function usage() {
  return 'Usage: node tests/verification/e2e/buster-simulator.mjs [--timeout-ms <ms>] [--poll-ms <ms>]\n';
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function realE2EScenario() {
  return process.env.REAL_E2E_SCENARIO || 'success';
}

export function isRedisNoGroupError(error) {
  return /\bNOGROUP\b/.test(error?.message || String(error));
}

export function buildInvalidBusterCompletionIdentityArtifact(payload = {}) {
  const wrongRunId = `${payload?.run_id || 'missing-run'}-real-e2e-identity-mismatch`;
  return {
    artifact_type: 'buster_output',
    task_type: payload?.task_type || null,
    module_id: payload?.module_id || payload?.module || null,
    run_id: wrongRunId,
    attempt: payload?.attempt,
    dispatch_id: payload?.dispatch_id,
    completion_key: `${wrongRunId}:${payload?.attempt || 'missing-attempt'}:${payload?.dispatch_id || payload?.session_key || 'missing-dispatch'}`,
    status: 'PASS',
    summary: 'Intentional real E2E Buster output identity mismatch.',
    reason: 'REAL_E2E_EXPECTED_BUSTER_INVALID_COMPLETION_IDENTITY',
    completed_at: new Date().toISOString(),
  };
}

function writeInvalidBusterCompletionIdentityArtifact(payload = {}) {
  const outputFilePath = resolveBusterOutputFilePath(payload);
  const artifact = buildInvalidBusterCompletionIdentityArtifact(payload);
  fs.mkdirSync(path.dirname(outputFilePath), { recursive: true });
  const tmpPath = `${outputFilePath}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(artifact, null, 2)}\n`);
  JSON.parse(fs.readFileSync(tmpPath, 'utf8'));
  fs.renameSync(tmpPath, outputFilePath);
  return { outputFilePath, artifact };
}

function busterTaskProcessorForScenario() {
  if (realE2EScenario() === 'buster-module-infra-failure') {
    assertScenarioMutationChannel(realE2EScenario(), 'buster-simulator');
    return async (payload) => {
      const moduleId = payload?.module_id || payload?.module || null;
      const taskType = payload?.task_type || null;
      if (moduleId !== '01-nginx' || taskType !== 'module_test') return processTask(payload);

      const reason = 'REAL_E2E_BUSTER_INFRA_UNAVAILABLE: simulated Buster worker infrastructure failure';
      process.stdout.write(`${JSON.stringify({
        ok: true,
        phase: 'buster-simulator-infra-failure',
        scenario: realE2EScenario(),
        module_id: moduleId,
        task_type: taskType,
        failure_class: 'infra_error',
      })}\n`);
      const completion = await publishTaskCompletionWithArtifact(getRedisClient(), payload, {
        outcome: 'FAIL',
        reason,
        summary: reason,
        source: 'buster-pipeline',
        failureClass: 'infra_error',
        moduleId,
        artifactData: {
          real_e2e_expected_evidence: 'buster_module_infra_failure',
          failure_class: 'infra_error',
          suites: {
            infra: {
              suite: 'infra',
              status: 'FAIL',
              critical: true,
              findings: [{
                severity: 'critical',
                message: reason,
                rule: 'real-e2e-buster-infra-unavailable',
              }],
            },
          },
        },
      });
      return {
        outcome: 'FAIL',
        reason,
        completion: {
          attempted: true,
          terminal: true,
          stream: completion?.stream || payload?.completion_stream || null,
          error: null,
        },
      };
    };
  }

  if (realE2EScenario() === 'buster-module-timeout') {
    assertScenarioMutationChannel(realE2EScenario(), 'buster-simulator');
    return async (payload) => {
      const delayMs = Number(process.env.REAL_E2E_BUSTER_DELAY_MS || 5000);
      process.stdout.write(`${JSON.stringify({
        ok: true,
        phase: 'buster-simulator-delaying-task',
        scenario: realE2EScenario(),
        delay_ms: delayMs,
        module_id: payload?.module_id || payload?.module || null,
        task_type: payload?.task_type || null,
      })}\n`);
      await delay(delayMs);
      return processTask(payload);
    };
  }

  if (realE2EScenario() !== 'buster-invalid-completion-identity') return processTask;
  assertScenarioMutationChannel(realE2EScenario(), 'buster-simulator');
  return async (payload) => {
    const written = writeInvalidBusterCompletionIdentityArtifact(payload);
    process.stdout.write(`${JSON.stringify({
      ok: true,
      phase: 'buster-simulator-mutated-output-identity',
      scenario: realE2EScenario(),
      original_run_id: payload?.run_id || null,
      artifact_run_id: written.artifact.run_id,
      output_file: written.outputFilePath,
      module_id: payload?.module_id || payload?.module || null,
      task_type: payload?.task_type || null,
    })}\n`);
    const reason = 'REAL_E2E_EXPECTED_BUSTER_INVALID_COMPLETION_IDENTITY';
    const completion = await publishTaskCompletionWithArtifact(getRedisClient(), payload, {
      outcome: 'PASS',
      reason,
      summary: reason,
      source: 'buster-pipeline',
      failureClass: 'output_file_identity_mismatch',
      moduleId: payload?.module_id || payload?.module || null,
    });
    process.stdout.write(`${JSON.stringify({
      ok: true,
      phase: 'buster-simulator-published-identity-mismatch-completion',
      scenario: realE2EScenario(),
      completion_ok: completion?.ok ?? null,
      completion_skipped: completion?.skipped ?? null,
      completion_stream: completion?.stream || null,
      output_file_result: completion?.outputFileResult || null,
      module_id: payload?.module_id || payload?.module || null,
      dispatch_id: payload?.dispatch_id || null,
      session_key: payload?.session_key || null,
    })}\n`);
    return {
      outcome: 'FAIL',
      reason: completion?.outputFileResult?.reason || reason,
      completion: {
        attempted: true,
        terminal: true,
        stream: completion?.stream || payload?.completion_stream || null,
        error: null,
      },
    };
  };
}

export async function runBusterCompatibleSimulator({ timeoutMs = 30 * 60 * 1000, pollMs = 1000, signal = null } = {}) {
  const startedAt = Date.now();
  let loops = 0;
  const processTaskForScenario = busterTaskProcessorForScenario();
  await ensureTaskConsumerGroup();
  process.stdout.write(`${JSON.stringify({
    ok: true,
    phase: 'buster-simulator-started',
    scenario: realE2EScenario(),
    timeout_ms: timeoutMs,
    poll_ms: pollMs,
    swarm_config: process.env.SWARM_CONFIG || null,
  })}\n`);

  try {
    while (Date.now() - startedAt < timeoutMs) {
      if (signal?.aborted) {
        process.stdout.write(`${JSON.stringify({ ok: true, phase: 'buster-simulator-aborted', loops })}\n`);
        return { ok: true, loops, aborted: true };
      }
      loops += 1;
      try {
        await processOneQueuedTask(processTaskForScenario);
      } catch (error) {
        if (!isRedisNoGroupError(error)) throw error;
        process.stdout.write(`${JSON.stringify({
          ok: true,
          phase: 'buster-simulator-queue-closed',
          reason: 'REDIS_CONSUMER_GROUP_MISSING',
          loops,
        })}\n`);
        return { ok: true, loops, queue_closed: true };
      }
      await delay(pollMs);
    }
    return { ok: false, loops, reason: 'REAL_E2E_BUSTER_SIMULATOR_TIMEOUT' };
  } finally {
    await disconnectRedisClient();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      process.stdout.write(usage());
      process.exitCode = 0;
    } else {
      const result = await runBusterCompatibleSimulator(args);
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      process.exitCode = result.ok ? 0 : 1;
    }
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      ok: false,
      reason: 'REAL_E2E_BUSTER_SIMULATOR_FAILED',
      error: error?.message || String(error),
    }, null, 2)}\n`);
    process.exitCode = 1;
  }
}
