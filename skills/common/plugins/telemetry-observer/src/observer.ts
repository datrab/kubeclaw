import type { ObserverDelivery, PluginInvocationContext } from '@kubeclaw/plugin-sdk';

const SENSITIVE = /(?:authorization|cookie|password|secret|token|api[_-]?key|credential)/i;
function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 16) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 1_000).map((entry) => sanitize(entry, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .slice(0, 1_000)
      .map(([key, entry]) => [key, SENSITIVE.test(key) ? '[redacted]' : sanitize(entry, depth + 1)]));
  }
  if (typeof value === 'string' && value.length > 65_536) return `${value.slice(0, 65_536)}[truncated]`;
  return value;
}

export function telemetryEnvelope(delivery: ObserverDelivery): Readonly<Record<string, unknown>> {
  return Object.freeze({
    schemaVersion: 'telemetry-envelope.v2',
    deliveryId: delivery.deliveryId,
    observer: delivery.observer,
    event: Object.freeze({
      eventId: delivery.event.eventId,
      sequence: delivery.event.sequence,
      type: delivery.event.type,
      identity: sanitize(delivery.event.identity),
      occurredAt: delivery.event.occurredAt,
      causationId: delivery.event.causationId,
      payload: sanitize(delivery.event.payload),
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
