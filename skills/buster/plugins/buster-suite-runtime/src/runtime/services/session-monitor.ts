import { getAcpMonitorConfig } from '../agents/acp-monitor.js';
import { terminateSession } from '../agents/session-termination.js';
import {
  createMonitorRuntime, emitMonitorState, enforceHardTimeout, handleMonitorRateLimit,
  startMonitorAdapter, stopMonitorAdapter, syncGatewayHealth, terminalOutcome, waitForMonitorState,
} from './session-monitor-runtime.js';
import type { MonitorRuntime } from './session-monitor-runtime.js';

type AnyRecord = Record<string, any>;

function timeoutError(runtime: MonitorRuntime, error: unknown): boolean {
  if (runtime.hardDeadlineMs === null || !error || typeof error !== 'object') return false;
  const record = error as AnyRecord;
  return record.code === 'PIPELINE_EVENT_WAIT_TIMEOUT' || record.code === 'BUDGET_EXHAUSTED' || record.name === 'BudgetExhaustedError';
}

async function nextMonitorState(runtime: MonitorRuntime): Promise<AnyRecord> {
  try { return await waitForMonitorState(runtime); }
  catch (error) { if (timeoutError(runtime, error)) return { outcome: await enforceHardTimeout(runtime) }; throw error; }
}

async function processMonitorState(runtime: MonitorRuntime, event: AnyRecord, state: AnyRecord): Promise<AnyRecord | null> {
  runtime.previous = state;
  await emitMonitorState(runtime, state);
  await syncGatewayHealth(runtime, state);
  if (event.type === 'acp.transcript.delta' && Array.isArray(state.transcript?.newLines) && state.transcript.newLines.length) {
    runtime.logger.info('MONITOR', 'Transcript delta observed through diagnostic ACP monitor', { lines: state.transcript.newLines.length });
  }
  const rateLimit = await handleMonitorRateLimit(runtime, state);
  return rateLimit ?? terminalOutcome(state);
}

async function runMonitorLoop(runtime: MonitorRuntime): Promise<AnyRecord> {
  startMonitorAdapter(runtime);
  try {
    while (runtime.hardDeadlineMs === null || runtime.now() < runtime.hardDeadlineMs) {
      const next = await nextMonitorState(runtime);
      if (next.outcome) return next.outcome;
      if (!next.state) continue;
      const outcome = await processMonitorState(runtime, next.event, next.state);
      if (outcome) return outcome;
    }
    return enforceHardTimeout(runtime);
  } finally { await stopMonitorAdapter(runtime, 'monitor_done'); }
}

export async function monitorSession(childSessionKey: string, streamLogPath: string | null, payload: AnyRecord = {}, telemetryContext: unknown = null, meta: AnyRecord = {}): Promise<AnyRecord> {
  void getAcpMonitorConfig;
  void terminateSession;
  const runtime = createMonitorRuntime(childSessionKey, streamLogPath, payload, telemetryContext, meta);
  runtime.logger.info('MONITOR', `Monitoring session ${childSessionKey}`, { pollMs: runtime.monitorConfig.monitorPollMs,
    pollLimit: runtime.monitorConfig.pollLimit, timeoutSeconds: runtime.hardDeadlineMs ? runtime.timeoutSeconds : null });
  return runMonitorLoop(runtime);
}
