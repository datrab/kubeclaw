import {
  AGENT_OBSERVABILITY_REDIS_DATA_FIELD, assertAgentObservabilityIngressEvent,
  selectAgentObservabilityStreamKind,
} from '../../agent-observability/src/index.ts';
import type { AgentObservabilityIngressEventV1 } from '../../agent-observability/src/index.ts';
import { quarantinePayload } from '../../portable-artifacts.ts';
import { mapAgentObservabilityEventToTelemetry } from './mapper.ts';
import { commitModelUsageSnapshot, prepareModelUsageAggregate } from './usage-aggregation.ts';
import { emitFailureError, errorMessage, streamKindForKey } from './consumer-values.ts';
import type { StreamEntry } from './consumer-boundary.ts';

async function parseEntry(owner: any, entry: StreamEntry, raw: string): Promise<AgentObservabilityIngressEventV1 | null> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    assertAgentObservabilityIngressEvent(parsed);
    const expectedKind = selectAgentObservabilityStreamKind(parsed.type);
    const actualKind = streamKindForKey(entry.stream);
    if (expectedKind === actualKind) return parsed;
    await owner.deadLetterAndAck(entry, `unexpected_${expectedKind}_event_on_${actualKind}_stream`, [`${parsed.type} belongs on ${expectedKind} stream`], raw);
  } catch (error: any) {
    const errors = Array.isArray(error?.errors) ? error.errors : [errorMessage(error)];
    await owner.deadLetterAndAck(entry, 'invalid_ingress_event', errors, raw);
  }
  return null;
}

async function entryArtifact(owner: any, ctx: unknown, event: AgentObservabilityIngressEventV1, entry: StreamEntry, raw: string): Promise<any | false> {
  try {
    return owner.publishArtifact(ctx, event, entry);
  } catch (error: any) {
    if (error?.code === 'PROHIBITED_EVIDENCE') {
      const config = ctx && typeof ctx === 'object' && 'config' in ctx ? (ctx as any).config : null;
      if (config) quarantinePayload(config, {
        reason_code: 'PROHIBITED_EVIDENCE', producer: 'openclaw-agent-observability-ingester',
        identity: event.identity ?? null, original_byte_length: new TextEncoder().encode(raw).byteLength,
      });
    }
    await owner.deadLetterAndAck(entry, 'artifact_publication_failed', [errorMessage(error)], raw);
    return false;
  }
}

async function emitEntry(owner: any, ctx: unknown, entry: StreamEntry, raw: string, event: AgentObservabilityIngressEventV1, artifact: any, eventId: string) {
  const aggregate = prepareModelUsageAggregate(ctx, event, { eventId });
  const emission = mapAgentObservabilityEventToTelemetry(event, { modelUsageAggregate: aggregate });
  if (!emission) { owner.stats.skipped += 1; await owner.ack(entry); return; }
  const payload = artifact ? { ...emission.payload, artifact_reference: artifact.reference, content_completeness: 'full' } : emission.payload;
  try {
    const result = await owner.emitEvent(ctx, emission.eventType, payload, emission.options);
    if (result && typeof result === 'object' && result.validationError) {
      await owner.deadLetterAndAck(entry, 'telemetry_payload_invalid', [String(result.validationError)], raw); return;
    }
    const failure = emitFailureError(result);
    if (failure) { await owner.deadLetterAndAck(entry, 'telemetry_emit_failed', [failure], raw); return; }
    commitModelUsageSnapshot(ctx, event, { eventId }); owner.stats.emitted += 1; await owner.ack(entry);
  } catch (error: any) {
    await owner.deadLetterAndAck(entry, 'telemetry_emit_failed', [errorMessage(error)], raw);
  }
}

export async function processIngesterEntry(owner: any, ctx: unknown, entry: StreamEntry): Promise<void> {
  owner.stats.read += 1;
  const raw = entry.data[AGENT_OBSERVABILITY_REDIS_DATA_FIELD];
  if (!raw) { await owner.deadLetterAndAck(entry, 'missing_data', ['Redis stream entry has no data field']); return; }
  const event = await parseEntry(owner, entry, raw);
  if (!event) return;
  const artifact = await entryArtifact(owner, ctx, event, entry, raw);
  if (artifact === false) return;
  await emitEntry(owner, ctx, entry, raw, event, artifact, `${entry.stream}:${entry.id}`);
}
