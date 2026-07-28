import crypto from 'node:crypto';
const ID = /^[a-z0-9](?:[a-z0-9._:-]{0,126}[a-z0-9])?$/;
function record(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function exact(value, allowed, code) {
    for (const key of Object.keys(value))
        if (!allowed.has(key))
            throw new Error(`${code}:${key}`);
}
function json(value, depth = 0) {
    if (depth > 20)
        throw new Error('RUNTIME_PAYLOAD_DEPTH_EXCEEDED');
    if (value === null
        || typeof value === 'string'
        || typeof value === 'boolean'
        || (typeof value === 'number' && Number.isFinite(value)))
        return;
    if (Array.isArray(value)) {
        if (value.length > 1_000)
            throw new Error('RUNTIME_PAYLOAD_ARRAY_EXCEEDED');
        value.forEach((entry) => json(entry, depth + 1));
        return;
    }
    if (!record(value))
        throw new Error('RUNTIME_PAYLOAD_INVALID');
    if (Object.keys(value).length > 1_000)
        throw new Error('RUNTIME_PAYLOAD_OBJECT_EXCEEDED');
    for (const [key, entry] of Object.entries(value)) {
        if (!key || key.length > 128 || ['__proto__', 'constructor', 'prototype'].includes(key)) {
            throw new Error('RUNTIME_PAYLOAD_KEY_INVALID');
        }
        json(entry, depth + 1);
    }
}
function config(raw) {
    exact(raw, new Set(['targets']), 'RUNTIME_CONFIG_UNKNOWN_FIELD');
    if (!record(raw.targets) || Object.keys(raw.targets).length === 0)
        throw new Error('RUNTIME_CONFIG_INVALID:targets');
    const targets = new Map();
    for (const [id, value] of Object.entries(raw.targets)) {
        if (!ID.test(id) || !record(value))
            throw new Error(`RUNTIME_CONFIG_INVALID:target:${id}`);
        exact(value, new Set(['endpoint', 'tokenSecret', 'maxRequestBytes', 'maxResponseBytes']), 'RUNTIME_CONFIG_UNKNOWN_TARGET_FIELD');
        if (typeof value.endpoint !== 'string')
            throw new Error(`RUNTIME_CONFIG_INVALID:endpoint:${id}`);
        const endpoint = new URL(value.endpoint);
        if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.hash) {
            throw new Error(`RUNTIME_CONFIG_INVALID:endpoint:${id}`);
        }
        if (typeof value.tokenSecret !== 'string' || !ID.test(value.tokenSecret)) {
            throw new Error(`RUNTIME_CONFIG_INVALID:tokenSecret:${id}`);
        }
        const maxRequestBytes = Number(value.maxRequestBytes ?? 1_048_576);
        const maxResponseBytes = Number(value.maxResponseBytes ?? 1_048_576);
        if (!Number.isSafeInteger(maxRequestBytes) || maxRequestBytes < 1 || maxRequestBytes > 8_388_608) {
            throw new Error(`RUNTIME_CONFIG_INVALID:maxRequestBytes:${id}`);
        }
        if (!Number.isSafeInteger(maxResponseBytes) || maxResponseBytes < 1 || maxResponseBytes > 8_388_608) {
            throw new Error(`RUNTIME_CONFIG_INVALID:maxResponseBytes:${id}`);
        }
        targets.set(id, { endpoint: endpoint.href, tokenSecret: value.tokenSecret, maxRequestBytes, maxResponseBytes });
    }
    return targets;
}
function assertRequest(request) {
    if (request.capability !== 'runtime.dispatch' || request.operation !== 'dispatch') {
        throw new Error('RUNTIME_OPERATION_UNSUPPORTED');
    }
    if (request.resource.type !== 'runtime.agent' || !ID.test(request.resource.canonicalId)) {
        throw new Error('RUNTIME_TARGET_INVALID');
    }
}
export function activate(context) {
    const targets = config(context.config);
    let shuttingDown = false;
    return {
        async ready() {
            if (shuttingDown)
                throw new Error('ADAPTER_SHUTTING_DOWN');
        },
        async invoke({ request, signal, confidential, fence }) {
            if (!confidential)
                fence.assertCurrent();
            if (shuttingDown)
                throw new Error('ADAPTER_SHUTTING_DOWN');
            if (signal.aborted)
                throw new Error('ADAPTER_CANCELLED');
            assertRequest(request);
            const target = targets.get(request.resource.canonicalId);
            if (!target)
                throw new Error(`RUNTIME_TARGET_DENIED:${request.resource.canonicalId}`);
            json(request.payload);
            const body = JSON.stringify(request.payload);
            if (Buffer.byteLength(body, 'utf8') > target.maxRequestBytes)
                throw new Error('RUNTIME_REQUEST_SIZE_EXCEEDED');
            const secret = await context.invoke('secrets.read', {
                operation: 'resolve',
                resource: { type: 'secret.name', canonicalId: target.tokenSecret },
                payload: {},
            });
            if (signal.aborted)
                throw new Error('ADAPTER_CANCELLED');
            if (typeof secret.value !== 'string' || secret.value.length < 1)
                throw new Error('RUNTIME_SECRET_UNAVAILABLE');
            const signature = crypto
                .createHmac('sha256', secret.value)
                .update(`${request.idempotencyKey}.${body}`, 'utf8')
                .digest('hex');
            const response = await context.invoke('network.http', {
                operation: 'request',
                resource: { type: 'network.url', canonicalId: target.endpoint },
                payload: {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                        'idempotency-key': request.idempotencyKey,
                        'x-kubeclaw-signature': `v1=${signature}`,
                    },
                    body: request.payload,
                },
            });
            if (signal.aborted)
                throw new Error('ADAPTER_CANCELLED');
            if (!Number.isSafeInteger(response.status) || Number(response.status) < 200 || Number(response.status) > 299) {
                throw new Error('RUNTIME_RESPONSE_STATUS_INVALID');
            }
            if (!record(response.body))
                throw new Error('RUNTIME_RESPONSE_BODY_INVALID');
            json(response.body);
            if (Buffer.byteLength(JSON.stringify(response.body), 'utf8') > target.maxResponseBytes) {
                throw new Error('RUNTIME_RESPONSE_SIZE_EXCEEDED');
            }
            return Object.freeze({ ...response.body });
        },
        async shutdown() {
            shuttingDown = true;
        },
    };
}
