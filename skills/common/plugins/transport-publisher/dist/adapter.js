import crypto from 'node:crypto';
const TARGET_ID = /^[a-z][a-z0-9._-]{0,127}$/;
const PUBLICATION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const DEFAULT_MAX_PAYLOAD_BYTES = 262_144;
const MAX_PAYLOAD_BYTES = 1_048_576;
const MAX_JSON_DEPTH = 64;
function plainRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}
function exactKeys(value, allowed, code) {
    const accepted = new Set(allowed);
    if (Object.keys(value).some((key) => !accepted.has(key)))
        throw new Error(code);
}
function positiveInteger(value, fallback) {
    const resolved = value ?? fallback;
    if (!Number.isSafeInteger(resolved)
        || Number(resolved) < 1
        || Number(resolved) > MAX_PAYLOAD_BYTES) {
        throw new Error('TRANSPORT_CONFIG_INVALID:maxPayloadBytes');
    }
    return Number(resolved);
}
function endpoint(value) {
    if (typeof value !== 'string')
        throw new Error('TRANSPORT_CONFIG_INVALID:endpoint');
    let parsed;
    try {
        parsed = new URL(value);
    }
    catch {
        throw new Error('TRANSPORT_CONFIG_INVALID:endpoint');
    }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.hash) {
        throw new Error('TRANSPORT_CONFIG_INVALID:endpoint');
    }
    return parsed.href;
}
function readTargets(config) {
    exactKeys(config, ['targets'], 'TRANSPORT_CONFIG_INVALID:unknownField');
    if (!plainRecord(config.targets) || Object.keys(config.targets).length === 0) {
        throw new Error('TRANSPORT_CONFIG_INVALID:targets');
    }
    const targets = new Map();
    for (const [id, rawTarget] of Object.entries(config.targets)) {
        if (!TARGET_ID.test(id) || !plainRecord(rawTarget))
            throw new Error(`TRANSPORT_CONFIG_INVALID:target:${id}`);
        exactKeys(rawTarget, ['endpoint', 'signingSecret', 'maxPayloadBytes'], `TRANSPORT_CONFIG_INVALID:target:${id}`);
        if (typeof rawTarget.signingSecret !== 'string' || !TARGET_ID.test(rawTarget.signingSecret)) {
            throw new Error(`TRANSPORT_CONFIG_INVALID:signingSecret:${id}`);
        }
        targets.set(id, Object.freeze({
            endpoint: endpoint(rawTarget.endpoint),
            signingSecret: rawTarget.signingSecret,
            maxPayloadBytes: positiveInteger(rawTarget.maxPayloadBytes, DEFAULT_MAX_PAYLOAD_BYTES),
        }));
    }
    return targets;
}
function assertJson(value, seen, depth) {
    if (depth > MAX_JSON_DEPTH)
        throw new Error('TRANSPORT_PAYLOAD_DEPTH_EXCEEDED');
    if (value === null || typeof value === 'string' || typeof value === 'boolean')
        return;
    if (typeof value === 'number') {
        if (!Number.isFinite(value))
            throw new Error('TRANSPORT_PAYLOAD_INVALID');
        return;
    }
    if (typeof value !== 'object')
        throw new Error('TRANSPORT_PAYLOAD_INVALID');
    if (seen.has(value))
        throw new Error('TRANSPORT_PAYLOAD_CYCLIC');
    seen.add(value);
    if (Array.isArray(value)) {
        for (const item of value)
            assertJson(item, seen, depth + 1);
    }
    else {
        if (!plainRecord(value))
            throw new Error('TRANSPORT_PAYLOAD_INVALID');
        for (const [key, item] of Object.entries(value)) {
            if (key.length < 1
                || key.length > 128
                || /[\u0000-\u001f\u007f]/.test(key)
                || key === '__proto__'
                || key === 'constructor'
                || key === 'prototype')
                throw new Error('TRANSPORT_PAYLOAD_INVALID');
            assertJson(item, seen, depth + 1);
        }
    }
    seen.delete(value);
}
function publicationBody(payload, maxBytes) {
    if (!plainRecord(payload))
        throw new Error('TRANSPORT_PAYLOAD_INVALID');
    exactKeys(payload, ['message'], 'TRANSPORT_PAYLOAD_UNKNOWN_FIELD');
    if (!plainRecord(payload.message))
        throw new Error('TRANSPORT_MESSAGE_INVALID');
    assertJson(payload.message, new Set(), 0);
    const body = Object.freeze({ message: payload.message });
    const serialized = JSON.stringify(body);
    if (Buffer.byteLength(serialized, 'utf8') > maxBytes)
        throw new Error('TRANSPORT_PAYLOAD_SIZE_EXCEEDED');
    return { body, serialized };
}
function secretValue(value) {
    exactKeys(value, ['value'], 'TRANSPORT_SECRET_RESPONSE_INVALID');
    if (typeof value.value !== 'string' || value.value.length === 0 || /[\r\n]/.test(value.value)) {
        throw new Error('TRANSPORT_SECRET_INVALID');
    }
    return value.value;
}
function validateResponse(value) {
    if (!Number.isSafeInteger(value.status) || Number(value.status) < 200 || Number(value.status) > 299) {
        throw new Error('TRANSPORT_RESPONSE_STATUS_INVALID');
    }
    if (!plainRecord(value.body))
        throw new Error('TRANSPORT_RESPONSE_BODY_INVALID');
    exactKeys(value.body, ['accepted', 'publicationId'], 'TRANSPORT_RESPONSE_BODY_INVALID');
    if (value.body.accepted !== true)
        throw new Error('TRANSPORT_PUBLICATION_REJECTED');
    if (typeof value.body.publicationId !== 'string' || !PUBLICATION_ID.test(value.body.publicationId)) {
        throw new Error('TRANSPORT_PUBLICATION_ID_INVALID');
    }
    return { status: Number(value.status), publicationId: value.body.publicationId };
}
export function activate(context) {
    const targets = readTargets(context.config);
    let shuttingDown = false;
    return {
        async ready() {
            if (shuttingDown)
                throw new Error('ADAPTER_SHUTTING_DOWN');
        },
        async invoke({ request, signal }) {
            if (shuttingDown)
                throw new Error('ADAPTER_SHUTTING_DOWN');
            if (request.capability !== 'transport.publish' || request.operation !== 'publish') {
                throw new Error('TRANSPORT_OPERATION_UNSUPPORTED');
            }
            if (request.resource.type !== 'transport.target') {
                throw new Error('TRANSPORT_RESOURCE_TYPE_INVALID');
            }
            if (signal.aborted)
                throw new Error('ADAPTER_CANCELLED');
            const target = targets.get(request.resource.canonicalId);
            if (!target)
                throw new Error(`TRANSPORT_TARGET_UNKNOWN:${request.resource.canonicalId}`);
            const publication = publicationBody(request.payload, target.maxPayloadBytes);
            const resolved = await context.invoke('secrets.read', {
                operation: 'resolve',
                resource: { type: 'secret.name', canonicalId: target.signingSecret },
                payload: {},
            });
            if (signal.aborted)
                throw new Error('ADAPTER_CANCELLED');
            const signature = crypto
                .createHmac('sha256', secretValue(resolved))
                .update(`${request.resource.canonicalId}\n${request.idempotencyKey}\n${publication.serialized}`)
                .digest('hex');
            const response = await context.invoke('network.http', {
                operation: 'request',
                resource: { type: 'network.url', canonicalId: target.endpoint },
                payload: {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                        'idempotency-key': request.idempotencyKey,
                        'x-kubeclaw-target': request.resource.canonicalId,
                        'x-kubeclaw-signature': `sha256=${signature}`,
                    },
                    body: publication.body,
                },
            });
            if (signal.aborted)
                throw new Error('ADAPTER_CANCELLED');
            const receipt = validateResponse(response);
            return Object.freeze({
                accepted: true,
                target: request.resource.canonicalId,
                publicationId: receipt.publicationId,
                status: receipt.status,
            });
        },
        async shutdown() {
            shuttingDown = true;
        },
    };
}
