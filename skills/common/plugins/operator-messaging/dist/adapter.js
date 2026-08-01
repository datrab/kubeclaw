import crypto from 'node:crypto';
const TARGET_ID = /^[a-z0-9](?:[a-z0-9._:-]{0,126}[a-z0-9])?$/;
const MESSAGE_TYPE = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const ALLOWED_PAYLOAD_KEYS = new Set([
    'type',
    'message',
    'eventId',
    'runId',
    'stageId',
    'artifactId',
    'artifact',
    'approvalId',
    'summary',
    'fields',
    'footer',
    'occurredAt',
    'severity',
    'title',
    'reasonCode',
    'signalType',
    'authorizedIssuer',
    'expiresAt',
]);
function isRecord(value) {
    return value !== null
        && typeof value === 'object'
        && !Array.isArray(value)
        && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function exactKeys(value, allowed, error) {
    for (const key of Object.keys(value)) {
        if (!allowed.has(key))
            throw new Error(`${error}:${key}`);
    }
}
function boundedString(value, label, maximum, nullable = false) {
    if (value === undefined)
        return undefined;
    if (value === null && nullable)
        return null;
    if (typeof value !== 'string' || value.length < 1 || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value)) {
        throw new Error(`OPERATOR_PAYLOAD_INVALID:${label}`);
    }
    return value;
}
function validateJson(value, label, depth = 0) {
    if (depth > 20)
        throw new Error(`OPERATOR_PAYLOAD_INVALID:${label}:depth`);
    if (value === null
        || typeof value === 'string'
        || typeof value === 'boolean'
        || (typeof value === 'number' && Number.isFinite(value)))
        return;
    if (Array.isArray(value)) {
        if (value.length > 1_000)
            throw new Error(`OPERATOR_PAYLOAD_INVALID:${label}:array`);
        value.forEach((entry, index) => validateJson(entry, `${label}[${index}]`, depth + 1));
        return;
    }
    if (!isRecord(value))
        throw new Error(`OPERATOR_PAYLOAD_INVALID:${label}:json`);
    const entries = Object.entries(value);
    if (entries.length > 1_000)
        throw new Error(`OPERATOR_PAYLOAD_INVALID:${label}:object`);
    for (const [key, entry] of entries) {
        if (key.length < 1
            || key.length > 128
            || /[\u0000-\u001f\u007f]/.test(key)
            || key === '__proto__'
            || key === 'constructor'
            || key === 'prototype')
            throw new Error(`OPERATOR_PAYLOAD_INVALID:${label}:key`);
        validateJson(entry, `${label}.${key}`, depth + 1);
    }
}
function parsePayload(raw, maxPayloadBytes) {
    if (!isRecord(raw))
        throw new Error('OPERATOR_PAYLOAD_INVALID:root');
    exactKeys(raw, ALLOWED_PAYLOAD_KEYS, 'OPERATOR_PAYLOAD_UNKNOWN_FIELD');
    if (typeof raw.type !== 'string' || !MESSAGE_TYPE.test(raw.type) || raw.type.length > 128) {
        throw new Error('OPERATOR_PAYLOAD_INVALID:type');
    }
    boundedString(raw.message, 'message', 16_384);
    boundedString(raw.eventId, 'eventId', 512);
    boundedString(raw.runId, 'runId', 512);
    boundedString(raw.stageId, 'stageId', 512, true);
    boundedString(raw.artifactId, 'artifactId', 512, true);
    boundedString(raw.approvalId, 'approvalId', 512);
    boundedString(raw.summary, 'summary', 16_384);
    boundedString(raw.footer, 'footer', 2_048);
    boundedString(raw.severity, 'severity', 32);
    boundedString(raw.title, 'title', 512);
    boundedString(raw.reasonCode, 'reasonCode', 256, true);
    if (raw.occurredAt !== undefined) {
        const occurredAt = boundedString(raw.occurredAt, 'occurredAt', 64);
        if (!occurredAt || Number.isNaN(Date.parse(occurredAt))) {
            throw new Error('OPERATOR_PAYLOAD_INVALID:occurredAt');
        }
    }
    if (raw.fields !== undefined) {
        if (!Array.isArray(raw.fields) || raw.fields.length > 25) {
            throw new Error('OPERATOR_PAYLOAD_INVALID:fields');
        }
        raw.fields.forEach((field, index) => {
            if (!isRecord(field))
                throw new Error(`OPERATOR_PAYLOAD_INVALID:fields[${index}]`);
            exactKeys(field, new Set(['name', 'value', 'inline']), 'OPERATOR_PAYLOAD_UNKNOWN_FIELD_ITEM');
            boundedString(field.name, `fields[${index}].name`, 256);
            boundedString(field.value, `fields[${index}].value`, 1_024);
            if (field.inline !== undefined && typeof field.inline !== 'boolean') {
                throw new Error(`OPERATOR_PAYLOAD_INVALID:fields[${index}].inline`);
            }
        });
    }
    boundedString(raw.signalType, 'signalType', 256);
    if (raw.expiresAt !== undefined) {
        const expiresAt = boundedString(raw.expiresAt, 'expiresAt', 64);
        if (!expiresAt || Number.isNaN(Date.parse(expiresAt)))
            throw new Error('OPERATOR_PAYLOAD_INVALID:expiresAt');
    }
    if (raw.authorizedIssuer !== undefined) {
        if (!isRecord(raw.authorizedIssuer))
            throw new Error('OPERATOR_PAYLOAD_INVALID:authorizedIssuer');
        exactKeys(raw.authorizedIssuer, new Set(['type', 'id']), 'OPERATOR_PAYLOAD_UNKNOWN_ISSUER_FIELD');
        if (raw.authorizedIssuer.type !== 'operator')
            throw new Error('OPERATOR_PAYLOAD_INVALID:authorizedIssuer.type');
        boundedString(raw.authorizedIssuer.id, 'authorizedIssuer.id', 512);
    }
    if (raw.artifact !== undefined)
        validateJson(raw.artifact, 'artifact');
    validateJson(raw, 'payload');
    const serialized = JSON.stringify(raw);
    if (Buffer.byteLength(serialized, 'utf8') > maxPayloadBytes)
        throw new Error('OPERATOR_PAYLOAD_SIZE_EXCEEDED');
    return Object.freeze({ ...raw });
}
function parseConfig(config) {
    exactKeys(config, new Set(['targets']), 'OPERATOR_CONFIG_UNKNOWN_FIELD');
    if (!isRecord(config.targets) || Object.keys(config.targets).length < 1) {
        throw new Error('OPERATOR_CONFIG_INVALID:targets');
    }
    const targets = new Map();
    for (const [targetId, raw] of Object.entries(config.targets)) {
        if (!TARGET_ID.test(targetId) || !isRecord(raw))
            throw new Error(`OPERATOR_CONFIG_INVALID:target:${targetId}`);
        exactKeys(raw, new Set(['endpoint', 'endpointOrigin', 'endpointSecret', 'tokenSecret', 'maxPayloadBytes', 'format']), 'OPERATOR_CONFIG_UNKNOWN_TARGET_FIELD');
        const usesSecretEndpoint = raw.endpointSecret !== undefined || raw.endpointOrigin !== undefined;
        if (usesSecretEndpoint === (raw.endpoint !== undefined)) {
            throw new Error(`OPERATOR_CONFIG_INVALID:endpoint_mode:${targetId}`);
        }
        let endpoint;
        let endpointOrigin;
        if (usesSecretEndpoint) {
            if (typeof raw.endpointSecret !== 'string'
                || !TARGET_ID.test(raw.endpointSecret))
                throw new Error(`OPERATOR_CONFIG_INVALID:endpointSecret:${targetId}`);
            if (typeof raw.endpointOrigin !== 'string') {
                throw new Error(`OPERATOR_CONFIG_INVALID:endpointOrigin:${targetId}`);
            }
            try {
                endpointOrigin = new URL(raw.endpointOrigin);
            }
            catch {
                throw new Error(`OPERATOR_CONFIG_INVALID:endpointOrigin:${targetId}`);
            }
            if (!['http:', 'https:'].includes(endpointOrigin.protocol)
                || endpointOrigin.username
                || endpointOrigin.password
                || endpointOrigin.hash
                || endpointOrigin.pathname !== '/'
                || endpointOrigin.search)
                throw new Error(`OPERATOR_CONFIG_INVALID:endpointOrigin:${targetId}`);
        }
        else {
            if (typeof raw.endpoint !== 'string')
                throw new Error(`OPERATOR_CONFIG_INVALID:endpoint:${targetId}`);
            try {
                endpoint = new URL(raw.endpoint);
            }
            catch {
                throw new Error(`OPERATOR_CONFIG_INVALID:endpoint:${targetId}`);
            }
            if (!['http:', 'https:'].includes(endpoint.protocol)
                || endpoint.username
                || endpoint.password
                || endpoint.hash)
                throw new Error(`OPERATOR_CONFIG_INVALID:endpoint:${targetId}`);
            if (typeof raw.tokenSecret !== 'string'
                || !TARGET_ID.test(raw.tokenSecret))
                throw new Error(`OPERATOR_CONFIG_INVALID:tokenSecret:${targetId}`);
        }
        const maxPayloadBytes = raw.maxPayloadBytes ?? 65_536;
        if (!Number.isSafeInteger(maxPayloadBytes) || Number(maxPayloadBytes) < 1 || Number(maxPayloadBytes) > 1_048_576) {
            throw new Error(`OPERATOR_CONFIG_INVALID:maxPayloadBytes:${targetId}`);
        }
        const format = raw.format ?? 'json';
        if (format !== 'json' && format !== 'discord_webhook') {
            throw new Error(`OPERATOR_CONFIG_INVALID:format:${targetId}`);
        }
        targets.set(targetId, Object.freeze({
            ...(endpoint ? { endpoint: endpoint.href, tokenSecret: raw.tokenSecret } : {}),
            ...(endpointOrigin ? {
                endpointOrigin: endpointOrigin.origin,
                endpointSecret: raw.endpointSecret,
            } : {}),
            maxPayloadBytes: Number(maxPayloadBytes),
            format,
        }));
    }
    return targets;
}
function secretValue(response) {
    exactKeys(response, new Set(['value']), 'OPERATOR_SECRET_RESPONSE_UNKNOWN_FIELD');
    if (typeof response.value !== 'string' || response.value.length < 1) {
        throw new Error('OPERATOR_SECRET_UNAVAILABLE');
    }
    return response.value;
}
function responseMessageId(response) {
    const body = response.body;
    if (!isRecord(body))
        return undefined;
    const value = body.messageId ?? body.id;
    return typeof value === 'string' && value.length > 0 && value.length <= 512 ? value : undefined;
}
function assertRequest(request) {
    if (request.capability !== 'operator.request' || request.operation !== 'publish') {
        throw new Error('OPERATOR_OPERATION_UNSUPPORTED');
    }
    if (request.resource.type !== 'operator.target')
        throw new Error('OPERATOR_RESOURCE_TYPE_INVALID');
    if (!TARGET_ID.test(request.resource.canonicalId))
        throw new Error('OPERATOR_TARGET_INVALID');
}
const DISCORD_COLORS = Object.freeze({
    info: 0x3498db,
    success: 0x2ecc71,
    warning: 0xf1c40f,
    error: 0xe74c3c,
});
const DISCORD_ICONS = Object.freeze({
    info: 'ℹ️',
    success: '✅',
    warning: '⚠️',
    error: '❌',
});
function discordWebhookPayload(payload) {
    const severity = typeof payload.severity === 'string' ? payload.severity : 'info';
    const title = typeof payload.title === 'string' ? payload.title : String(payload.type);
    const summary = typeof payload.summary === 'string'
        ? payload.summary
        : typeof payload.message === 'string'
            ? payload.message
            : title;
    const fields = Array.isArray(payload.fields)
        ? payload.fields
        : [];
    const reasonCode = typeof payload.reasonCode === 'string' ? payload.reasonCode : null;
    return Object.freeze({
        allowed_mentions: Object.freeze({ parse: Object.freeze([]) }),
        embeds: Object.freeze([Object.freeze({
                title: `${DISCORD_ICONS[severity] ?? 'ℹ️'} ${title}`.slice(0, 256),
                description: summary.slice(0, 4_096),
                color: DISCORD_COLORS[severity] ?? DISCORD_COLORS.info,
                fields: Object.freeze([
                    ...fields,
                    ...(reasonCode ? [{ name: 'Reason', value: reasonCode, inline: false }] : []),
                ].slice(0, 25)),
                ...(typeof payload.footer === 'string'
                    ? { footer: Object.freeze({ text: payload.footer.slice(0, 2_048) }) }
                    : {}),
                ...(typeof payload.occurredAt === 'string'
                    ? { timestamp: payload.occurredAt }
                    : {}),
            })]),
    });
}
export function activate(context) {
    const targets = parseConfig(context.config);
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
            const targetId = request.resource.canonicalId;
            const target = targets.get(targetId);
            if (!target)
                throw new Error(`OPERATOR_TARGET_DENIED:${targetId}`);
            const payload = parsePayload(request.payload, target.maxPayloadBytes);
            const transportPayload = target.format === 'discord_webhook'
                ? discordWebhookPayload(payload)
                : payload;
            const body = JSON.stringify(transportPayload);
            const secretName = target.endpointSecret ?? target.tokenSecret;
            if (!secretName)
                throw new Error('OPERATOR_SECRET_UNAVAILABLE');
            const resolved = await context.invoke('secrets.read', {
                operation: 'resolve',
                resource: { type: 'secret.name', canonicalId: secretName },
                payload: {},
            });
            if (signal.aborted)
                throw new Error('ADAPTER_CANCELLED');
            const secret = secretValue(resolved);
            let endpoint = target.endpoint;
            if (target.endpointSecret) {
                let resolvedEndpoint;
                try {
                    resolvedEndpoint = new URL(secret);
                }
                catch {
                    throw new Error('OPERATOR_SECRET_ENDPOINT_INVALID');
                }
                if (resolvedEndpoint.origin !== target.endpointOrigin
                    || resolvedEndpoint.username
                    || resolvedEndpoint.password
                    || resolvedEndpoint.hash)
                    throw new Error('OPERATOR_SECRET_ENDPOINT_DENIED');
                endpoint = resolvedEndpoint.href;
            }
            if (!endpoint)
                throw new Error('OPERATOR_ENDPOINT_UNAVAILABLE');
            const signature = crypto
                .createHmac('sha256', secret)
                .update(`${request.idempotencyKey}.${body}`, 'utf8')
                .digest('hex');
            const networkRequest = {
                operation: 'request',
                resource: { type: 'network.url', canonicalId: endpoint },
                payload: {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                        'idempotency-key': request.idempotencyKey,
                        'x-kubeclaw-signature': `v1=${signature}`,
                    },
                    body: transportPayload,
                },
            };
            const response = target.endpointSecret
                ? await context.invokeConfidential('network.http', networkRequest)
                : await context.invoke('network.http', networkRequest);
            if (signal.aborted)
                throw new Error('ADAPTER_CANCELLED');
            if (!Number.isSafeInteger(response.status) || Number(response.status) < 200 || Number(response.status) > 299) {
                throw new Error('OPERATOR_DELIVERY_INVALID_RESPONSE');
            }
            const messageId = responseMessageId(response);
            return Object.freeze({
                accepted: true,
                target: targetId,
                status: Number(response.status),
                ...(messageId === undefined ? {} : { messageId }),
            });
        },
        async shutdown() {
            shuttingDown = true;
        },
    };
}
