export function isValueRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
export function isNonEmptyText(value) {
    return typeof value === 'string' && value.trim().length > 0;
}
export function normalizeOptionalString(value) {
    return value === undefined || value === null || value === '' ? null : String(value);
}
export function arrayValue(value) {
    return Array.isArray(value) ? value : [];
}
export function objectRecord(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
export function nullableObjectRecord(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}
export function textValue(value) {
    return typeof value === 'string' ? value : '';
}
export function selectPresentValue(...values) {
    for (const value of values) {
        if (typeof value === 'string' && value.length > 0)
            return value;
    }
    return '';
}
export function selectPresent(...values) {
    return values.find((value) => value !== undefined && value !== null && value !== '');
}
export function firstDefinedValue(...values) {
    for (const value of values) {
        if (value !== undefined && value !== null)
            return value;
    }
    return null;
}
export function errorMessage(error) {
    if (error instanceof Error)
        return error.message;
    return String(error || 'missing_error_detail');
}
