import crypto from 'crypto';
import path from 'path';
function normalizedFile(repoRoot, file) {
    if (typeof file !== 'string' || !file.trim())
        return null;
    const absolute = path.isAbsolute(file) ? path.normalize(file) : path.resolve(repoRoot, file);
    const relative = path.relative(repoRoot, absolute);
    if (relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)) {
        return relative.split(path.sep).join('/');
    }
    return file.split(path.sep).join('/');
}
function normalizedMessage(message) {
    return String(message || '').trim().replace(/\s+/g, ' ');
}
function findingFingerprint(toolId, repoRoot, finding) {
    const identity = finding.fingerprint_seed ?? {
        code: finding.code,
        file: normalizedFile(repoRoot, finding.file),
        message: normalizedMessage(finding.message),
    };
    return crypto.createHash('sha256').update(JSON.stringify({ tool: toolId, identity })).digest('hex');
}
function normalizeFindings(ctx, toolId, findings) {
    const baseline = ctx.policy.baseline?.entries_by_key ?? new Map();
    const today = new Date().toISOString().slice(0, 10);
    return findings.map((raw) => {
        const finding = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
        const fingerprint = findingFingerprint(toolId, ctx.repoRoot, finding);
        const baselineEntry = baseline.get(`${toolId}:${fingerprint}`);
        const normalized = {
            ...finding,
            file: normalizedFile(ctx.repoRoot, finding.file),
            fingerprint,
        };
        delete normalized.fingerprint_seed;
        if (baselineEntry && baselineEntry.expires >= today) {
            normalized.baseline = {
                owner: baselineEntry.owner,
                reason: baselineEntry.reason,
                created: baselineEntry.created,
                expires: baselineEntry.expires,
                tracking: baselineEntry.tracking,
                approved_by: baselineEntry.approved_by,
                approved_on: baselineEntry.approved_on,
            };
        }
        return normalized;
    });
}
export { findingFingerprint, normalizeFindings, };
