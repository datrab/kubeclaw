import fs from 'fs';
import path from 'path';

export type DiscordRecord = Record<string, any>;
interface DiscordField { name?: unknown; value?: unknown; inline?: boolean }
export interface DiscordEmbed extends DiscordRecord { fields?: DiscordField[] }
export interface DiscordPayload { content?: unknown; embeds?: DiscordEmbed[]; files?: unknown[] }
export interface DiscordCorrelation extends DiscordRecord {
  module_id: string | null; gate_id: string | null; gate_type: string | null; project: string | null;
  run_id: string | null; attempt: string | number | null; dispatch_id: string | null; session_key: string | null;
  impact: string | null; action: string | null; evidence: string | null;
  log_dir: string | null; pipeline_log_path: string | null; pipeline_run_log_path: string | null;
  telemetry_context: DiscordRecord | null; telemetry_enabled: boolean | undefined; webhook_url: string | null;
}

export function resolveDiscordAuditTargets(correlation: Partial<DiscordCorrelation> = {}): string[] {
  const targets: string[] = [];
  if (correlation.log_dir) targets.push(path.join(correlation.log_dir, 'discord.jsonl'));
  if (correlation.pipeline_log_path) targets.push(path.join(path.dirname(correlation.pipeline_log_path), 'discord.jsonl'));
  if (correlation.pipeline_run_log_path) targets.push(path.join(path.dirname(correlation.pipeline_run_log_path), 'discord.jsonl'));
  return [...new Set(targets)];
}

export function resolveDiscordDeliveryReceiptTargets(correlation: Partial<DiscordCorrelation> = {}): string[] {
  const targets: string[] = [];
  if (correlation.pipeline_log_path) targets.push(path.join(path.dirname(correlation.pipeline_log_path), 'discord-deliveries.jsonl'));
  if (correlation.pipeline_run_log_path) targets.push(path.join(path.dirname(correlation.pipeline_run_log_path), 'discord-deliveries.jsonl'));
  return [...new Set(targets)];
}

interface ArtifactCallbacks {
  auditTargets(correlation: DiscordCorrelation): string[];
  receiptTargets(correlation: DiscordCorrelation): string[];
  degraded(correlation: DiscordCorrelation, surface: string, reason: string, detail: string): void;
  restored(correlation: DiscordCorrelation, surface: string, reason: string, detail: string): void;
  incident(correlation: DiscordCorrelation, classification: string, error: unknown, message: string, options?: DiscordRecord): void;
}

function operatorText(value: unknown): string {
  return value === undefined || value === null ? '' : String(value);
}

