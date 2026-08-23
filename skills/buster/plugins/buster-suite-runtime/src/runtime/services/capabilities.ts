import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// pipeline/services/capabilities.ts — Buster task capability contract
// Default-deny execution boundary for destructive/tool-heavy Buster surfaces.

import fs from 'fs';
import path from 'path';
import { sanitizeTelemetryPayload } from '../egress.ts';
import { resolveScopedPath } from '../security.ts';
import { arrayValue, objectRecord, selectPresentValue, textValue } from '../value-boundary.ts';

export const BUSTER_CAPABILITIES = Object.freeze({
  IMAGE_BUILD: 'image_build',
  KUBERNETES: 'kubernetes',
  BROWSER_AUTOMATION: 'browser_automation',
  LIGHTHOUSE: 'lighthouse',
  DISCORD_MEDIA: 'discord_media',
});

export const KNOWN_BUSTER_CAPABILITIES = Object.freeze(Object.values(BUSTER_CAPABILITIES));
const KNOWN = new Set(KNOWN_BUSTER_CAPABILITIES);
const CAPABILITY_DENIED_REASON = 'buster_capability_denied';
const DEFAULT_BLOCKED_ACTION = 'tool_execution';
const DEFAULT_ASSERTION_SUITE = 'task';
const CAPABILITY_ALERT_SEVERITY = 'CRITICAL';
type AnyRecord = Record<string, any>;

function contextCapabilitySource(context: AnyRecord = {}): unknown {
  if (context.capabilities !== undefined && context.capabilities !== null) return context.capabilities;
  if (context.payload?.capabilities !== undefined && context.payload.capabilities !== null) return context.payload.capabilities;
  return [];
}

function stderrErrorDetail(error: unknown): string {
  const errorRecord = error && typeof error === 'object' ? error as Record<string, unknown> : null;
  return typeof errorRecord?.message === 'string' && errorRecord.message ? errorRecord.message : String(error);
}

function missingCapabilityReason(missing = [], required = []) {
  const missingList = missing.join(', ');
  if (missingList) return `missing capability: ${missingList}`;
  return `missing capability: ${required.join(', ')}`;
}

export class BusterCapabilityDeniedError extends Error {
  code: string;
  details: Record<string, any>;
  suite?: string;
  action?: string;
  missing_capabilities: string[];

  constructor(message: string, details: Record<string, any> = {}) {
    super(message);
    this.name = 'BusterCapabilityDeniedError';
    this.code = 'BUSTER_CAPABILITY_DENIED';
    this.details = details;
    this.suite = selectTruthyValue(() => (details.suite), () => (undefined));
    this.action = selectTruthyValue(() => (details.action), () => (undefined));
    this.missing_capabilities = arrayValue(details.missing_capabilities);
  }
}

function splitCapabilityString(value: unknown): string[] {
  const raw = textValue(value);
  return raw
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function normalizeBusterCapabilities(value: unknown = []): string[] {
  const raw = typeof value === 'string' ? splitCapabilityString(value) : (Array.isArray(value) ? value : []);
  return [...new Set(raw.map((entry: unknown) => textValue(entry).trim()).filter(Boolean))];
}

function parseCapabilitiesEnv(value: unknown): string[] {
  return normalizeBusterCapabilities(value);
}

export function resolveContextCapabilities(context: AnyRecord = {}): string[] {
  return normalizeBusterCapabilities(contextCapabilitySource(context));
}

function hasBusterCapability(capabilities: unknown, capability: string): boolean {
  return normalizeBusterCapabilities(capabilities).includes(capability);
}

function missingBusterCapabilities(capabilities: unknown, required: unknown = []): string[] {
  const current = new Set(normalizeBusterCapabilities(capabilities));
  return normalizeBusterCapabilities(required).filter((capability) => !current.has(capability));
}

export function requiredCapabilitiesForSuite(suiteName: string, _context: Record<string, any> = {}): string[] {
  switch (suiteName) {
    case 'a11y':
    case 'e2e':
    case 'visual-reg':
      return [BUSTER_CAPABILITIES.BROWSER_AUTOMATION];
    case 'perf':
      return [BUSTER_CAPABILITIES.LIGHTHOUSE];
    default:
      return [];
  }
}

const DEFAULT_OPERATOR_ALERT_PATH = path.join('.swarm', 'logs', 'pipeline', 'operator-alerts.jsonl');

function containsParentTraversal(value: unknown): boolean {
  return textValue(value).split(/[\\/]+/).includes('..');
}

function resolveAlertTarget(candidate: unknown, field: string, validationPath: unknown = candidate): string | null {
  if (!candidate) return null;
  const raw = String(candidate);
  const validationRaw = String(validationPath);
  if (selectTruthyValue(() => (containsParentTraversal(validationRaw)), () => (containsParentTraversal(raw)))) throw new Error(`${field} must not contain parent traversal`);
  return resolveScopedPath(raw, {
    baseDir: process.cwd(),
    scopeDir: process.cwd(),
    field,
    scopeDescription: 'repository root',
  });
}

function normalizeAlertContext(context: AnyRecord = {}): AnyRecord {
  const payload = objectRecord(context.payload);
  return {
    project: selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (context.project), () => (context.config?.project))), () => (payload.project))), () => (null)),
    run_id: selectTruthyValue(() => (context.runId), () => (null)),
    module_id: selectTruthyValue(() => (context.moduleId), () => (null)),
    gate_id: selectTruthyValue(() => (context.gateId), () => (null)),
    task_type: selectTruthyValue(() => (payload.task_type), () => (null)),
    attempt: selectDefinedValue(() => (selectDefinedValue(() => (context.attempt), () => (payload.attempt))), () => (null)),
    dispatch_id: selectTruthyValue(() => (context.dispatchId), () => (null)),
    session_key: selectTruthyValue(() => (context.sessionKey), () => (null)),
  };
}

