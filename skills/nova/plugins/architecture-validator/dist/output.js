function strings(value, label) {
    if (!Array.isArray(value))
        throw new Error(`${label} must be an array`);
    return value.map((entry) => {
        if (typeof entry !== 'string' || !entry.trim())
            throw new Error(`${label} entries must be non-empty strings`);
        return entry.trim();
    });
}
export function parseArchitectureOutput(response) {
    const raw = response.result;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        throw new Error('architecture response result must be an object');
    const value = raw;
    const allowed = new Set(['verdict', 'summary', 'findings', 'checkedFiles']);
    for (const key of Object.keys(value))
        if (!allowed.has(key))
            throw new Error(`architecture response contains unknown field: ${key}`);
    if (!['passed', 'request_fix', 'blocked'].includes(String(value.verdict)))
        throw new Error('architecture verdict is invalid');
    if (typeof value.summary !== 'string' || !value.summary.trim())
        throw new Error('architecture summary is required');
    const output = {
        verdict: value.verdict,
        summary: value.summary.trim(),
        findings: strings(value.findings, 'findings'),
        checkedFiles: strings(value.checkedFiles, 'checkedFiles'),
    };
    if (output.verdict === 'passed' && output.findings.length > 0)
        throw new Error('passed verdict contradicts findings');
    if (output.verdict === 'passed' && output.checkedFiles.length === 0)
        throw new Error('passed verdict requires checked files');
    if (output.verdict === 'request_fix' && output.findings.length === 0)
        throw new Error('request_fix requires findings');
    return output;
}
