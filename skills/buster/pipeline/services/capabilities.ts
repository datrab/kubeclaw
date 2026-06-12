// pipeline/services/capabilities.ts — Buster task capability contract
// Default-deny execution boundary for destructive/tool-heavy Buster surfaces.

import fs from 'fs';
import path from 'path';
import { sanitizeTelemetryPayload } from '../redaction.ts';
import { resolveScopedPath } from '../security.ts';

export const BUSTER_CAPABILITIES = Object.freeze({
  STATIC_WEB_SERVER: 'static_web_server',
  CONTAINER_RUNTIME: 'container_runtime',
  KUBERNETES_API: 'kubernetes_api',
  BROWSER_AUTOMATION: 'browser_automation',
  LIGHTHOUSE: 'lighthouse',
  DISCORD_MEDIA: 'discord_media',
  IMAGE_PREPULL: 'image_prepull',
});

export const KNOWN_BUSTER_CAPABILITIES = Object.freeze(Object.values(BUSTER_CAPABILITIES));
const KNOWN = new Set(KNOWN_BUSTER_CAPABILITIES);

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
    this.suite = details.suite || undefined;
    this.action = details.action || undefined;
    this.missing_capabilities = details.missing_capabilities || [];
  }
}

function splitCapabilityString(value) {
  return String(value || '')
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function normalizeBusterCapabilities(value = []) {
  const raw = typeof value === 'string' ? splitCapabilityString(value) : (Array.isArray(value) ? value : []);
  return [...new Set(raw.map((entry) => String(entry || '').trim()).filter(Boolean))];
}

export function unknownBusterCapabilities(value = []) {
  return normalizeBusterCapabilities(value).filter((entry) => !KNOWN.has(entry));
}

export function parseCapabilitiesEnv(value = '') {
  return normalizeBusterCapabilities(value);
}

export function resolveContextCapabilities(context = {}) {
  return normalizeBusterCapabilities(
    context.capabilities
      ?? context.payload?.capabilities
      ?? [],
  );
}

export function hasBusterCapability(capabilities, capability) {
  return normalizeBusterCapabilities(capabilities).includes(capability);
}

export function missingBusterCapabilities(capabilities, required = []) {
  const current = new Set(normalizeBusterCapabilities(capabilities));
  return normalizeBusterCapabilities(required).filter((capability) => !current.has(capability));
}

export function requiredCapabilitiesForSuite(suiteName: string, context: Record<string, any> = {}): string[] {
  const serve = context.config?.serve || context.payload?.test_config?.serve || {};
  switch (suiteName) {
    case 'build':
      return [(serve.type || 'static') === 'server'
        ? BUSTER_CAPABILITIES.CONTAINER_RUNTIME
        : BUSTER_CAPABILITIES.STATIC_WEB_SERVER];
    case 'k8s':
      return [BUSTER_CAPABILITIES.CONTAINER_RUNTIME, BUSTER_CAPABILITIES.KUBERNETES_API];
    case 'a11y':
    case 'e2e':
    case 'visual-reg':
      return [BUSTER_CAPABILITIES.BROWSER_AUTOMATION];
    case 'perf':
      return [BUSTER_CAPABILITIES.LIGHTHOUSE];
    case 'health':
      return Array.isArray(serve.smoke_paths) && serve.smoke_paths.length > 0
        ? [BUSTER_CAPABILITIES.BROWSER_AUTOMATION]
        : [];
    default:
      return [];
  }
}

const DEFAULT_OPERATOR_ALERT_PATH = path.join('.swarm', 'logs', 'pipeline', 'operator-alerts.jsonl');

function containsParentTraversal(value) {
  return String(value || '').split(/[\\/]+/).includes('..');
}

function resolveAlertTarget(candidate, field, validationPath = candidate) {
  if (!candidate) return null;
  const raw = String(candidate);
  const validationRaw = String(validationPath);
  if (containsParentTraversal(validationRaw) || containsParentTraversal(raw)) throw new Error(`${field} must not contain parent traversal`);
  return resolveScopedPath(raw, {
    baseDir: process.cwd(),
    scopeDir: process.cwd(),
    field,
    scopeDescription: 'repository root',
  });
}

function normalizeAlertContext(context = {}) {
  const payload = context.payload || {};
  return {
    project: context.project || context.config?.project || payload.project || null,
    run_id: context.runId || context.run_id || payload.run_id || null,
    module_id: context.moduleId || context.module || payload.module_id || payload.module || null,
    gate_id: context.gateId || context.gate_id || payload.gate_id || null,
    task_type: payload.task_type || null,
    attempt: context.attempt ?? payload.attempt ?? null,
    dispatch_id: context.dispatchId || context.dispatch_id || payload.dispatch_id || null,
    session_key: context.sessionKey || context.session_key || null,
  };
}

function alertTargets(context = {}) {
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
        process.stderr.write(`[BUSTER-CAPABILITY] ignored unsafe durable operator alert target: ${error?.message || error}\n`);
      } catch (_stderrError) {
        // Durable-alert target filtering is best effort; the safe default remains.
      }
    }
  }
  return [...new Set(targets.filter(Boolean))];
}

export function appendDurableOperatorAlert(context: Record<string, any> = {}, alert: Record<string, any> = {}): Record<string, any> {
  const record = sanitizeTelemetryPayload({
    v: 1,
    type: 'operator.alert',
    ts: new Date().toISOString(),
    source: 'buster',
    emitter: 'buster/pipeline/services/capabilities',
    severity: alert.severity || 'CRITICAL',
    reason: alert.reason || 'buster_capability_denied',
    ...normalizeAlertContext(context),
    ...alert,
  });

  for (const target of alertTargets(context)) {
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.appendFileSync(target, `${JSON.stringify(record)}\n`);
    } catch (error) {
      try {
        process.stderr.write(`[BUSTER-CAPABILITY] durable operator alert write failed: ${error?.message || error}\n`);
      } catch (_stderrError) {
        // Durable-alert writes are best effort, but every target is attempted.
      }
    }
  }
  return record;
}

export function buildCapabilityDeniedAlert({ suite = null, action, required = [], capabilities = [], missing = [], context = {} }: Record<string, any> = {}): Record<string, any> {
  return {
    reason: 'buster_capability_denied',
    who: suite ? `suite:${suite}` : 'buster_task',
    suite,
    blocked_action: action || 'tool_execution',
    why: `missing capability: ${missing.join(', ') || required.join(', ')}`,
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
    `Buster capability denied for ${suite || 'task'}: ${action} requires ${missing.join(', ')}`,
    alert,
  );
}
