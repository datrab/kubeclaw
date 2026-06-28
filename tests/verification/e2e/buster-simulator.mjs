#!/usr/bin/env node

import { ensureTaskConsumerGroup, processOneQueuedTask, disconnectRedisClient } from '../../../skills/buster/pipeline/services/task-queue.ts';
import { processTask } from '../../../skills/buster/pipeline/services/task-lifecycle.ts';

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

function busterTaskProcessorForScenario() {
  if (realE2EScenario() === 'buster-module-timeout') {
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

  if (realE2EScenario() === 'buster-missing-output-file') {
    return (payload) => {
      const mutated = { ...payload };
      delete mutated.output_file;
      process.stdout.write(`${JSON.stringify({
        ok: true,
        phase: 'buster-simulator-mutated-missing-output-file',
        scenario: realE2EScenario(),
        original_output_file: payload?.output_file || null,
        module_id: payload?.module_id || payload?.module || null,
        task_type: payload?.task_type || null,
      })}\n`);
      return processTask(mutated);
    };
  }

  if (realE2EScenario() !== 'buster-invalid-completion-identity') return processTask;
  return (payload) => {
    const mutated = {
      ...payload,
      run_id: `${payload?.run_id || 'missing-run'}-real-e2e-identity-mismatch`,
    };
    process.stdout.write(`${JSON.stringify({
      ok: true,
      phase: 'buster-simulator-mutated-completion-identity',
      scenario: realE2EScenario(),
      original_run_id: payload?.run_id || null,
      emitted_run_id: mutated.run_id,
      module_id: payload?.module_id || payload?.module || null,
      task_type: payload?.task_type || null,
    })}\n`);
    return processTask(mutated);
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
      await processOneQueuedTask(processTaskForScenario);
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
