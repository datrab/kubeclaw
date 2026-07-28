export type BusterEnvironmentKey =
  | 'AGENT_NAME'
  | 'AGENT_ROLE'
  | 'BUILDKIT_HOST'
  | 'BUSTER_BUILD_OUTPUT_DIR'
  | 'BUSTER_CAPABILITIES'
  | 'BUSTER_LEASE_API_GROUP'
  | 'BUSTER_LEASE_API_VERSION'
  | 'BUSTER_RESULTS_DIR'
  | 'BUSTER_TASK_DEAD_LETTER_STREAM'
  | 'CURRENT_AGENT'
  | 'CURRENT_PROJECT'
  | 'DISCORD_CHANNEL'
  | 'DISCORD_TOKEN'
  | 'DISCORD_WEBHOOK_URL'
  | 'KUBECLAW_DISABLE_DISCORD_WEBHOOKS'
  | 'KUBECLAW_LOCAL_REGISTRY'
  | 'KUBECLAW_NAMESPACE'
  | 'REDIS_CONSUMER_NAME'
  | 'REPO_ROOT'
  | 'SWARM_CONFIG';

export function readBusterEnvironment(
  key: BusterEnvironmentKey,
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  return env[key];
}

export function busterEnvironmentSnapshot(): Record<string, string | undefined> {
  return { ...process.env };
}
