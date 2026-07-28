import path from 'node:path';
class LintPolicyError extends Error {
    code = 'LINT_POLICY_INVALID';
    constructor(message) {
        super(message);
        this.name = 'LintPolicyError';
    }
}
function fail(field, message) {
    throw new LintPolicyError(`${field}: ${message}`);
}
function record(value, field) {
    if (!value || typeof value !== 'object')
        fail(field, 'required object');
    if (Array.isArray(value))
        fail(field, 'required object');
    return value;
}
function text(value, field) {
    if (typeof value !== 'string' || !value.trim())
        fail(field, 'required non-empty string');
    return value.trim();
}
function stringList(value, field, { nonEmpty = false } = {}) {
    if (!Array.isArray(value) || (nonEmpty && value.length === 0))
        fail(field, `required ${nonEmpty ? 'non-empty ' : ''}array`);
    const entries = value.map((entry, index) => text(entry, `${field}[${index}]`));
    if (new Set(entries).size !== entries.length)
        fail(field, 'duplicate values are not allowed');
    return entries;
}
function repoRelative(value, field) {
    const normalized = path.posix.normalize(text(value, field).replace(/\\/g, '/'));
    if (path.posix.isAbsolute(normalized) || normalized === '..')
        fail(field, 'must be repository-relative');
    if (normalized.startsWith('../'))
        fail(field, 'must be repository-relative');
    return normalized;
}
function isoDate(value, field) {
    const date = text(value, field);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)))
        fail(field, 'required ISO date');
    return date;
}
export { LintPolicyError, fail, isoDate, record, repoRelative, stringList, text };
