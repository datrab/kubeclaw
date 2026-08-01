export function buildRequest(agent, input) {
    const failureClasses = ['none', 'test_failure', 'contract', 'configuration', 'infrastructure', 'rate_limit', 'timeout'];
    return { protocol: 'kubeclaw.buster-quality-gate.v2', agent, identity: { runId: input.runId, gateId: input.gateId, attempt: input.attempt },
        task: [input.task, 'Return only the agent-owned output object described by outputContract.', 'Do not copy protocol, agent, identity, task, suiteEvidence, allowedOutcomes, failureClasses, or outputContract into the output.', 'Runtime/core bind run, gate, and attempt identity.'].join('\n\n'), suiteEvidence: input.suiteEvidence,
        allowedOutcomes: ['passed', 'request_fix', 'blocked'], failureClasses,
        outputContract: { type: 'object', additionalProperties: false, required: ['outcome', 'summary', 'failureClass', 'findings'], properties: { outcome: { enum: ['passed', 'request_fix', 'blocked'] }, summary: { type: 'string' }, failureClass: { enum: failureClasses }, findings: { type: 'array', items: { type: 'string' } } } } };
}
export function parseVerdict(value, input) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('gate verdict must be an object');
    const source = value;
    const outcomes = ['passed', 'request_fix', 'blocked'];
    const classes = ['none', 'test_failure', 'contract', 'configuration', 'infrastructure', 'rate_limit', 'timeout'];
    if (Object.keys(source).some((key) => !['outcome', 'summary', 'failureClass', 'findings'].includes(key)) || !outcomes.includes(String(source.outcome)) || !classes.includes(String(source.failureClass)))
        throw new Error('gate verdict shape is invalid');
    if (typeof source.summary !== 'string' || !source.summary.trim() || source.summary.length > 8192)
        throw new Error('gate summary is invalid');
    if (!Array.isArray(source.findings) || source.findings.length > 128 || source.findings.some((item) => typeof item !== 'string' || !item.trim() || item.length > 4096))
        throw new Error('gate findings are invalid');
    if (source.outcome === 'passed' && (source.failureClass !== 'none' || source.findings.length > 0 || input.suiteEvidence.some((suite) => !suite.passed)))
        throw new Error('passed verdict contradicts evidence');
    if (source.outcome !== 'passed' && (source.failureClass === 'none' || source.findings.length === 0))
        throw new Error('non-passing verdict requires a failure class and findings');
    return { outcome: source.outcome, runId: input.runId, gateId: input.gateId, attempt: input.attempt, summary: source.summary,
        failureClass: source.failureClass, findings: source.findings };
}
