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
function target(context: PluginInvocationContext): string {
  const configured = context.contract.config.target;
  if (typeof configured !== 'string' || configured.length === 0) throw new Error('NOTIFICATION_TARGET_INVALID');
  return configured;
}
function bounded(value: unknown, maximum: number): string | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  const normalized = value.replace(/[\u0000-\u001f\u007f]/gu, ' ');
  return normalized.length <= maximum ? normalized : `${normalized.slice(0, maximum - 1)}…`;
}
function messageSummary(value: unknown, maximum: number): string | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  const text = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, ' ');
  return text.length <= maximum ? text : `${text.slice(0, maximum - 1)}…`;
}
function firstNonNullish(...values: readonly unknown[]): unknown {
  return values.find((value) => value !== undefined && value !== null);
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
function reasonCode(payload: Readonly<Record<string, unknown>>, maximum: number): string | null {
  const nested = payload.reason;
  const nestedCode = nested && typeof nested === 'object' && !Array.isArray(nested)
    ? (nested as Record<string, unknown>).code
    : undefined;
  return bounded(firstNonNullish(payload.reasonCode, payload.reason_code, nestedCode), maximum) ?? null;
}
interface FieldLimits {
  readonly maxTitleChars: number;
  readonly maxReasonCodeChars: number;
  readonly maxArtifactIdChars: number;
  readonly maxArtifactDigestChars: number;
  readonly maxArtifactMediaTypeChars: number;
  readonly maxArtifactLogicalNameChars: number;
}
function fieldLimits(value: Readonly<Record<string, unknown>> | FieldLimits): FieldLimits {
  const fields = ["maxTitleChars", "maxReasonCodeChars", "maxArtifactIdChars", "maxArtifactDigestChars", "maxArtifactMediaTypeChars", "maxArtifactLogicalNameChars"] as const;
  for (const field of fields) {
    if (!Number.isSafeInteger(value[field]) || Number(value[field]) < 1
      || (field === 'maxTitleChars' && Number(value[field]) > 512)
      || (field === 'maxReasonCodeChars' && Number(value[field]) > 256)) throw new Error(`NOTIFICATION_FIELD_LIMIT_INVALID:${field}`);
  }
  return Object.freeze(Object.fromEntries(fields.map(field => [field, value[field]]))) as unknown as FieldLimits;
}
interface PresentationOptions extends FieldLimits {
  readonly maxLabelChars: number;
  readonly pipelineLabel?: string;
  readonly modelLabel?: string;
  readonly stageLabels?: Readonly<Record<string, unknown>>;
}
function stagePresentation(
  stageId: string | null,
  agentRole: string | undefined,
  labels: Readonly<Record<string, unknown>> | undefined,
  maximum: number,
): string | null {
  if (!stageId) return null;
  const stage = bounded(labels?.[stageId], maximum) ?? bounded(titleCase(stageId), maximum)!;
  return agentRole ? `${bounded(titleCase(agentRole), maximum)} · ${stage}` : stage;
}

function notificationTitle(type: string, stageLabel: string | null): string {
  if (!stageLabel || !type.startsWith('stage.')) return LABELS[type] ?? type;
  const state = type.split('.').at(-1) ?? type;
  return `${stageLabel} ${state === 'succeeded' ? 'passed' : state}`;
}

function notificationFields(
  runId: string,
  stageId: string | null,
  modelLabel: string | undefined,
  maximum: number,
): readonly Readonly<Record<string, unknown>>[] {
  const fields: Readonly<Record<string, unknown>>[] = [{ name: 'Run ID', value: runId, inline: false }];
  if (stageId) fields.push({ name: 'Stage', value: stageId, inline: true });
  const model = bounded(modelLabel, maximum);
  if (model) fields.push({ name: 'Model', value: model, inline: true });
  return fields;
}
export function lifecycleNotification(
  delivery: ObserverDelivery,
  maximum: number,
  options: PresentationOptions,
): Readonly<Record<string, unknown>> {
  if (!Number.isSafeInteger(maximum) || maximum < 256 || maximum > 8192) throw new Error('NOTIFICATION_MESSAGE_LIMIT_INVALID');
  if (!Number.isSafeInteger(options.maxLabelChars) || options.maxLabelChars < 1 || options.maxLabelChars > 256) throw new Error('NOTIFICATION_LABEL_LIMIT_INVALID');
  const limits = fieldLimits(options);
  const type = delivery.event.type;
  const payload = delivery.event.payload as Record<string, unknown>;
  const runId = delivery.event.identity.runId;
  const stageId = delivery.event.identity.stageId ?? null;
  const stageLabel = stagePresentation(stageId, bounded(payload.agentRole, options.maxLabelChars), options.stageLabels, options.maxLabelChars);
  const title = bounded(notificationTitle(type, stageLabel), limits.maxTitleChars)!;
  const fields = notificationFields(runId, stageId, options.modelLabel, options.maxLabelChars);
  return Object.freeze({
    type,
    eventId: delivery.event.eventId,
    runId,
    stageId,
    severity: SEVERITY[type] ?? 'info',
    title,
    summary: messageSummary(payload.summary ?? payload.message, maximum) ?? title,
    reasonCode: reasonCode(payload, limits.maxReasonCodeChars),
    fields: Object.freeze(fields.map((field) => Object.freeze(field))),
    footer: `${bounded(options.pipelineLabel ?? 'KubeClaw Pipeline', options.maxLabelChars)} · ${runId}`,
    ...(typeof delivery.event.occurredAt === 'string'
      ? { occurredAt: delivery.event.occurredAt }
      : {}),
  });
}
export function previewNotification(delivery: ObserverDelivery, options: FieldLimits): Readonly<Record<string, unknown>> {
  const limits = fieldLimits(options);
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
      artifactId: bounded(
        firstNonNullish(artifact.artifactId, delivery.event.identity.artifactId),
        limits.maxArtifactIdChars,
      ) ?? null,
      digest: bounded(artifact.digest, limits.maxArtifactDigestChars) ?? null,
      mediaType: bounded(artifact.mediaType, limits.maxArtifactMediaTypeChars) ?? null,
      logicalName: bounded(artifact.logicalName, limits.maxArtifactLogicalNameChars) ?? null,
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
  const maxLabelChars = context.contract.config.maxLabelChars as number;
  const stageLabels = context.contract.config.stageLabels;
  const pipelineLabel = configuredText(context.contract.config, 'pipelineLabel', maxLabelChars);
  const modelLabel = configuredText(context.contract.config, 'modelLabel', maxLabelChars);
  const configuredStageLabels = stageLabels && typeof stageLabels === 'object' && !Array.isArray(stageLabels)
    ? stageLabels as Readonly<Record<string, unknown>>
    : undefined;
  await publish(
    lifecycleNotification(
      delivery,
      maximum as number,
      {
        ...fieldLimits(context.contract.config),
        maxLabelChars,
        ...(pipelineLabel === undefined ? {} : { pipelineLabel }),
        ...(modelLabel === undefined ? {} : { modelLabel }),
        ...(configuredStageLabels === undefined ? {} : { stageLabels: configuredStageLabels }),
      },
    ),
    context,
  );
}
export async function deliverPreview(delivery: ObserverDelivery, context: PluginInvocationContext): Promise<void> {
  await publish(previewNotification(delivery, fieldLimits(context.contract.config)), context);
}
