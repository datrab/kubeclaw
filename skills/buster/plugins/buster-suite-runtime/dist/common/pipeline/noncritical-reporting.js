import { selectDefinedValue, selectTruthyValue } from './optional-absence.js';
const _reportedNonBlockingIncidents = new Set();
function readStringProperty(value, key) {
    if (selectTruthyValue(() => (!value), () => (typeof value !== 'object')))
        return null;
    const candidate = value[key];
    return typeof candidate === 'string' ? candidate : null;
}
function readNumberProperty(value, key) {
    if (selectTruthyValue(() => (!value), () => (typeof value !== 'object')))
        return null;
    const candidate = value[key];
    return typeof candidate === 'number' ? candidate : null;
}
function writeIncidentOutput(output, level, line) {
    try {
        output(level, line);
        return true;
    }
    catch (_error) {
        return false;
    }
}
export function sanitizeNonBlockingErrorDetail(value, maxChars = 1200) {
    let text = typeof value === 'string' ? value : String(value == null ? '' : value);
    if (text.length > maxChars)
        text = `${text.slice(0, maxChars - 1)}…`;
    return text;
}
export function buildNonBlockingIncidentKey(...parts) {
    return parts
        .flat(Infinity)
        .filter((part) => part !== undefined && part !== null && part !== '')
        .map((part) => String(part))
        .join(':');
}
export function normalizeNonBlockingErrorDetail(error) {
    if (!error)
        return null;
    if (typeof error === 'string') {
        const text = sanitizeNonBlockingErrorDetail(error.trim());
        return selectTruthyValue(() => (text), () => (null));
    }
    const message = readStringProperty(error, 'message');
    if (message?.trim())
        return sanitizeNonBlockingErrorDetail(message.trim());
    const code = readStringProperty(error, 'code');
    if (code?.trim())
        return `code=${sanitizeNonBlockingErrorDetail(code.trim(), 160)}`;
    const status = readNumberProperty(error, 'status');
    if (typeof status === 'number')
        return `status=${status}`;
    try {
        const json = JSON.stringify(error);
        return json && json !== '{}' ? sanitizeNonBlockingErrorDetail(json) : null;
    }
    catch (_error) { /* INTENTIONAL_NONCRITICAL(fallback_reporting_failed): the authoritative operation must survive failure of this noncritical reporting channel. */
        return null;
    }
}
function incidentLine(reporter, classification, message, detail) {
    const prefix = `[${reporter}] ${message} (classification=${classification})`;
    return detail ? `${prefix}: ${detail}` : prefix;
}
function deliverIncident({ log, fallback, level, line }) {
    if (log && writeIncidentOutput(log, level, line))
        return true;
    if (fallback && writeIncidentOutput(fallback, level, line))
        return true;
    try {
        process.stderr.write(`${line}\n`);
        return true;
    }
    catch (_error) { /* INTENTIONAL_NONCRITICAL(fallback_reporting_failed): every configured noncritical reporting channel has failed. */
        return false;
    }
}
export function reportClassifiedNonBlockingError({ reporter = 'pipeline', classification = 'noncritical_error', incidentKey = null, message, error = null, includeErrorDetail = true, level = 'WARN', log = null, fallback = null, } = {}) {
    const resolvedMessage = nonCriticalMessageAuthority(message, classification);
    const resolvedKey = nonCriticalIncidentKeyAuthority(incidentKey, reporter, classification, resolvedMessage);
    if (!resolvedKey)
        return false;
    if (_reportedNonBlockingIncidents.has(resolvedKey))
        return false;
    const detail = includeErrorDetail ? normalizeNonBlockingErrorDetail(error) : null;
    const line = incidentLine(reporter, classification, resolvedMessage, detail);
    const delivered = deliverIncident({ log, fallback, level, line });
    if (delivered)
        _reportedNonBlockingIncidents.add(resolvedKey);
    return delivered;
}
function nonCriticalMessageAuthority(message, classification) {
    if (message !== undefined && message !== null)
        return message;
    return classification;
}
function nonCriticalIncidentKeyAuthority(incidentKey, reporter, classification, resolvedMessage) {
    if (incidentKey)
        return incidentKey;
    return buildNonBlockingIncidentKey(reporter, classification, resolvedMessage);
}
