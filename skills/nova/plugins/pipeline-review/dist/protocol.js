const dimensions = ['architecture', 'agents', 'prompts', 'tests', 'configuration'];
export function buildRequest(agent, input) {
    return { protocol: 'kubeclaw.pipeline-review.v2', agent, identity: { runId: input.runId, attempt: input.attempt },
        task: input.task, evidence: input.evidence, requiredDimensions: dimensions };
}
export function parseReport(value, input) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('review report must be an object');
    const report = value;
    if (Object.keys(report).some((key) => !['status', 'runId', 'attempt', 'summary', 'observations'].includes(key)) || report.status !== 'reviewed')
        throw new Error('review report shape is invalid');
    if (report.runId !== input.runId || report.attempt !== input.attempt)
        throw new Error('review identity mismatch');
    if (typeof report.summary !== 'string' || !report.summary.trim() || report.summary.length > 8192)
        throw new Error('review summary is invalid');
    if (!Array.isArray(report.observations) || report.observations.length < dimensions.length || report.observations.length > 128)
        throw new Error('review observations are invalid');
    const observations = report.observations.map((value) => {
        if (!value || typeof value !== 'object' || Array.isArray(value))
            throw new Error('review observation is invalid');
        const item = value;
        if (Object.keys(item).some((key) => !['dimension', 'finding', 'priority'].includes(key)) ||
            !dimensions.includes(item.dimension) || !['low', 'medium', 'high'].includes(String(item.priority)) ||
            typeof item.finding !== 'string' || !item.finding.trim() || item.finding.length > 8192)
            throw new Error('review observation is invalid');
        return item;
    });
    for (const dimension of dimensions)
        if (!observations.some((item) => item.dimension === dimension))
            throw new Error(`review is missing ${dimension}`);
    return { status: 'reviewed', runId: input.runId, attempt: input.attempt, summary: report.summary, observations };
}
