export const APPROVAL_SIGNAL_TYPE = 'approval.resolved';
export const DEFAULT_APPROVAL_TIMEOUT_MINUTES = 60;
export const MAX_APPROVAL_TIMEOUT_MINUTES = 525_600;
function record(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`APPROVAL_${label}_INVALID`);
    }
    return value;
}
function exactKeys(value, allowed, label) {
    const allowedKeys = new Set(allowed);
    const unknown = Object.keys(value).find((key) => !allowedKeys.has(key));
    if (unknown)
        throw new Error(`APPROVAL_${label}_UNKNOWN_FIELD:${unknown}`);
}
function requiredText(value, label, maximum) {
    if (typeof value !== 'string')
        throw new Error(`APPROVAL_${label}_INVALID`);
    const normalized = value.trim();
    if (normalized.length === 0
        || normalized.length > maximum
        || normalized.includes('\0')
        || /[\r\n]/.test(normalized)) {
        throw new Error(`APPROVAL_${label}_INVALID`);
    }
    return normalized;
}
export function parseApprovalInput(value) {
    const input = record(value, 'INPUT');
    exactKeys(input, ['summary'], 'INPUT');
    return Object.freeze({
        summary: requiredText(input.summary, 'SUMMARY', 10_000),
    });
}
export function parseApprovalConfig(value) {
    const config = record(value, 'CONFIG');
    exactKeys(config, ['target', 'issuerId', 'timeoutMinutes'], 'CONFIG');
    const timeout = config.timeoutMinutes ?? DEFAULT_APPROVAL_TIMEOUT_MINUTES;
    if (!Number.isSafeInteger(timeout)
        || Number(timeout) < 1
        || Number(timeout) > MAX_APPROVAL_TIMEOUT_MINUTES) {
        throw new Error('APPROVAL_TIMEOUT_MINUTES_INVALID');
    }
    return Object.freeze({
        target: requiredText(config.target, 'TARGET', 1_024),
        issuerId: requiredText(config.issuerId, 'ISSUER_ID', 1_024),
        timeoutMinutes: Number(timeout),
    });
}
function parseIssuer(value, expectedIssuerId) {
    const issuer = record(value, 'ISSUER');
    exactKeys(issuer, ['type', 'id'], 'ISSUER');
    if (issuer.type !== 'operator')
        throw new Error('APPROVAL_ISSUER_TYPE_INVALID');
    const id = requiredText(issuer.id, 'ISSUER_ID', 1_024);
    if (id !== expectedIssuerId)
        throw new Error('APPROVAL_ISSUER_DENIED');
    return Object.freeze({ type: 'operator', id });
}
export function parseApprovalGuidance(value, expectedIssuerId) {
    if (value === undefined)
        return Object.freeze({ decision: 'pending' });
    const guidance = record(value, 'GUIDANCE');
    const decision = guidance.decision;
    if (decision === 'pending') {
        exactKeys(guidance, ['decision'], 'GUIDANCE');
        return Object.freeze({ decision });
    }
    if (decision !== 'approved' && decision !== 'rejected') {
        throw new Error('APPROVAL_DECISION_INVALID');
    }
    exactKeys(guidance, ['decision', 'issuer', 'reason'], 'GUIDANCE');
    const issuer = parseIssuer(guidance.issuer, expectedIssuerId);
    const reason = guidance.reason === undefined
        ? undefined
        : requiredText(guidance.reason, 'REASON', 4_096);
    return Object.freeze({
        decision,
        issuer,
        ...(reason === undefined ? {} : { reason }),
    });
}
export function calculateApprovalExpiresAt(now, timeoutMinutes) {
    if (Number.isNaN(now.getTime()))
        throw new Error('APPROVAL_CLOCK_INVALID');
    if (!Number.isSafeInteger(timeoutMinutes)
        || timeoutMinutes < 1
        || timeoutMinutes > MAX_APPROVAL_TIMEOUT_MINUTES) {
        throw new Error('APPROVAL_TIMEOUT_MINUTES_INVALID');
    }
    return new Date(now.getTime() + timeoutMinutes * 60_000).toISOString();
}
export function resultForApprovalGuidance(guidance) {
    if (guidance.decision === 'approved') {
        return {
            schemaVersion: 'stage-result.v2',
            outcome: 'passed',
            artifacts: [],
        };
    }
    if (guidance.decision !== 'rejected')
        throw new Error('APPROVAL_DECISION_INVALID');
    return {
        schemaVersion: 'stage-result.v2',
        outcome: 'blocked',
        reason: {
            code: 'approval.rejected',
            message: guidance.reason ?? 'Approval was rejected.',
            details: {
                issuer: guidance.issuer.id,
            },
        },
        artifacts: [],
    };
}
export function validateCreatedWait(value, expected) {
    const response = record(value, 'WAIT_RESPONSE');
    exactKeys(response, ['created', 'wait'], 'WAIT_RESPONSE');
    if (typeof response.created !== 'boolean')
        throw new Error('APPROVAL_WAIT_CREATED_INVALID');
    const wait = record(response.wait, 'WAIT_RESPONSE');
    exactKeys(wait, ['schemaVersion', 'waitId', 'kind', 'signalType', 'authorizedIssuer', 'expiresAt', 'request'], 'WAIT_RESPONSE');
    if (wait.schemaVersion !== 'wait-request.v2')
        throw new Error('APPROVAL_WAIT_SCHEMA_INVALID');
    const waitId = requiredText(wait.waitId, 'WAIT_ID', 2_048);
    if (wait.kind !== 'signal')
        throw new Error('APPROVAL_WAIT_KIND_INVALID');
    if (wait.signalType !== APPROVAL_SIGNAL_TYPE)
        throw new Error('APPROVAL_WAIT_SIGNAL_INVALID');
    const issuer = parseIssuer(wait.authorizedIssuer, expected.issuerId);
    if (wait.expiresAt !== expected.expiresAt)
        throw new Error('APPROVAL_WAIT_EXPIRY_INVALID');
    const request = record(wait.request, 'WAIT_REQUEST');
    exactKeys(request, ['summary'], 'WAIT_REQUEST');
    if (request.summary !== expected.summary)
        throw new Error('APPROVAL_WAIT_REQUEST_INVALID');
    return Object.freeze({
        schemaVersion: 'wait-request.v2',
        waitId,
        kind: 'signal',
        signalType: APPROVAL_SIGNAL_TYPE,
        authorizedIssuer: issuer,
        expiresAt: expected.expiresAt,
        request: Object.freeze({ summary: expected.summary }),
    });
}
export function pendingApprovalResult(wait) {
    return {
        schemaVersion: 'stage-result.v2',
        outcome: 'wait',
        reason: {
            code: 'approval.pending',
            message: 'Waiting for approval.',
        },
        artifacts: [],
        wait,
    };
}
