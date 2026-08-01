import { selectDefinedValue } from '../optional-absence.ts';
import { BusterCapabilityDeniedError, assertBusterCapabilities, requiredCapabilitiesForSuite } from '../services/capabilities.ts';
import { createFinding, createSuiteVerdict, SEVERITY, STATUS } from '../services/verdict-schema.ts';
import type { SuiteVerdict } from '../services/verdict-schema.ts';
import { emitPluginEvent } from '../services/telemetry.ts';
import { emitSuiteCompleted } from './suite-runner-telemetry.ts';
import { createSuiteRunnerValidationError } from './suite-runner-contracts.ts';
import type { CapabilityDeniedLike, SuiteContext, SuiteFunction, SuiteResult } from './suite-runner-contracts.ts';

function stringArray(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []; }

function capabilityDeniedVerdict(suiteName: string, error: CapabilityDeniedLike): SuiteVerdict {
  const action = typeof error.action === 'string' && error.action.trim() ? error.action.trim() : error.details?.blocked_action;
  return createSuiteVerdict(suiteName, STATUS.ERROR, { critical: true, error: error.message, reason: 'buster_capability_denied',
    findings: [createFinding(SEVERITY.CRITICAL, error.message, { rule: 'buster-capability-denied' })],
    metadata: { ...(action ? { blocked_action: action } : {}), missing_capabilities: stringArray(error.missing_capabilities),
      required_capabilities: stringArray(error.details?.required_capabilities), configured_capabilities: stringArray(error.details?.configured_capabilities) } });
}

export async function runSuiteWithTimeout(suiteName: string, suiteFn: SuiteFunction, context: SuiteContext, timeoutMs: number): Promise<SuiteVerdict> {
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) throw createSuiteRunnerValidationError('suiteTimeout must be a positive integer', {
    reason: 'invalid_suite_timeout_ms', field: 'suiteTimeout', value: timeoutMs,
  });
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let acceptsEffects = true;
  const logSink = context.logSink ? (entry: Record<string, unknown>): void => { if (acceptsEffects && !controller.signal.aborted) context.logSink?.(entry); } : null;
  try {
    return await Promise.race([suiteFn({ ...context, logSink, suiteAbortSignal: controller.signal, suiteDeadlineMs: Date.now() + timeoutMs }),
      new Promise<SuiteVerdict>((_resolve, reject) => { timeout = setTimeout(() => { controller.abort(); reject(new Error(`Suite "${suiteName}" timed out after ${timeoutMs / 1000}s (safety limit)`)); }, timeoutMs); })]);
  } finally { acceptsEffects = false; if (timeout) clearTimeout(timeout); }
}

async function emitSuiteStarted(tctx: unknown, moduleId: string | undefined, suiteName: string, attempt: number | undefined): Promise<void> {
  const telemetry = tctx && typeof tctx === 'object' ? tctx as Record<string, unknown> : {};
  const gateId = telemetry.gateId ?? null;
  await emitPluginEvent(tctx, 'suite_started', { module_id: gateId ? null : moduleId,
    ...(gateId ? { gate_id: gateId, gate_type: telemetry.gateType ?? null } : {}), suite: suiteName, attempt });
}

export async function runOneSuite(input: { suiteName: string; suiteFn: SuiteFunction; context: SuiteContext; timeoutMs: number;
  telemetryContext: unknown; moduleId: string | undefined; attempt: number | undefined }): Promise<SuiteResult> {
  const { suiteName, context, telemetryContext, moduleId, attempt } = input;
  try {
    const required = requiredCapabilitiesForSuite(suiteName, context);
    if (required.length) assertBusterCapabilities(context, { suite: suiteName, action: `run ${suiteName} suite`, required });
  } catch (error) {
    if (!(error instanceof BusterCapabilityDeniedError)) throw error;
    const verdict = capabilityDeniedVerdict(suiteName, error);
    await emitSuiteCompleted(telemetryContext, moduleId, suiteName, verdict, attempt, Date.now());
    return verdict;
  }
  const start = Date.now();
  await emitSuiteStarted(telemetryContext, moduleId, suiteName, attempt);
  let result: SuiteVerdict;
  try {
    result = await runSuiteWithTimeout(suiteName, input.suiteFn, context, input.timeoutMs);
    if (!result.duration_ms) result.duration_ms = Date.now() - start;
  } catch (error) {
    result = createSuiteVerdict(suiteName, STATUS.ERROR, { critical: true, duration_ms: Date.now() - start,
      error: error instanceof Error ? error.message : 'Suite threw an unexpected error', findings: [] });
  }
  await emitSuiteCompleted(telemetryContext, moduleId, suiteName, result, attempt, start);
  return { ...result, duration_seconds: Math.round((Date.now() - start) / 1000) };
}
