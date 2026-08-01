export const requiredSections = ['Context', 'Challenge', 'Approach', 'Implementation', 'Verification', 'Outcome'];
export function buildRequest(agent, input) {
    return { protocol: 'kubeclaw.case-study.v2', agent, identity: { projectId: input.projectId, runId: input.runId },
        task: [input.task, 'Return only the agent-owned output object described by outputContract.', 'Do not copy protocol, agent, identity, task, facts, requiredSections, groundingRules, or outputContract into the output.', 'Runtime/core bind project and run identity.'].join('\n\n'),
        facts: input.facts, requiredSections, groundingRules: ['Use only supplied facts.', 'Do not invent metrics, quotes, dates, or outcomes.'],
        outputContract: { type: 'object', additionalProperties: false, required: ['status', 'markdown'], properties: { status: { const: 'generated' }, markdown: { type: 'string' } } } };
}
export function parseCaseStudy(value, input) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('case study must be an object');
    const source = value;
    if (Object.keys(source).some((key) => !['status', 'markdown'].includes(key)) || source.status !== 'generated')
        throw new Error('case study shape is invalid');
    if (typeof source.markdown !== 'string' || source.markdown.length < 1 || source.markdown.length > 131072 || /[\0\r]/u.test(source.markdown))
        throw new Error('case study Markdown is invalid');
    let previous = -1;
    for (const section of requiredSections) {
        const marker = `## ${section}`;
        const first = source.markdown.indexOf(marker);
        if (first < 0 || first <= previous || source.markdown.indexOf(marker, first + 1) >= 0)
            throw new Error(`case study section ${section} is missing, duplicated, or out of order`);
        previous = first;
    }
    return { status: 'generated', projectId: input.projectId, runId: input.runId, markdown: source.markdown };
}
