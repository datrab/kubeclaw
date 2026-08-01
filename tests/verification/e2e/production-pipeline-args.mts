const BOOLEAN_FLAGS = new Set([
  'resume',
]);

export function parseProductionPipelineArgs(
  values: readonly string[],
): Readonly<Record<string, string>> {
  const output: Record<string, string> = {};
  for (let index = 0; index < values.length; index += 1) {
    const flag = values[index];
    if (!flag?.startsWith('--')) throw new Error(`ARGUMENT_INVALID:${flag}`);
    const name = flag.slice(2);
    if (BOOLEAN_FLAGS.has(name)) {
      output[name] = 'true';
      continue;
    }
    const value = values[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`ARGUMENT_INVALID:${flag}`);
    }
    output[name] = value;
    index += 1;
  }
  return Object.freeze(output);
}
