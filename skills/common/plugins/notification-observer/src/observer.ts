import type { ObserverDelivery, PluginInvocationContext } from '@kubeclaw/plugin-sdk';

const LABELS: Readonly<Record<string, string>> = Object.freeze({
  'run.started': 'Pipeline run started',
  'run.succeeded': 'Pipeline run succeeded',
  'run.failed': 'Pipeline run failed',
  'run.blocked': 'Pipeline run blocked',
  'run.cancelled': 'Pipeline run cancelled',
  'stage.started': 'Pipeline stage started',
  'stage.skipped': 'Pipeline stage skipped',
  'stage.succeeded': 'Pipeline stage passed',
  'stage.failed': 'Pipeline stage failed',
  'stage.blocked': 'Pipeline stage blocked',
  'stage.cancelled': 'Pipeline stage cancelled',
  'stage.retrying': 'Pipeline stage retrying',
  'stage.waiting': 'Pipeline stage waiting',
  'orchestrator.required': 'Orchestrator action required',
});
const SEVERITY: Readonly<Record<string, string>> = Object.freeze({
  'run.started': 'info',
  'run.succeeded': 'success',
  'run.failed': 'error',
  'run.blocked': 'warning',
  'run.cancelled': 'warning',
  'stage.started': 'info',
  'stage.skipped': 'info',
  'stage.succeeded': 'success',
  'stage.failed': 'error',
  'stage.blocked': 'warning',
  'stage.cancelled': 'warning',
  'stage.retrying': 'warning',
  'stage.waiting': 'warning',
  'orchestrator.required': 'warning',
});
const SENSITIVE = /(?:authorization|cookie|password|secret|token|api[_-]?key|credential)/i;

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 12) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 256).map((entry) => sanitize(entry, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .slice(0, 256)
      .map(([key, entry]) => [key, SENSITIVE.test(key) ? '[redacted]' : sanitize(entry, depth + 1)]));
  }
  if (typeof value === 'string') return value.length <= 8_192 ? value : `${value.slice(0, 8_192)}…`;
  return value;
}
function target(context: PluginInvocationContext): string {
  const configured = context.contract.config.target;
  if (typeof configured !== 'string' || configured.length === 0) throw new Error('NOTIFICATION_TARGET_INVALID');
  return configured;
}
function bounded(value: unknown, maximum = 8_192): string | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  return value.length <= maximum ? value : `${value.slice(0, maximum)}…`;
}
function titleCase(value: string): string {
  return value
    .replace(/[._:-]+/gu, ' ')
    .replace(/\b\p{L}/gu, (character) => character.toUpperCase());
}
function configuredText(
  config: Readonly<Record<string, unknown>>,
  key: string,
  maximum: number,
): string | undefined {
  return bounded(config[key], maximum);
}
function reasonCode(payload: Readonly<Record<string, unknown>>): string | null {
  const nested = payload.reason;
  const nestedCode = nested && typeof nested === 'object' && !Array.isArray(nested)
    ? (nested as Record<string, unknown>).code
    : undefined;
  return bounded(payload.reasonCode ?? payload.reason_code ?? nestedCode, 256) ?? null;
}
interface PresentationOptions {
  readonly pipelineLabel?: string;
  readonly modelLabel?: string;
  readonly stageLabels?: Readonly<Record<string, unknown>>;
}
export function lifecycleNotification(
  delivery: ObserverDelivery,
  maximum = 8_192,
  options: PresentationOptions = {},
): Readonly<Record<string, unknown>> {
  const type = delivery.event.type;
  const payload = delivery.event.payload as Record<string, unknown>;
  const runId = delivery.event.identity.runId;
  const stageId = delivery.event.identity.stageId ?? null;
  const agentRole = bounded(payload.agentRole, 256);
  const stageLabel = stageId
    ? agentRole
      ? `${titleCase(agentRole)} · ${bounded(options.stageLabels?.[stageId], 256) ?? titleCase(stageId)}`
      : bounded(options.stageLabels?.[stageId], 256) ?? titleCase(stageId)
    : null;
  const state = type.split('.').at(-1) ?? type;
  const title = stageLabel && type.startsWith('stage.')
    ? `${stageLabel} ${state === 'succeeded' ? 'passed' : state}`
    : LABELS[type] ?? type;
  const fields = [
    { name: 'Run ID', value: runId, inline: false },
    ...(stageId ? [{ name: 'Stage', value: stageId, inline: true }] : []),
    ...(bounded(options.modelLabel, 256)
      ? [{ name: 'Model', value: bounded(options.modelLabel, 256)!, inline: true }]
      : []),
  ];
  return Object.freeze({
    type,
    eventId: delivery.event.eventId,
    runId,
    stageId,
    severity: SEVERITY[type] ?? 'info',
    title,
    summary: bounded(payload.summary ?? payload.message, maximum) ?? title,
    reasonCode: reasonCode(payload),
    fields: Object.freeze(fields.map((field) => Object.freeze(field))),
    footer: `${bounded(options.pipelineLabel, 256) ?? 'KubeClaw Pipeline'} · ${runId}`,
    ...(typeof delivery.event.occurredAt === 'string'
      ? { occurredAt: delivery.event.occurredAt }
      : {}),
  });
}
export function previewNotification(delivery: ObserverDelivery): Readonly<Record<string, unknown>> {
  const payload = delivery.event.payload as Record<string, unknown>;
  const artifact = payload.artifact && typeof payload.artifact === 'object' && !Array.isArray(payload.artifact)
    ? payload.artifact as Record<string, unknown>
    : payload;
  return Object.freeze({
    type: 'preview.artifact.available',
    eventId: delivery.event.eventId,
    runId: delivery.event.identity.runId,
    stageId: delivery.event.identity.stageId ?? null,
    artifactId: delivery.event.identity.artifactId ?? null,
    artifact: Object.freeze({
      artifactId: bounded(artifact.artifactId, 512) ?? delivery.event.identity.artifactId ?? null,
      digest: bounded(artifact.digest, 256) ?? null,
      mediaType: bounded(artifact.mediaType, 256) ?? null,
      logicalName: bounded(artifact.logicalName, 512) ?? null,
    }),
  });
}
async function publish(payload: Readonly<Record<string, unknown>>, context: PluginInvocationContext): Promise<void> {
  await context.invoke('operator.request', {
    operation: 'publish',
    resource: { type: 'operator.target', canonicalId: target(context) },
    payload,
  });
}
export async function observe(delivery: ObserverDelivery, context: PluginInvocationContext): Promise<void> {
  const suppressed = context.contract.config.suppressEventTypes;
  if (Array.isArray(suppressed) && suppressed.includes(delivery.event.type)) return;
  const maximum = context.contract.config.maxMessageChars;
  const stageLabels = context.contract.config.stageLabels;
  await publish(
    lifecycleNotification(
      delivery,
      typeof maximum === 'number' ? maximum : 8_192,
      {
        pipelineLabel: configuredText(context.contract.config, 'pipelineLabel', 256),
        modelLabel: configuredText(context.contract.config, 'modelLabel', 256),
        stageLabels: stageLabels && typeof stageLabels === 'object' && !Array.isArray(stageLabels)
          ? stageLabels as Readonly<Record<string, unknown>>
          : undefined,
      },
    ),
    context,
  );
}
export async function deliverPreview(delivery: ObserverDelivery, context: PluginInvocationContext): Promise<void> {
  await publish(previewNotification(delivery), context);
}

export function auditRecord(delivery: ObserverDelivery): Readonly<Record<string, unknown>> {
  return Object.freeze({
    schemaVersion: 'pipeline-audit-event.v2',
    deliveryId: delivery.deliveryId,
    eventId: delivery.event.eventId,
    sequence: delivery.event.sequence,
    type: delivery.event.type,
    identity: sanitize(delivery.event.identity),
    occurredAt: delivery.event.occurredAt,
    causationId: delivery.event.causationId,
    payload: sanitize(delivery.event.payload),
  });
}

export async function recordAudit(
  delivery: ObserverDelivery,
  context: PluginInvocationContext,
): Promise<void> {
  await context.invoke('artifacts.write', {
    operation: 'put_json',
    resource: {
      type: 'artifact.object',
      canonicalId: `pipeline-audit:${delivery.event.eventId}`,
    },
    payload: {
      namespace: 'kubeclaw.pipeline-audit',
      mediaType: 'application/json',
      value: auditRecord(delivery),
    },
  });
}