function alertTargets(context: AnyRecord = {}): string[] {
  const targets = [];
  const explicitCandidates = [
    context.logDir && [path.join(context.logDir, 'operator-alerts.jsonl'), 'logDir', context.logDir],
    context.testsLogDir && [path.join(context.testsLogDir, 'operator-alerts.jsonl'), 'testsLogDir', context.testsLogDir],
    context.pipelineLogPath && [path.join(path.dirname(context.pipelineLogPath), 'operator-alerts.jsonl'), 'pipelineLogPath', context.pipelineLogPath],
    context.pipelineRunLogPath && [path.join(path.dirname(context.pipelineRunLogPath), 'operator-alerts.jsonl'), 'pipelineRunLogPath', context.pipelineRunLogPath],
  ].filter(Boolean);
  const candidates = explicitCandidates.length > 0
    ? explicitCandidates
    : [[DEFAULT_OPERATOR_ALERT_PATH, 'operatorAlertPath', DEFAULT_OPERATOR_ALERT_PATH]];

  for (const [candidate, field, validationPath] of candidates) {
    try {
      targets.push(resolveAlertTarget(candidate, field, validationPath));
    } catch (error) {
      try {
        process.stderr.write(`[BUSTER-CAPABILITY] ignored unsafe durable operator alert target: ${stderrErrorDetail(error)}\n`);
      } catch (_stderrError) { /* INTENTIONAL_NONCRITICAL(fallback_reporting_failed): the authoritative operation must survive failure of this noncritical reporting channel. */
        // Durable-alert target filtering is best effort; the safe default remains.
      }
    }
  }
  return [...new Set(targets.filter((target): target is string => Boolean(target)))];
}

export function appendDurableOperatorAlert(context: Record<string, any> = {}, alert: Record<string, any> = {}): Record<string, any> {
  const record = sanitizeTelemetryPayload({
    v: 1,
    type: 'operator.alert',
    ts: new Date().toISOString(),
    source: 'buster',
    emitter: 'buster/pipeline/services/capabilities',
    severity: selectPresentValue(alert.severity, CAPABILITY_ALERT_SEVERITY),
    reason: selectPresentValue(alert.reason, CAPABILITY_DENIED_REASON),
    ...normalizeAlertContext(context),
    ...alert,
  });

  for (const target of alertTargets(context)) {
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.appendFileSync(target, `${JSON.stringify(record)}\n`);
    } catch (error) {
      try {
        process.stderr.write(`[BUSTER-CAPABILITY] durable operator alert write failed: ${stderrErrorDetail(error)}\n`);
      } catch (_stderrError) { /* INTENTIONAL_NONCRITICAL(fallback_reporting_failed): the authoritative operation must survive failure of this noncritical reporting channel. */
        // Durable-alert writes are best effort, but every target is attempted.
      }
    }
  }
  return record;
}

function buildCapabilityDeniedAlert({ suite = null, action, required = [], capabilities = [], missing = [], context = {} }: Record<string, any> = {}): Record<string, any> {
  return {
    reason: CAPABILITY_DENIED_REASON,
    who: suite ? `suite:${suite}` : 'buster_task',
    suite,
    blocked_action: selectPresentValue(action, DEFAULT_BLOCKED_ACTION),
    why: missingCapabilityReason(missing, required),
    required_capabilities: normalizeBusterCapabilities(required),
    configured_capabilities: normalizeBusterCapabilities(capabilities),
    missing_capabilities: normalizeBusterCapabilities(missing),
    ...normalizeAlertContext(context),
  };
}

export function assertBusterCapabilities(context: Record<string, any> = {}, { suite = null, action = 'tool_execution', required = [] }: Record<string, any> = {}): { ok: true; capabilities: string[] } {
  const capabilities = resolveContextCapabilities(context);
  const missing = missingBusterCapabilities(capabilities, required);
  if (missing.length === 0) return { ok: true, capabilities };

  const alert = buildCapabilityDeniedAlert({ suite, action, required, capabilities, missing, context });
  appendDurableOperatorAlert(context, alert);
  throw new BusterCapabilityDeniedError(
    `Buster capability denied for ${selectPresentValue(suite, DEFAULT_ASSERTION_SUITE)}: ${action} requires ${missing.join(', ')}`,
    alert,
  );
}
