const LABELS = Object.freeze({
    'run.started': 'Pipeline run started',
    'run.succeeded': 'Pipeline run succeeded',
    'run.failed': 'Pipeline run failed',
    'run.blocked': 'Pipeline run blocked',
    'run.cancelled': 'Pipeline run cancelled',
    'stage.blocked': 'Pipeline stage blocked',
    'orchestrator.required': 'Orchestrator action required',
});
function target(context) {
    const configured = context.contract.config.target;
    if (typeof configured !== 'string' || configured.length === 0)
        throw new Error('NOTIFICATION_TARGET_INVALID');
    return configured;
}
function bounded(value, maximum = 8_192) {
    if (typeof value !== 'string' || value.length === 0)
        return undefined;
    return value.length <= maximum ? value : `${value.slice(0, maximum)}…`;
}
export function lifecycleNotification(delivery) {
    const type = delivery.event.type;
    const payload = delivery.event.payload;
    return Object.freeze({
        type,
        eventId: delivery.event.eventId,
        runId: delivery.event.identity.runId,
        stageId: delivery.event.identity.stageId ?? null,
        summary: bounded(payload.summary ?? payload.message) ?? LABELS[type] ?? type,
    });
}
export function previewNotification(delivery) {
    const payload = delivery.event.payload;
    const artifact = payload.artifact && typeof payload.artifact === 'object' && !Array.isArray(payload.artifact)
        ? payload.artifact
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
async function publish(payload, context) {
    await context.invoke('operator.request', {
        operation: 'publish',
        resource: { type: 'operator.target', canonicalId: target(context) },
        payload,
    });
}
export async function observe(delivery, context) {
    await publish(lifecycleNotification(delivery), context);
}
export async function deliverPreview(delivery, context) {
    await publish(previewNotification(delivery), context);
}
