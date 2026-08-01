export type CommonEnvironmentKey =
  | 'OPENCLAW_GATEWAY_TOKEN'
  | 'OPENCLAW_GATEWAY_URL'
  | 'REPO_ROOT'
  | 'SWARM_CONFIG';

export function readCommonEnvironment(
  key: CommonEnvironmentKey,
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  return env[key];
}

export function commonEnvironmentSnapshot(): Record<string, string | undefined> {
  return { ...process.env };
}
