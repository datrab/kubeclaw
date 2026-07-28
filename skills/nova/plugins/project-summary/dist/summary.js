const percent = (part, total) => total === 0 ? 100 : Math.round((part / total) * 10000) / 100;
const safe = (value) => value.replace(/[\0\r]/gu, '').trim();
const count = (value, label) => {
    if (!Number.isSafeInteger(value) || value < 0)
        throw new Error(`${label} must be a non-negative safe integer`);
    return value;
};
export function buildSummary(input) {
    const projectId = safe(input.projectId);
    const runId = safe(input.runId);
    if (!projectId || !runId)
        throw new Error('project and run identities are required');
    const modulesTotal = count(input.metrics.modulesTotal, 'modulesTotal');
    const modulesPassed = count(input.metrics.modulesPassed, 'modulesPassed');
    const testsPassed = count(input.metrics.testsPassed, 'testsPassed');
    const testsFailed = count(input.metrics.testsFailed, 'testsFailed');
    const agentInvocations = count(input.metrics.agentInvocations, 'agentInvocations');
    if (modulesPassed > modulesTotal)
        throw new Error('passed modules exceed total modules');
    const testTotal = testsPassed + testsFailed;
    if (!Number.isSafeInteger(testTotal))
        throw new Error('test total exceeds safe integer range');
    const diagnostics = (input.diagnostics ?? []).map(safe);
    if (diagnostics.some((value) => !value || value.length > 2048))
        throw new Error('diagnostic is invalid');
    const deliveryPercent = percent(modulesPassed, modulesTotal);
    const testPassPercent = percent(testsPassed, testTotal);
    const markdown = [
        `# Project Summary: ${projectId}`, '',
        `- Run: ${runId}`, `- Status: ${input.status}`,
        `- Module delivery: ${modulesPassed}/${modulesTotal} (${deliveryPercent}%)`,
        `- Tests: ${testsPassed} passed, ${testsFailed} failed (${testPassPercent}%)`,
        `- Agent invocations: ${agentInvocations}`, '',
        '## Diagnostics', '', ...(diagnostics.length ? diagnostics.map((item) => `- ${item}`) : ['- None']),
    ].join('\n');
    return { ...input, projectId, runId, metrics: { modulesTotal, modulesPassed, testsPassed, testsFailed, agentInvocations }, diagnostics, schemaVersion: 'project-summary.v2', deliveryPercent, testPassPercent, markdown };
}
