import { TELEMETRY_SINK_STAGE_ID } from './telemetry-sink-constants.ts';

type UnknownRecord = Record<string, any>;
const record = (value: unknown): UnknownRecord => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : {};
const actionable = (value: unknown) => typeof value === 'string' ? value.trim() !== '' : typeof value === 'number' && Number.isFinite(value);
const fieldName = (value: unknown) => String(value ?? '').trim().toLowerCase().replaceAll('_', ' ');

function severeDiscordAlert(discord: UnknownRecord): boolean {
  if ([discord.critical, discord.require_actionable, discord.requires_actionable_contract].some((value) => value === true)) return true;
  return ['WARN', 'WARNING', 'ERROR', 'CRITICAL', 'FAIL', 'FAILED', 'BLOCKED', 'DEGRADED']
    .includes(String(discord.level ?? '').trim().toUpperCase());
}

function actionableDiscordErrors(discord: UnknownRecord, input: UnknownRecord): string[] {
  if (!severeDiscordAlert(discord)) return [];
  const fields = Array.isArray(discord.fields) ? discord.fields : [];
  const byName = new Map(fields.map((field: any) => [fieldName(field?.name), field?.value]));
  const payload = record(input?.event?.payload);
  const ids = record(input?.ids);
  const groups = [
    ['verdict/status/outcome', [discord.verdict, discord.status, discord.outcome, discord.terminal_status,
      payload.verdict, payload.status, payload.new_status, payload.outcome, payload.terminal_status,
      ...['verdict', 'status', 'outcome', 'terminal status', 'result'].map((name) => byName.get(name))]],
    ['next action/action', [discord.next_action, discord.nextAction, discord.action,
      payload.next_action, payload.nextAction, payload.action, payload.operator_action,
      ...['next action', 'action', 'operator action'].map((name) => byName.get(name))]],
    ['run/module/gate identity', [ids.runId, payload.run_id, payload.module_id, payload.gate_id,
      payload.dispatch_id, payload.gateway_label, payload.session_key,
      ...['run id', 'run', 'module', 'module id', 'gate', 'gate id', 'dispatch', 'dispatch id',
        'gateway', 'gateway label', 'session', 'session key'].map((name) => byName.get(name))]],
  ] as const;
  return groups.filter(([, values]) => !values.some(actionable))
    .map(([label]) => `telemetry sink severe Discord alert must include ${label}`);
}

function validateDiscordFields(discord: UnknownRecord): string[] {
  const errors: string[] = [];
  if (discord.embeds !== undefined) errors.push('telemetry sink presentation.discord.embeds is not supported; use title/description/fields');
  for (const key of ['level', 'title', 'description']) {
    if (discord[key] !== undefined && typeof discord[key] !== 'string') errors.push(`telemetry sink presentation.discord.${key} must be a string when provided`);
  }
  if (discord.fields !== undefined && !Array.isArray(discord.fields)) {
    errors.push('telemetry sink presentation.discord.fields must be an array when provided');
    return errors;
  }
  for (const [index, field] of (discord.fields ?? []).entries()) {
    if (!field || typeof field !== 'object' || Array.isArray(field)) errors.push(`telemetry sink presentation.discord.fields[${index}] must be an object`);
    else if (typeof field.name !== 'string' || typeof field.value !== 'string') errors.push(`telemetry sink presentation.discord.fields[${index}] must include string name and value`);
  }
  return errors;
}

function validateDiscord(input: UnknownRecord): string[] {
  const discord = input?.presentation?.discord;
  if (discord === undefined) return [];
  if (!discord || typeof discord !== 'object' || Array.isArray(discord)) return ['telemetry sink presentation.discord must be an object when provided'];
  return [...validateDiscordFields(discord), ...actionableDiscordErrors(discord, input)];
}

function validateIdentity(value: UnknownRecord): string[] {
  const errors: string[] = [];
  if (value?.ids?.stageId !== TELEMETRY_SINK_STAGE_ID) errors.push(`telemetry sink ids.stageId must be '${TELEMETRY_SINK_STAGE_ID}'`);
  for (const [path, candidate] of [['ids.runId', value?.ids?.runId], ['refs.runRef', value?.refs?.runRef], ['refs.primaryRef', value?.refs?.primaryRef]]) {
    if (!candidate || typeof candidate !== 'string') errors.push(`telemetry sink ${path} must be a non-empty string`);
  }
  return errors;
}

function validateEvent(value: UnknownRecord): string[] {
  if (!value.event || typeof value.event !== 'object' || Array.isArray(value.event)) return ['telemetry sink event must be an object'];
  const errors: string[] = [];
  if (!value.event.type || typeof value.event.type !== 'string') errors.push('telemetry sink event.type must be a non-empty string');
  if (value.event.payload !== undefined) {
    const invalidPayload = typeof value.event.payload !== 'object'
      ? true
      : Array.isArray(value.event.payload);
    if (invalidPayload) errors.push('telemetry sink event.payload must be an object when provided');
  }
  return errors;
}

export function validateTelemetrySinkInput(input: unknown = {}): string[] {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return ['telemetry sink input must be an object'];
  const value = input as UnknownRecord;
  const errors = [...validateIdentity(value), ...validateEvent(value), ...validateDiscord(value)];
  if (!value.occurredAt || Number.isNaN(Date.parse(value.occurredAt))) errors.push('telemetry sink occurredAt must be an ISO-8601 timestamp');
  return errors;
}

export function assertTelemetrySinkInput(input: UnknownRecord = {}): UnknownRecord {
  const errors = validateTelemetrySinkInput(input);
  if (errors.length) throw new Error(`Invalid telemetry sink input: ${errors.join('; ')}`);
  return input;
}
