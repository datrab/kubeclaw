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
      typeof guidance === 'string' && guidance.trim() ? guidance.trim() : 'No additional guidance.',
      'Return raw JSON only: {"verdict":"passed|request_fix|blocked","summary":"string","findings":["string"],"checkedFiles":["string"]}.',
    ].join('\n\n'),
    architecture: input.architecture ?? {},
    responseContract: {
      verdict: ['passed', 'request_fix', 'blocked'],
      required: ['verdict', 'summary', 'findings', 'checkedFiles'],
      additionalProperties: false,
    },
  });
}
