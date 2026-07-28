export async function observe(delivery, context) {
    await context.invoke('telemetry.emit', {
        operation: 'append',
        resource: { type: 'telemetry.event', canonicalId: delivery.event.type },
        payload: {
            schemaVersion: 'telemetry-envelope.v2',
            deliveryId: delivery.deliveryId,
            deliveryAttempt: delivery.attemptNumber,
            observer: delivery.observer,
            event: {
                eventId: delivery.event.eventId,
                sequence: delivery.event.sequence,
                type: delivery.event.type,
                identity: delivery.event.identity,
                occurredAt: delivery.event.occurredAt,
                causationId: delivery.event.causationId,
                payload: delivery.event.payload,
            },
        },
    });
}
