import {
  redactStructuredValue,
  type ObserverDelivery,
  type PluginInvocationContext,
} from '@kubeclaw/plugin-sdk';
export function projectAgentEvent(delivery: ObserverDelivery): Readonly<Record<string, unknown>> {
  return Object.freeze({
    schemaVersion: 'agent-observability-event.v2',
    deliveryId: delivery.deliveryId,
    eventId: delivery.event.eventId,
    eventType: delivery.event.type,
    sequence: delivery.event.sequence,
    identity: delivery.event.identity,
    occurredAt: delivery.event.occurredAt,
    payload: redactStructuredValue(delivery.event.payload),
  });
}
export async function ingest(delivery: ObserverDelivery, context: PluginInvocationContext): Promise<void> {
  await context.invoke('telemetry.emit', {
    operation: 'append',
    resource: { type: 'telemetry.event', canonicalId: delivery.event.type },
    payload: projectAgentEvent(delivery),
  });
}
export async function recordEvidence(delivery: ObserverDelivery, context: PluginInvocationContext): Promise<void> {
  await context.invoke('artifacts.write', {
    operation: 'put_json',
    resource: { type: 'artifact.object', canonicalId: `agent-evidence:${delivery.event.eventId}` },
    payload: {
      namespace: 'kubeclaw.agent-observability-evidence',
      mediaType: 'application/json',
      value: projectAgentEvent(delivery),
    },
  });
}
