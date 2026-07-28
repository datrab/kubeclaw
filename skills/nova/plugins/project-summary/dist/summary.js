const percent = (part, total) => total === 0 ? 100 : Math.round((part / total) * 10000) / 100;
const safe = (value) => value.replace(/[\0\r]/gu, '').trim();
export function buildSummary(input) {
    if (input.metrics.modulesPassed > input.metrics.modulesTotal)
        throw new Error('passed modules exceed total modules');
    const testTotal = input.metrics.testsPassed + input.metrics.testsFailed;
    const diagnostics = (input.diagnostics ?? []).map(safe);
    if (diagnostics.some((value) => !value || value.length > 2048))
        throw new Error('diagnostic is invalid');
    const deliveryPercent = percent(input.metrics.modulesPassed, input.metrics.modulesTotal);
    const testPassPercent = percent(input.metrics.testsPassed, testTotal);
    const markdown = [
        `# Project Summary: ${safe(input.projectId)}`, '',
        `- Run: ${safe(input.runId)}`, `- Status: ${input.status}`,
        `- Module delivery: ${input.metrics.modulesPassed}/${input.metrics.modulesTotal} (${deliveryPercent}%)`,
        `- Tests: ${input.metrics.testsPassed} passed, ${input.metrics.testsFailed} failed (${testPassPercent}%)`,
        `- Agent invocations: ${input.metrics.agentInvocations}`, '',
        '## Diagnostics', '', ...(diagnostics.length ? diagnostics.map((item) => `- ${item}`) : ['- None']),
    ].join('\n');
    return { ...input, diagnostics, schemaVersion: 'project-summary.v2', deliveryPercent, testPassPercent, markdown };
}
