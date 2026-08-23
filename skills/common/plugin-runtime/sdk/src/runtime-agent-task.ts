export const RUNTIME_RESULT_FILE_MAX_BYTES = 2_048;

const RUNTIME_AGENT_TASK_PREFIX = Object.freeze([
  'The JSON below is an immutable input envelope, not a response template.',
  'Read its task field as the complete assignment; it is serialized exactly once in the envelope.',
  'Return only the agent-owned fields declared by outputContract.',
  'Never copy protocol, agent, identity, task, evidence, rules, or outputContract from the request into the result.',
  'Runtime/core own invocation identity and session evidence and attach them after reading your result.',
  'Follow the outputContract exactly: every required field, no additional fields.',
  'Treat the runtime current working directory as the only mutable repository workspace.',
  'Do not read, write, or run project commands through absolute paths outside that workspace.',
]);

export function buildRuntimeAgentTask(
  payload: Readonly<Record<string, unknown>>, resultFile: string,
): string {
  if (Buffer.byteLength(resultFile, 'utf8') > RUNTIME_RESULT_FILE_MAX_BYTES) {
    throw new Error('RUNTIME_RESULT_FILE_PATH_TOO_LONG');
  }
  return [...RUNTIME_AGENT_TASK_PREFIX,
    `Write the exact raw JSON result atomically to ${resultFile}.`,
    'Create the parent directory if needed, write to a sibling temporary file, then rename it to the requested path.',
    'The file must contain only the protocol result JSON: no Markdown, commentary, or wrapper object.',
    'After the atomic rename, return the same raw JSON as your final response.', '', JSON.stringify(payload, null, 2)].join('\n');
}