function fieldValueText(field: DiscordField = {}): string {
  const value = operatorText(field.value);
  return operatorText(field.name).trim().toLowerCase() === 'model'
    ? value.replace(/\bopenai-codex\//gi, 'openai/').replace(/\bcodex-(\d[\w.-]*)\b/gi, 'gpt-$1')
    : value;
}

function truncated(value: unknown, maxLength = 1024): string {
  const text = operatorText(value).trim();
  return text.length <= maxLength ? text : `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

function existingNames(embed: DiscordEmbed): Set<string> {
  return new Set((embed.fields || []).map((field) => operatorText(field.name).toLowerCase()));
}

function namedField(embed: DiscordEmbed, name: string): string | null {
  const field = (embed.fields || []).find((candidate) => operatorText(candidate.name).toLowerCase() === name.toLowerCase());
  const value = field ? fieldValueText(field) : '';
  return value || null;
}

function firstText(...values: Array<string | null>): string {
  for (const value of values) if (value) return value;
  return '';
}

function errorDetail(error: unknown): string {
  if (!error || typeof error !== 'object') return String(error);
  const record = error as DiscordRecord;
  if (record.code) return String(record.code);
  if (record.message) return String(record.message);
  return String(error);
}

function needsReplacement(name: string, value: unknown): boolean {
  const key = operatorText(name).toLowerCase();
  const text = operatorText(value);
  if (!text) return true;
  if (key === 'impact') return /^Buster reported an operator-visible event/i.test(text);
  if (key === 'action') return /(open latest\.json|inspect the run-scoped pipeline and Discord artifacts?|inspect.*artifacts?)/i.test(text);
  if (key === 'evidence') return /(run pipeline:|run discord:|buster diagnostic:|latest\.json|discord\.jsonl)/i.test(text);
  return false;
}

function subject(correlation: Partial<DiscordCorrelation>): string {
  if (correlation.gate_id) return `gate ${correlation.gate_id}`;
  if (correlation.module_id) return `module ${correlation.module_id}`;
  return 'this run';
}

function impactFromEmbed(embed: DiscordEmbed, correlation: Partial<DiscordCorrelation>): string {
  const status = namedField(embed, 'Status');
  const summary = firstText(namedField(embed, 'Summary'), namedField(embed, 'Issue'), operatorText(embed.description));
  const title = operatorText(embed.title) || 'Buster notification';
  return truncated(`${title} for ${subject(correlation)}${status ? ` reported ${status}` : ''}.${summary ? ` ${summary}` : ''}`);
}

function actionFromEmbed(embed: DiscordEmbed): string {
  const status = (namedField(embed, 'Status') || '').toUpperCase();
  if (status === 'PASS') return 'No operator action required; continue with the next pipeline step.';
  if (status === 'FAIL') return 'Fix the listed failed suite or infrastructure issue, then resume or rerun the pipeline step.';
  if (/spawned/i.test(operatorText(embed.title))) return 'Wait for the spawned Buster session to finish, then inspect the completion notification.';
  return 'Read the notification fields and act on the listed status, issue, or failure reason.';
}

function evidenceFromEmbed(embed: DiscordEmbed): string {
  const skipped = new Set(['impact', 'action', 'evidence', 'run', 'run id', 'attempt', 'dispatch', 'session']);
  const lines = (embed.fields || []).filter((field) => !skipped.has(operatorText(field.name).toLowerCase()))
    .map((field) => `${operatorText(field.name) || 'Missing field name'}: ${fieldValueText(field)}`).filter((line) => !line.endsWith(': '));
  if (lines.length) return truncated(lines.join('\n'));
  return truncated(`${operatorText(embed.title) || 'Notification'}: ${operatorText(embed.description) || 'No additional details provided.'}`);
}

function upsert(fields: DiscordField[], names: Set<string>, name: 'Impact' | 'Action' | 'Evidence', value: string): void {
  const key = name.toLowerCase();
  const index = fields.findIndex((field) => operatorText(field.name).toLowerCase() === key);
  if (index >= 0 && !needsReplacement(key, fields[index]?.value)) return;
  const replacement = { name, value: truncated(value), inline: false };
  if (index >= 0) fields[index] = { ...fields[index], ...replacement };
  else fields.push(replacement);
  names.add(key);
}

function appendIdentityFields(fields: DiscordField[], names: Set<string>, correlation: DiscordCorrelation): void {
  const candidates: Array<{ names: string[]; field: DiscordField; present: boolean }> = [
    { names: ['run', 'run id', 'run_id'], field: { name: 'Run', value: `\`${correlation.run_id}\``, inline: true }, present: Boolean(correlation.run_id) },
    { names: ['attempt'], field: { name: 'Attempt', value: `\`${correlation.attempt}\``, inline: true }, present: correlation.attempt !== null },
    { names: ['dispatch'], field: { name: 'Dispatch', value: `\`${correlation.dispatch_id}\``, inline: true }, present: Boolean(correlation.dispatch_id) },
    { names: ['gate'], field: { name: 'Gate', value: `\`${correlation.gate_id}\``, inline: true }, present: Boolean(correlation.gate_id) },
    { names: ['gate type', 'gate_type'], field: { name: 'Gate Type', value: `\`${correlation.gate_type}\``, inline: true }, present: Boolean(correlation.gate_type) },
    { names: ['session'], field: { name: 'Session', value: `\`${correlation.session_key}\``, inline: false }, present: Boolean(correlation.session_key) },
  ];
  for (const candidate of candidates) if (candidate.present && !candidate.names.some((name) => names.has(name))) fields.push(candidate.field);
}

export function appendDiscordCorrelation(embed: DiscordEmbed = {}, correlation: DiscordCorrelation): DiscordEmbed {
  const fields = (embed.fields || []).map((field) => ({ ...field, value: fieldValueText(field) }));
  const normalized = { ...embed, title: operatorText(embed.title), description: operatorText(embed.description), fields };
  const names = existingNames(embed);
  upsert(fields, names, 'Impact', needsReplacement('impact', correlation.impact) ? impactFromEmbed(normalized, correlation) : String(correlation.impact));
  upsert(fields, names, 'Action', needsReplacement('action', correlation.action) ? actionFromEmbed(normalized) : String(correlation.action));
  upsert(fields, names, 'Evidence', needsReplacement('evidence', correlation.evidence) ? evidenceFromEmbed(normalized) : String(correlation.evidence));
  appendIdentityFields(fields, names, correlation);
  return normalized;
}

