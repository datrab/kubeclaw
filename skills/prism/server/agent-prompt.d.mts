/** The persisted original agent job consumed by the prompt formatter. */
export function agentPrompt(job: {
  id: string;
  fence: string | null;
  operation: 'design-set' | 'revise';
  request: Record<string, unknown>;
}): string;
