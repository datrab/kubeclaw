#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// Buster Pipeline — Task Processing & Session Monitor
// ═══════════════════════════════════════════════════════════════
//
// Runtime responsibilities:
//
//  1. Start the Buster process: gateway readiness, startup recovery,
//     namespace-lease cleanup, Redis consumer group setup,
//     then task polling.
//  2. Handle process shutdown through active-session termination, bounded
//     cleanup, Redis disconnect, and process diagnostics.
//
// Public surface policy: this entrypoint intentionally exposes only the
// runtime start/status API. Helper modules own their own exports; the old
// broad helper barrel was deleted during Phase 5 P5-B01.

import fs from 'fs';
import { fileURLToPath } from 'url';
import { sleep } from './pipeline/timing.ts';

declare const process: {
  argv: string[];
  env: Record<string, string | undefined>;
  exit(code?: number): never;
  on(event: 'SIGTERM' | 'SIGINT', listener: () => void): void;
};

import { terminateActiveSession } from './pipeline/agents/session-termination.ts';
import { resolveGatewayInvokeUrl } from './pipeline/integrations/gateway.ts';

import {
  appendBusterProcessDiagnostic,
  buildBusterProcessDiagnosticRecord,
  reportBusterRuntimeDiagnostic,
  safeErrorMessage,
} from './pipeline/services/runtime-diagnostics.ts';
import { doResourceCleanup } from './pipeline/services/pipeline-helpers.ts';
import { loadBusterRuntimePolicy, loadBusterSessionPolicies } from './pipeline/services/runtime-policy.ts';
import {
  AGENT_NAME,
  CONSUMER_NAME,
  GROUP_NAME,
  getTaskStreamKey,
  disconnectRedisClient,
  ensureTaskConsumerGroup,
  processOneQueuedTask,
} from './pipeline/services/task-queue.ts';
import {
  startGatewayHealthMonitor,
  waitForGateway,
} from './pipeline/services/gateway-health.ts';
import { recoverOrphanedActiveSession } from './pipeline/services/orphan-recovery.ts';
import { getLastRunLogDir, processTask } from './pipeline/services/task-lifecycle.ts';

interface ShutdownOptions {
  exitCode?: number;
  cleanupStage?: string;
  emitGatewayDegraded?: boolean;
  reason?: string;
  detail?: string;
}

interface ResourceCleanupResult {
  ok?: boolean;
  errors?: string[];
  policy_denied?: Array<{ reason?: string }>;
}

export interface BusterStatus {
  lastRunLogDir: string | null;
}

type BusterEntrypointCommand = 'run' | 'status' | 'help';

interface BusterEntrypointDeps {
  exit: (code?: number) => never;
  getStatus: () => BusterStatus;
  runMain: () => Promise<void>;
}

const busterRuntimeState = {
  shuttingDown: false,
  loopAbort: new AbortController(),
};
const BUSTER_RUNTIME_LOOP_POLICY = Object.freeze({
  errorBackoffMs: 3000,
});
const SHUTDOWN_DEFAULT_EXIT_CODE = 0;
const SHUTDOWN_DEFAULT_CLEANUP_STAGE = 'shutdown';
const SHUTDOWN_GATEWAY_UNAVAILABLE_REASON = 'gateway_unavailable';

function writeBusterHeartbeat(): void {
  const runtimePolicy = loadBusterRuntimePolicy();
  fs.writeFileSync(runtimePolicy.heartbeat_path, `${Date.now()}\n`);
}

export function startBusterHeartbeat(): ReturnType<typeof setInterval> {
  const runtimePolicy = loadBusterRuntimePolicy();
  writeBusterHeartbeat();
  const interval = setInterval(() => {
    if (!busterRuntimeState.shuttingDown) writeBusterHeartbeat();
  }, runtimePolicy.heartbeat_interval_ms);
  interval.unref?.();
  return interval;
}

async function emitGatewayHealthDegraded({ reason, detail }: { reason: string; detail: string }): Promise<void> {
  appendBusterProcessDiagnostic(buildBusterProcessDiagnosticRecord({
    reason,
    detail,
  }));
}

function summarizeResourceCleanupFailure(cleanupResult: ResourceCleanupResult): string {
  const errors = cleanupResult.errors?.filter(Boolean) ?? [];
  if (errors.length > 0) return errors.join('; ');

  const deniedReasons = cleanupResult.policy_denied?.map((entry) => entry.reason).filter(Boolean) ?? [];
  if (deniedReasons.length > 0) return deniedReasons.join('; ');

  return 'startup_cleanup_failure_detail_missing';
}

export function assertStartupResourceCleanupComplete(cleanupResult: ResourceCleanupResult | null | undefined): void {
  if (cleanupResult?.ok !== false) return;
  const detail = summarizeResourceCleanupFailure(cleanupResult);
  reportBusterRuntimeDiagnostic({
    component: 'buster_cleanup',
    surface: 'startup',
    reason: 'startup_cleanup_incomplete',
    detail,
  });
  throw new Error(`BUSTER_STARTUP_CLEANUP_INCOMPLETE: ${detail}`);
}

export function getBusterStatus(): BusterStatus {
  return {
    lastRunLogDir: getLastRunLogDir(),
  };
}

export function getBusterEntrypointUsage(): string {
  return [
    'Usage: buster-pipeline [--status|--help]',
    '',
    'Options:',
    '  --status  Print current Buster status as JSON',
    '  --help    Print this help text',
  ].join('\n');
}

export function parseBusterEntrypointArgs(argv: string[] = process.argv): BusterEntrypointCommand {
  const args = argv.slice(2);
  if (args.length === 0) return 'run';
  if (args.length === 1 && args[0] === '--status') return 'status';
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) return 'help';
  throw new Error(`Unknown Buster pipeline argument(s): ${args.join(' ')}`);
}

