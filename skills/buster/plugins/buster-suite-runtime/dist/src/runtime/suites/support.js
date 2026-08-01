export function suiteObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}
export function suiteObjectOrEmpty(value) {
    const record = suiteObject(value);
    return record === null ? {} : record;
}
export function suiteNonEmptyString(value) {
    return typeof value === 'string' && value.trim() ? value : null;
}
export function suiteArray(value) {
    return Array.isArray(value) ? value : [];
}
export function suiteErrorMessage(error) {
    if (error instanceof Error)
        return error.message;
    return error == null ? 'missing_error_detail' : String(error);
}
export function createSuiteLog(suite, label, logSink) {
    return (message) => {
        console.log(`[SUITE] [${label}] ${message}`);
        if (logSink)
            logSink({ suite, msg: message });
    };
}
