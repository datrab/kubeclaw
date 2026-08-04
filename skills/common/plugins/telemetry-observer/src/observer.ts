import {
  redactStructuredValue,
  type ObserverDelivery,
  type PluginInvocationContext,
} from '@kubeclaw/plugin-sdk';

export function telemetryEnvelope(delivery: ObserverDelivery): Readonly<Record<string, unknown>> {
  return Object.freeze({
    schemaVersion: 'telemetry-envelope.v2',
    deliveryId: delivery.deliveryId,
    observer: delivery.observer,
    event: Object.freeze({
      eventId: delivery.event.eventId,
      sequence: delivery.event.sequence,
      type: delivery.event.type,
      identity: redactStructuredValue(delivery.event.identity),
      occurredAt: delivery.event.occurredAt,
      causationId: delivery.event.causationId,
      payload: redactStructuredValue(delivery.event.payload),
    }),
  });
}

export async function observe(delivery: ObserverDelivery, context: PluginInvocationContext): Promise<void> {
  await context.invoke('telemetry.emit', {
    operation: 'append',
    resource: { type: 'telemetry.event', canonicalId: delivery.event.type },
    payload: telemetryEnvelope(delivery),
  });
}
