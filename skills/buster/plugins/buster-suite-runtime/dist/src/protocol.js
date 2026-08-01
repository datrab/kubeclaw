import crypto from 'node:crypto';
export const JOB_SCHEMA = 'buster-suite-job.v2';
export const STATUS_SCHEMA = 'buster-suite-status.v2';
export const RESULT_SCHEMA = 'buster-suite-result.v2';
export const SUPPORTED_SUITES = Object.freeze([
    'manifest', 'build', 'health', 'k8s', 'tailscale-preview', 'a11y', 'perf',
    'bundle', 'security', 'visual-reg', 'api', 'e2e', 'unit',
]);
const SUITE_CAPABILITIES = Object.freeze({
    build: Object.freeze(['image_build', 'kubernetes']),
    k8s: Object.freeze(['image_build', 'kubernetes']),
    a11y: Object.freeze(['browser_automation']),
    e2e: Object.freeze(['browser_automation']),
    'visual-reg': Object.freeze(['browser_automation']),
    perf: Object.freeze(['lighthouse']),
});
export function requiredCapabilitiesForSuites(suites) {
    return Object.freeze([...new Set(suites.flatMap((suite) => (SUITE_CAPABILITIES[suite] ?? [])))].sort());
}
const ID = /^[a-z0-9](?:[a-z0-9._:-]{0,190}[a-z0-9])?$/u;
const JOB_ID = /^job:[a-f0-9]{32}$/u;
export function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function exact(value, fields, code) {
    const allowed = new Set(fields);
    for (const field of Object.keys(value))
        if (!allowed.has(field))
            throw new Error(`${code}:${field}`);
}
export function stringList(value, label, allowEmpty = false) {
    if (!Array.isArray(value) || (!allowEmpty && value.length < 1)
        || value.some((entry) => typeof entry !== 'string' || entry.length < 1 || entry.length > 128)
        || new Set(value).size !== value.length)
        throw new Error(`BUSTER_SUITE_INVALID:${label}`);
    return Object.freeze([...value]);
}
export function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}
export function parseJob(value, maxArchiveBytes) {
    if (!isRecord(value))
        throw new Error('BUSTER_JOB_INVALID');
    exact(value, [
        'schemaVersion', 'jobId', 'idempotencyKey', 'archive', 'suites', 'testConfig',
        'task', 'moduleId', 'attempt', 'capabilities', 'timeoutMs',
    ], 'BUSTER_JOB_UNKNOWN_FIELD');
    if (value.schemaVersion !== JOB_SCHEMA)
        throw new Error('BUSTER_JOB_SCHEMA_INVALID');
    if (typeof value.jobId !== 'string' || !JOB_ID.test(value.jobId))
        throw new Error('BUSTER_JOB_ID_INVALID');
    if (typeof value.idempotencyKey !== 'string' || !ID.test(value.idempotencyKey)) {
        throw new Error('BUSTER_JOB_IDEMPOTENCY_INVALID');
    }
    if (!isRecord(value.archive))
        throw new Error('BUSTER_JOB_ARCHIVE_INVALID');
    exact(value.archive, ['encoding', 'sha256', 'bytes', 'data'], 'BUSTER_JOB_ARCHIVE_UNKNOWN_FIELD');
    if (value.archive.encoding !== 'base64'
        || typeof value.archive.sha256 !== 'string'
        || !/^[a-f0-9]{64}$/u.test(value.archive.sha256)
        || !Number.isSafeInteger(value.archive.bytes)
        || Number(value.archive.bytes) < 1
        || Number(value.archive.bytes) > maxArchiveBytes
        || typeof value.archive.data !== 'string')
        throw new Error('BUSTER_JOB_ARCHIVE_INVALID');
    const archive = Buffer.from(value.archive.data, 'base64');
    if (archive.byteLength !== value.archive.bytes || sha256(archive) !== value.archive.sha256) {
        throw new Error('BUSTER_JOB_ARCHIVE_DIGEST_MISMATCH');
    }
    const suites = stringList(value.suites, 'suites');
    if (suites.some((suite) => !SUPPORTED_SUITES.includes(suite))) {
        throw new Error('BUSTER_JOB_SUITE_UNSUPPORTED');
    }
    if (!isRecord(value.testConfig) || !isRecord(value.task))
        throw new Error('BUSTER_JOB_PAYLOAD_INVALID');
    const capabilities = stringList(value.capabilities, 'capabilities', true);
    const requiredCapabilities = requiredCapabilitiesForSuites(suites);
    if (capabilities.length !== requiredCapabilities.length
        || capabilities.some((capability, index) => capability !== requiredCapabilities[index]))
        throw new Error('BUSTER_JOB_CAPABILITIES_INVALID');
    if (!Number.isSafeInteger(value.timeoutMs) || Number(value.timeoutMs) < 1
        || Number(value.timeoutMs) > 7_200_000)
        throw new Error('BUSTER_JOB_TIMEOUT_INVALID');
    if (value.moduleId !== undefined && (typeof value.moduleId !== 'string' || !ID.test(value.moduleId))) {
        throw new Error('BUSTER_JOB_MODULE_INVALID');
    }
    if (value.attempt !== undefined && (!Number.isSafeInteger(value.attempt) || Number(value.attempt) < 1)) {
        throw new Error('BUSTER_JOB_ATTEMPT_INVALID');
    }
    return Object.freeze({
        schemaVersion: JOB_SCHEMA,
        jobId: value.jobId,
        idempotencyKey: value.idempotencyKey,
        archive: Object.freeze({
            encoding: 'base64',
            sha256: value.archive.sha256,
            bytes: Number(value.archive.bytes),
            data: value.archive.data,
        }),
        suites,
        testConfig: Object.freeze({ ...value.testConfig }),
        task: Object.freeze({ ...value.task }),
        ...(value.moduleId === undefined ? {} : { moduleId: value.moduleId }),
        ...(value.attempt === undefined ? {} : { attempt: Number(value.attempt) }),
        capabilities,
        timeoutMs: Number(value.timeoutMs),
    });
}
export function parseResult(value, expectedJobId) {
    if (!isRecord(value))
        throw new Error('BUSTER_RESULT_INVALID');
    exact(value, [
        'schemaVersion', 'jobId', 'results', 'suiteSummary', 'suiteDetailSummary',
        'criticalFailed', 'completedAt',
    ], 'BUSTER_RESULT_UNKNOWN_FIELD');
    if (value.schemaVersion !== RESULT_SCHEMA)
        throw new Error('BUSTER_RESULT_SCHEMA_INVALID');
    if (typeof value.jobId !== 'string' || !JOB_ID.test(value.jobId)
        || (expectedJobId !== undefined && value.jobId !== expectedJobId))
        throw new Error('BUSTER_RESULT_JOB_INVALID');
    if (!Array.isArray(value.results) || value.results.some((entry) => !isRecord(entry))
        || typeof value.suiteSummary !== 'string' || value.suiteSummary.length > 65_536
        || typeof value.suiteDetailSummary !== 'string' || value.suiteDetailSummary.length > 1_048_576
        || typeof value.criticalFailed !== 'boolean'
        || typeof value.completedAt !== 'string' || !Number.isFinite(Date.parse(value.completedAt)))
        throw new Error('BUSTER_RESULT_PAYLOAD_INVALID');
    return Object.freeze({
        schemaVersion: RESULT_SCHEMA,
        jobId: value.jobId,
        results: Object.freeze(value.results.map((entry) => Object.freeze({ ...entry }))),
        suiteSummary: value.suiteSummary,
        suiteDetailSummary: value.suiteDetailSummary,
        criticalFailed: value.criticalFailed,
        completedAt: value.completedAt,
    });
}
export function relocateRepositoryValues(value, sourceRoot, marker = 'repo://') {
    if (typeof value === 'string') {
        if (value === sourceRoot)
            return marker;
        if (value.startsWith(`${sourceRoot}/`))
            return `${marker}${value.slice(sourceRoot.length + 1)}`;
        return value;
    }
    if (Array.isArray(value))
        return value.map((entry) => relocateRepositoryValues(entry, sourceRoot, marker));
    if (!isRecord(value))
        return value;
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
        key,
        relocateRepositoryValues(entry, sourceRoot, marker),
    ]));
}
export function materializeRepositoryValues(value, repositoryRoot) {
    if (typeof value === 'string') {
        if (value === 'repo://')
            return repositoryRoot;
        if (value.startsWith('repo://')) {
            const relative = value.slice('repo://'.length);
            if (relative.length < 1 || pathLikeAbsolute(relative)
                || relative.split('/').some((segment) => segment === '..' || segment === ''))
                throw new Error('BUSTER_JOB_REPOSITORY_PATH_INVALID');
            return `${repositoryRoot}/${relative}`;
        }
        return value;
    }
    if (Array.isArray(value))
        return value.map((entry) => materializeRepositoryValues(entry, repositoryRoot));
    if (!isRecord(value))
        return value;
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
        key,
        materializeRepositoryValues(entry, repositoryRoot),
    ]));
}
function pathLikeAbsolute(value) {
    return value.startsWith('/') || /^[a-z]:[\\/]/iu.test(value) || value.includes('\\');
}
