export interface ArchitectureInput {
  readonly task: string;
  readonly architecture?: Readonly<Record<string, unknown>>;
}
export function buildArchitectureRequest(agent: string, input: ArchitectureInput, guidance: unknown): Readonly<Record<string, unknown>> {
  return Object.freeze({
    protocol: 'kubeclaw.architecture-validation.v2',
    agent,
    task: [
      '# KubeClaw architecture validation v2', input.task,
      'Validate feasibility, component boundaries, dependency direction, deployment truth, and explicit requirements.',
      'Judge only software architecture: domain models and integration boundaries. Generic graph validity, required-file presence, runtime configuration, and execution bookkeeping are validated by core and deterministic preflight stages.',
      'Use passed when validation completed, including when advisory, error, warning, or informational findings require operator review. Use blocked only when a blocking constraint prevents the workflow from continuing. Never return request_fix.',
      typeof guidance === 'string' && guidance.trim() ? guidance.trim() : 'No additional guidance.',
      'Return raw JSON only: {"verdict":"passed|blocked","summary":"string","findings":[{"id":"string","severity":"blocking|error|warn|info","scope":"domain_model|integration_boundary","paths":["string"],"explanation":"string","remediation":"string"}],"checkedFiles":["string"]}.',
      'Return only the agent-owned output object described by outputContract. Do not copy protocol, agent, task, architecture, or outputContract into the output.',
    ].join('\n\n'),
    architecture: input.architecture ?? {},
    outputContract: {
      type: 'object',
      additionalProperties: false,
      required: ['verdict', 'summary', 'findings', 'checkedFiles'],
      properties: {
        verdict: { enum: ['passed', 'blocked'] },
        summary: { type: 'string' },
        findings: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'severity', 'scope', 'paths', 'explanation', 'remediation'],
            properties: {
              id: { type: 'string' },
              severity: { enum: ['blocking', 'error', 'warn', 'info'] },
              scope: { enum: ['domain_model', 'integration_boundary'] },
              paths: { type: 'array', items: { type: 'string' } },
              explanation: { type: 'string' },
              remediation: { type: 'string' },
            },
          },
        },
        checkedFiles: { type: 'array', items: { type: 'string' } },
      },
    },
  });
}
