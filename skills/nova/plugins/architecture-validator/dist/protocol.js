export function buildArchitectureRequest(agent, input, guidance) {
    return Object.freeze({
        protocol: 'kubeclaw.architecture-validation.v2',
        agent,
        task: [
            '# KubeClaw architecture validation v2', input.task,
            'Validate feasibility, component boundaries, dependency direction, deployment truth, and explicit requirements.',
            'Judge only software architecture: domain models and integration boundaries. Generic graph validity, required-file presence, runtime configuration, and execution bookkeeping are validated by core and deterministic preflight stages.',
            typeof guidance === 'string' && guidance.trim() ? guidance.trim() : 'No additional guidance.',
            'Return raw JSON only: {"verdict":"passed|request_fix|blocked","summary":"string","findings":[{"id":"string","severity":"blocking|error|warn|info","scope":"domain_model|integration_boundary","paths":["string"],"explanation":"string","remediation":"string"}],"checkedFiles":["string"]}.',
        ].join('\n\n'),
        architecture: input.architecture ?? {},
        responseContract: {
            verdict: ['passed', 'request_fix', 'blocked'],
            findingScopes: ['domain_model', 'integration_boundary'],
            findingSeverities: ['blocking', 'error', 'warn', 'info'],
            required: ['verdict', 'summary', 'findings', 'checkedFiles'],
            additionalProperties: false,
        },
    });
}
