export type NovaEnvironmentKey =
  | 'AGENT_NAME'
  | 'CURRENT_PROJECT'
  | 'DISCORD_WEBHOOK'
  | 'KUBECLAW_DISABLE_DISCORD_WEBHOOKS'
  | 'KUBECLAW_IMAGE_DIGEST'
  | 'NOVA_CHANNEL'
  | 'PIPELINE_CONTROL_ENABLED'
  | 'POD_NAMESPACE'
  | 'POD_UID'
  | 'PIPELINE_RUN_ID'
  | 'RUN_ID'
  | 'SWARM_CONFIG';

export function readNovaEnvironment(
  key: NovaEnvironmentKey,
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  return env[key];
}

export function novaEnvironmentSnapshot(): Record<string, string | undefined> {
  return { ...process.env };
}