function defaultActionability(correlation: DiscordCorrelation, key: 'impact' | 'action' | 'evidence'): string {
  if (key === 'impact') return correlation.gate_id ? `Buster reported a pipeline event for gate ${correlation.gate_id}.` : correlation.module_id ? `Buster reported a pipeline event for module ${correlation.module_id}.` : 'Buster reported a pipeline event.';
  if (key === 'action') return correlation.run_id ? `Read the notification content for run ${correlation.run_id}, then fix or resume according to the listed status.` : 'Read the notification content, then fix or resume according to the listed status.';
  return 'Use the structured Discord notification fields as the authoritative evidence for this event.';
}

function resolvedActionability(payload: DiscordPayload, correlation: DiscordCorrelation, key: 'impact' | 'action' | 'evidence'): string {
  if (!needsReplacement(key, correlation[key])) return String(correlation[key]);
  const label = `${key.charAt(0).toUpperCase()}${key.slice(1)}`;
  return namedField(payload.embeds?.[0] || {}, label) || defaultActionability(correlation, key);
}

export function persistDiscordArtifact(payload: DiscordPayload, correlation: DiscordCorrelation, callbacks: ArtifactCallbacks): void {
  const targets = callbacks.auditTargets(correlation);
  if (!targets.length) return;
  const entry = { ts: new Date().toISOString(), channel: 'discord', source: 'buster', ...correlation,
    actionability: { impact: resolvedActionability(payload, correlation, 'impact'), action: resolvedActionability(payload, correlation, 'action'), evidence: resolvedActionability(payload, correlation, 'evidence') }, payload };
  const failures: string[] = [];
  for (const target of targets) {
    try { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.appendFileSync(target, `${JSON.stringify(entry)}\n`); }
    catch (error) { failures.push(`${target}: ${errorDetail(error)}`); }
  }
  if (!failures.length) { callbacks.restored(correlation, 'audit_log', 'audit_write_failed', 'Buster Discord audit writes restored'); return; }
  const error = new Error(failures.join('; '));
  callbacks.degraded(correlation, 'audit_log', 'audit_write_failed', `Buster Discord audit write failed: ${failures.join('; ')}`);
  callbacks.incident(correlation, 'artifact_write_failed', error, 'Buster Discord artifact write failed', { level: 'DEBUG', scope: 'artifact' });
}

export function persistDiscordDeliveryReceipt(payload: DiscordPayload, correlation: DiscordCorrelation, level: string, result: DiscordRecord, callbacks: ArtifactCallbacks): void {
  const body = result.body && typeof result.body === 'object' ? result.body as DiscordRecord : {};
  const messageId = body.id ? body.id : result.message_id || null;
  const channelId = body.channel_id ? body.channel_id : result.channel_id || null;
  const receipt = { ts: new Date().toISOString(), source: 'buster', project: correlation.project, run_id: correlation.run_id, level, ok: true,
    http_status: result.status ?? 200, status_text: result.statusText ?? 'OK', message_id: messageId,
    channel_id: channelId, webhook_message_returned: Boolean(messageId),
    title: operatorText(payload.embeds?.[0]?.title) || null,
    correlation: { run_id: correlation.run_id, session_key: correlation.session_key, attempt: correlation.attempt, module_id: correlation.module_id,
      gate_id: correlation.gate_id, gate_type: correlation.gate_type, dispatch_id: correlation.dispatch_id } };
  for (const target of callbacks.receiptTargets(correlation)) {
    try { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.appendFileSync(target, `${JSON.stringify(receipt)}\n`); }
    catch (error) { callbacks.incident(correlation, 'delivery_receipt_write_failed', error, 'Buster Discord delivery receipt write failed', { level: 'DEBUG', scope: 'delivery_receipt' }); }
  }
}

export function persistDiscordAuditReceipt(payload: DiscordPayload, correlation: DiscordCorrelation, level: string, reason: string, callbacks: ArtifactCallbacks): void {
  persistDiscordDeliveryReceipt(payload, correlation, level, { status: 0, statusText: reason, message_id: null, channel_id: null, body: null }, callbacks);
}
