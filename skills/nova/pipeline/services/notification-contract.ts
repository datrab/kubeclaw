import { getRunId } from '../core/runtime.ts';
import { deepClone } from './serialization.ts';
import { canonicalExplicitRef, canonicalRef } from './contract-reference.ts';
import {
  isNotificationRecord as isRecord,
  notificationRecord as recordOrEmpty,
  optionalNotificationText as optionalText,
  requiredNotificationText as requiredText,
  firstNotificationText as firstText,
} from './notification-values.ts';
import {
  getBuiltinNotificationPluginDefinitions as buildBuiltinNotificationPluginDefinitions,
  observeDiscordNotification,
} from './notification-observers.ts';
export { observeDiscordNotification } from './notification-observers.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
type UnknownRecord = Record<string, any>;

const NOTIFICATION_HOOK_IDS: readonly string[] = Object.freeze([
  'pipeline.started',
  'pipeline.completed',
  'module.started',
  'module.completed',
  'gate.started',
  'gate.completed',
]);

function cloneRecordOrEmpty(value: unknown): UnknownRecord {
  return deepClone(recordOrEmpty(value));
}

function normalizeNotificationIds(hookId: string, ctx: UnknownRecord = {}, envelope: UnknownRecord = {}): UnknownRecord {
  const config = recordOrEmpty(ctx?.config);
  const explicitIds = recordOrEmpty(envelope?.ids);
  const payload = recordOrEmpty(envelope?.event?.payload);
  const runId = firstText(explicitIds.runId, explicitIds.run_id, ctx?.runId, getRunId(config), config?._runId, config?.run_id);
  const moduleId = firstText(explicitIds.moduleId, explicitIds.module_id, payload.module_id);
  const gateId = firstText(explicitIds.gateId, explicitIds.gate_id, payload.gate_id);
  const gateType = firstText(explicitIds.gateType, explicitIds.gate_type, payload.gate_type);
  const attempt = selectDefinedValue(() => (selectDefinedValue(() => (explicitIds.attempt), () => (payload.attempt))), () => (null));
  return {
    hookId,
    runId,
    moduleId,
    attempt,
    gateId,
    gateType,
    stageId: firstText(explicitIds.stageId, explicitIds.stage_id, hookId),
  };
}

function normalizeNotificationRefs(ids: UnknownRecord = {}, envelope: UnknownRecord = {}): UnknownRecord {
  const explicitRefs = recordOrEmpty(envelope?.refs);
  const runRef = selectDefinedValue(() => (canonicalExplicitRef(explicitRefs.runRef)), () => (canonicalRef('run', ids.runId)));
  const moduleAttemptRef = selectDefinedValue(() => (canonicalExplicitRef(explicitRefs.moduleAttemptRef)), () => ((ids.runId && ids.moduleId && ids.attempt != null ? `module_attempt:${ids.runId}:${ids.moduleId}:${ids.attempt}` : null)));
  const gateEvaluationRef = selectDefinedValue(() => (canonicalExplicitRef(explicitRefs.gateEvaluationRef)), () => ((ids.runId && ids.gateId && ids.attempt != null ? `gate_evaluation:${ids.runId}:${ids.gateId}:${ids.attempt}` : null)));
  const primaryRef = selectDefinedValue(() => (selectDefinedValue(() => (selectDefinedValue(() => (selectDefinedValue(() => (selectDefinedValue(() => (selectDefinedValue(() => (canonicalExplicitRef(explicitRefs.primaryRef)), () => (moduleAttemptRef))), () => (gateEvaluationRef))), () => (canonicalRef('module', ids.moduleId)))), () => (canonicalRef('gate', ids.gateId)))), () => (runRef))), () => (canonicalRef('stage', ids.stageId)));
  return {
    runRef,
    moduleAttemptRef,
    gateEvaluationRef,
    primaryRef,
  };
}

function normalizeFieldName(value: unknown): string {
  return String(selectDefinedValue(() => (optionalText(value)), () => (''))).toLowerCase().replace(/[_-]+/g, ' ');
}

function hasActionableValue(value: unknown): boolean {
  if (typeof value === 'string') return value.trim() !== '';
  if (typeof value === 'number') return Number.isFinite(value);
  return false;
}

function collectDiscordFields(discordPresentation: UnknownRecord = {}): UnknownRecord[] {
  const fields: UnknownRecord[] = [];
  if (Array.isArray(discordPresentation.fields)) fields.push(...discordPresentation.fields);
  if (Array.isArray(discordPresentation.embeds)) {
    for (const embed of discordPresentation.embeds) {
      if (Array.isArray(embed?.fields)) fields.push(...embed.fields);
    }
  }
  return fields;
}

function discordPresentationRequiresActionableContract(discordPresentation: UnknownRecord = {}): boolean {
  const explicitFlags = [
    discordPresentation.critical,
    discordPresentation.require_actionable,
    discordPresentation.requires_actionable_contract,
  ];
  if (explicitFlags.some((value: any) => value === true)) return true;
  const level = String(selectDefinedValue(() => (optionalText(discordPresentation.level)), () => (''))).toUpperCase();
  return ['WARN', 'WARNING', 'ERROR', 'CRITICAL', 'FAIL', 'FAILED', 'BLOCKED', 'DEGRADED'].includes(level);
}

function discordPresentationRequiresNextAction(discordPresentation: UnknownRecord = {}): boolean {
  return selectTruthyValue(() => (selectTruthyValue(() => (discordPresentation.critical === true), () => (discordPresentation.require_actionable === true))), () => (discordPresentation.requires_actionable_contract === true));
}