export async function shutdown(signal: string, opts: ShutdownOptions = {}): Promise<void> {
  if (busterRuntimeState.shuttingDown) return;
  busterRuntimeState.shuttingDown = true;
  busterRuntimeState.loopAbort.abort(new Error(`Buster shutdown requested by ${signal}`));
  const exitCode = opts.exitCode ?? SHUTDOWN_DEFAULT_EXIT_CODE;
  const cleanupStage = opts.cleanupStage ?? SHUTDOWN_DEFAULT_CLEANUP_STAGE;
  console.log(`\n[SHUTDOWN] ${signal} received. Cleaning up...`);
  if (opts.emitGatewayDegraded) {
    await emitGatewayHealthDegraded({
      reason: opts.reason ?? SHUTDOWN_GATEWAY_UNAVAILABLE_REASON,
      detail: opts.detail ?? `${signal} triggered structured shutdown`,
    }).catch((err: unknown) => console.warn(`[SHUTDOWN] Gateway degradation telemetry failed: ${safeErrorMessage(err)}`));
  }
  try {
    await terminateActiveSession(loadBusterSessionPolicies());
  } catch (killError: unknown) {
    reportBusterRuntimeDiagnostic({
      component: 'buster_session',
      surface: 'shutdown',
      reason: 'shutdown_kill_active_session_failed',
      detail: killError,
    });
  }
  try {
    const cleanupResult = await doResourceCleanup(cleanupStage, {});
    if (cleanupResult?.ok === false) {
      reportBusterRuntimeDiagnostic({
        component: 'buster_cleanup',
        surface: 'shutdown',
        reason: 'shutdown_cleanup_incomplete',
        detail: summarizeResourceCleanupFailure(cleanupResult),
      });
    }
  } catch (cleanupError: unknown) {
    reportBusterRuntimeDiagnostic({
      component: 'buster_cleanup',
      surface: 'shutdown',
      reason: 'shutdown_cleanup_failed',
      detail: cleanupError,
    });
  }
  try {
    await disconnectRedisClient();
  } catch (disconnectError: unknown) {
    reportBusterRuntimeDiagnostic({
      component: 'buster_redis',
      surface: 'shutdown',
      reason: 'shutdown_redis_disconnect_failed',
      detail: disconnectError,
    });
  }
  console.log(`[SHUTDOWN] ✅ Clean exit (code ${exitCode}).`);
  process.exit(exitCode);
}

process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
process.on('SIGINT',  () => { void shutdown('SIGINT'); });

export async function main(): Promise<void> {
  console.log('[BUSTER PIPELINE v2.0] Starting (Buster — Suite Runner + ACP)...');
  console.log(` Agent:   ${AGENT_NAME}`);
  console.log(` Stream:  ${getTaskStreamKey()}`);
  console.log(` Gateway: ${resolveGatewayInvokeUrl()}`);

  await waitForGateway({ shutdown });
  startBusterHeartbeat();
  const startupRecovery = await recoverOrphanedActiveSession();
  if (startupRecovery?.ok === false) {
    console.error('[RECOVERY] ❌ Buster startup recovery blocked because persisted session evidence is not lifecycle authority.');
    throw new Error('BUSTER_RECOVERY_BLOCKED: persisted session evidence is diagnostic-only');
  }
  assertStartupResourceCleanupComplete(await doResourceCleanup('startup', {}));
  startGatewayHealthMonitor({ isShuttingDown: () => busterRuntimeState.shuttingDown, shutdown });

  const consumerGroup = await ensureTaskConsumerGroup();
  console.log(`[REDIS] Consumer group ${consumerGroup.created ? 'created' : 'exists'}: ${GROUP_NAME}`);

  console.log(`[REDIS] Pending reclaim enabled: idle >= ${loadBusterRuntimePolicy().task_pending_reclaim_idle_ms}ms → ${CONSUMER_NAME}`);

  console.log('[BUSTER PIPELINE] ✅ Ready. Polling for tasks...');
  while (!busterRuntimeState.shuttingDown) {
    try {
      await processOneQueuedTask(processTask);
    } catch (e: unknown) {
      reportBusterRuntimeDiagnostic({
        component: 'buster_runtime_loop',
        surface: 'task_poll_loop',
        reason: 'task_poll_loop_failed',
        detail: e,
      });
      console.error('[LOOP]', safeErrorMessage(e));
      try {
        await sleep(BUSTER_RUNTIME_LOOP_POLICY.errorBackoffMs, { signal: busterRuntimeState.loopAbort.signal });
      } catch (sleepError: unknown) {
        if (!busterRuntimeState.shuttingDown) throw sleepError;
      }
    }
  }
}

export async function handleBusterEntrypoint(
  argv: string[] = process.argv,
  deps: BusterEntrypointDeps = { exit: process.exit, getStatus: getBusterStatus, runMain: main },
): Promise<void> {
  let command: BusterEntrypointCommand;
  try {
    command = parseBusterEntrypointArgs(argv);
  } catch (error: unknown) {
    console.error(safeErrorMessage(error));
    console.error(getBusterEntrypointUsage());
    return deps.exit(1);
  }
  if (command === 'status') {
    console.log(JSON.stringify(deps.getStatus(), null, 2));
    return deps.exit(0);
  }
  if (command === 'help') {
    console.error(getBusterEntrypointUsage());
    return deps.exit(0);
  }
  await deps.runMain();
}

const currentPath = fs.realpathSync(fileURLToPath(import.meta.url));
const entryArg = process.argv[1];
const entryPath = entryArg && fs.existsSync(entryArg) ? fs.realpathSync(entryArg) : entryArg;

if (currentPath === entryPath) {
  await handleBusterEntrypoint();
}
