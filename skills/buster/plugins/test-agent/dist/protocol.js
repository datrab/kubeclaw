export function buildRequest(agent, input) {
    return { protocol: 'kubeclaw.buster-test-judgment.v2', agent, identity: { runId: input.runId, taskId: input.taskId, attempt: input.attempt }, task: input.task, suiteEvidence: input.suiteEvidence,
        rules: ['Use only supplied suite evidence.', 'PASS requires all suites passing and no findings.', 'FAIL requires actionable findings.'] };
}
export function parseVerdict(value, input) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('test verdict must be an object');
    const source = value;
    if (Object.keys(source).some((key) => !['verdict', 'runId', 'taskId', 'attempt', 'summary', 'findings', 'session'].includes(key)) || !['PASS', 'FAIL'].includes(String(source.verdict)))
        throw new Error('test verdict shape is invalid');
    if (source.runId !== input.runId || source.taskId !== input.taskId || source.attempt !== input.attempt)
        throw new Error('test verdict identity mismatch');
    if (typeof source.summary !== 'string' || !source.summary.trim() || source.summary.length > 8192)
        throw new Error('test verdict summary is invalid');
    if (!Array.isArray(source.findings) || source.findings.length > 128 || source.findings.some((item) => typeof item !== 'string' || !item.trim() || item.length > 4096))
        throw new Error('test findings are invalid');
    if (source.verdict === 'PASS' && (source.findings.length > 0 || input.suiteEvidence.some((suite) => !suite.passed)))
        throw new Error('PASS contradicts test evidence');
    if (source.verdict === 'FAIL' && source.findings.length === 0)
        throw new Error('FAIL requires findings');
    if (!source.session || typeof source.session !== 'object' || Array.isArray(source.session))
        throw new Error('test session evidence is invalid');
    const session = source.session;
    if (Object.keys(session).some((key) => !['sessionId', 'startedAt', 'completedAt', 'transcriptDigest', 'termination'].includes(key)))
        throw new Error('test session evidence is invalid');
    if (typeof session.sessionId !== 'string' || !session.sessionId || typeof session.startedAt !== 'string' || typeof session.completedAt !== 'string' ||
        !Number.isFinite(Date.parse(session.startedAt)) || !Number.isFinite(Date.parse(session.completedAt)) || Date.parse(session.completedAt) < Date.parse(session.startedAt) ||
        typeof session.transcriptDigest !== 'string' || !/^[a-f0-9]{64}$/u.test(session.transcriptDigest) ||
        !['completed', 'blocked', 'cancelled'].includes(String(session.termination)))
        throw new Error('test session evidence is invalid');
    if (source.verdict === 'PASS' && session.termination !== 'completed')
        throw new Error('PASS requires completed test session');
    return { verdict: source.verdict, runId: input.runId, taskId: input.taskId, attempt: input.attempt, summary: source.summary, findings: source.findings,
        session: { sessionId: session.sessionId, startedAt: session.startedAt, completedAt: session.completedAt, transcriptDigest: session.transcriptDigest,
            termination: session.termination } };
}