export function validateDiscordOperatorPresentation(discordPresentation: UnknownRecord = {}, ids: UnknownRecord = {}): string[] {
  const errors: string[] = [];
  if (!discordPresentationRequiresActionableContract(discordPresentation)) return errors;

  const fields = collectDiscordFields(discordPresentation);
  const fieldByName = new Map(fields.map((field: any) => [normalizeFieldName(field?.name), field?.value]));
  const verdictValues = [
    discordPresentation.verdict,
    discordPresentation.status,
    discordPresentation.outcome,
    discordPresentation.terminal_status,
    ...['verdict', 'status', 'outcome', 'terminal status', 'result'].map((name: any) => fieldByName.get(name)),
  ];
  const actionValues = [
    discordPresentation.next_action,
    discordPresentation.nextAction,
    discordPresentation.action,
    ...['next action', 'action', 'operator action'].map((name: any) => fieldByName.get(name)),
  ];
  const hasVerdict = verdictValues.some(hasActionableValue);
  const hasAction = actionValues.some(hasActionableValue);

  if (!hasVerdict) errors.push('critical Discord notification must include verdict/status/outcome');
  if (discordPresentationRequiresNextAction(discordPresentation) && !hasAction) {
    errors.push('critical Discord notification must include next action/action');
  }

  const hookId = optionalText(ids?.hookId);
  if (String(hookId).startsWith('module.') && !ids?.moduleId) {
    errors.push('module Discord notification must include ids.moduleId');
  }
  if (String(hookId).startsWith('gate.') && !ids?.gateId) {
    errors.push('gate Discord notification must include ids.gateId');
  }

  return errors;
}

export function buildNotificationEventInput(ctx: UnknownRecord = {}, hookId: string, envelope: UnknownRecord = {}): UnknownRecord {
  const ids = normalizeNotificationIds(hookId, ctx, envelope);
  const refs = normalizeNotificationRefs(ids, envelope);
  const event = isRecord(envelope?.event)
    ? deepClone(envelope.event)
    : {
        type: hookId,
        payload: {},
        emitter: 'nova/pipeline/services/telemetry',
      };
  return {
    refs,
    ids,
    snapshot: cloneRecordOrEmpty(envelope?.snapshot),
    artifacts: deepClone(envelope?.artifacts),
    summaries: deepClone(envelope?.summaries),
    stateSnapshot: cloneRecordOrEmpty(envelope?.stateSnapshot),
    executionContext: cloneRecordOrEmpty(envelope?.executionContext),
    event,
    presentation: cloneRecordOrEmpty(envelope?.presentation),
    occurredAt: selectDefinedValue(() => (optionalText(envelope?.occurredAt)), () => (new Date().toISOString())),
  };
}

export function validateNotificationEventInput(input: UnknownRecord = {}): string[] {
  const errors: string[] = [];
  const hookId = input?.ids?.hookId;
  if (!NOTIFICATION_HOOK_IDS.includes(hookId)) {
    errors.push(`notification hookId must be one of: ${NOTIFICATION_HOOK_IDS.join(', ')}`);
  }
  validateNotificationIdentity(input, hookId, errors);
  validateNotificationEnvelope(input, errors);
  validateNotificationPresentation(input, errors);
  return errors;
}

function validateNotificationIdentity(
  input: UnknownRecord,
  hookId: unknown,
  errors: string[],
): void {
  if (!input?.ids?.stageId || input.ids.stageId !== hookId) {
    errors.push('notification stageId must match hookId');
  }
  for (const [value, message] of [
    [input?.ids?.runId, 'notification ids.runId must be a non-empty string'],
    [input?.refs?.runRef, 'notification refs.runRef must be a non-empty string'],
    [input?.refs?.primaryRef, 'notification refs.primaryRef must be a non-empty string'],
  ]) {
    if (!value || typeof value !== 'string') errors.push(message);
  }
}

function validateNotificationEnvelope(input: UnknownRecord, errors: string[]): void {
  if (!input?.occurredAt || Number.isNaN(Date.parse(input.occurredAt))) {
    errors.push('notification occurredAt must be an ISO-8601 timestamp');
  }
  if (input.event !== undefined && !isRecord(input.event)) {
    errors.push('notification event must be an object when provided');
  }
  if (input.event && typeof input.event.type !== 'string') {
    errors.push('notification event.type must be a string when provided');
  }
}

function validateNotificationPresentation(input: UnknownRecord, errors: string[]): void {
  if (input.presentation !== undefined && !isRecord(input.presentation)) {
    errors.push('notification presentation must be an object when provided');
  }
  if (input?.presentation?.discord !== undefined) {
    if (!isRecord(input.presentation.discord)) {
      errors.push('notification presentation.discord must be an object when provided');
    } else {
      errors.push(...validateDiscordOperatorPresentation(input.presentation.discord, recordOrEmpty(input.ids)));
    }
  }
}

export function assertNotificationEventInput(input: UnknownRecord = {}): UnknownRecord {
  const errors = validateNotificationEventInput(input);
  if (errors.length) {
    throw new Error(`Invalid notification event input: ${errors.join('; ')}`);
  }
  return input;
}

export function getBuiltinNotificationPluginDefinitions(): UnknownRecord[] {
  return buildBuiltinNotificationPluginDefinitions(NOTIFICATION_HOOK_IDS);
}
