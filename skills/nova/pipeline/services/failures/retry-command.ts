function shellQuoteArg(value: any) {
  if (value === undefined || value === null) {
    throw new Error('shellQuoteArg requires a command argument value');
  }
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

export function buildFullPipelineResumeCommand(
  config: any,
  promptPlaceholder: any = null
) {
  const base = `node pipeline.ts --project ${shellQuoteArg(config.project)} --resume`;
  return promptPlaceholder
    ? `${base} --prompt ${shellQuoteArg(promptPlaceholder)}`
    : base;
}
