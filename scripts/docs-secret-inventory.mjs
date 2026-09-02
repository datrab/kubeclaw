const SECRET_SPECS = [
  {
    name: 'openclaw-shared-secrets',
    namespace: 'NAMESPACE',
    requiredWhen: 'always; litellmApiKey is required when KUBECLAW_DEPLOY_LITELLM is enabled',
    keys: [
      'gatewayToken-forge',
      'gatewayToken-echo',
      'gatewayToken-buster',
      'busterV2Token',
      'gatewayToken-nova',
      'stitchApiKey',
      'discordToken-forge',
      'discordToken-echo',
      'discordToken-buster',
      'discordToken-nova',
      'discordWebhook',
      'litellmApiKey',
    ],
    setupFunction: 'setup_shared_secret',
  },
  {
    name: 'redis-secrets',
    namespace: 'NAMESPACE',
    requiredWhen: 'always',
    keys: ['redis-password'],
    setupFunction: 'setup_redis_secret',
  },
  {
    name: 'pipeline-test-gate-source-attestation',
    namespace: 'NAMESPACE',
    requiredWhen: 'Nova-to-Buster committed-source dispatch is enabled',
    keys: ['privateKey', 'publicKey'],
    setupFunction: 'setup_pipeline_source_attestation_secret',
  },
  {
    name: 'postgresql-secrets',
    namespace: 'NAMESPACE',
    requiredWhen: 'KUBECLAW_DEPLOY_POSTGRESQL is enabled',
    keys: ['postgres-password', 'litellm-password'],
    setupFunction: 'setup_postgresql_secret',
  },
  {
    name: 'litellm-secrets',
    namespace: 'NAMESPACE',
    requiredWhen: 'KUBECLAW_DEPLOY_LITELLM is enabled',
    keys: ['LITELLM_MASTER_KEY', 'DATABASE_URL'],
    setupFunction: 'setup_litellm_secret',
  },
  {
    name: 'google-sa-key',
    namespace: 'NAMESPACE',
    requiredWhen: 'KUBECLAW_DEPLOY_LITELLM is enabled',
    keys: ['credentials.json'],
    setupFunction: 'setup_google_sa_key',
  },
  {
    name: 'ghcr-secret',
    namespace: 'NAMESPACE',
    requiredWhen: 'always when imagePullSecrets reference GHCR',
    keys: ['.dockerconfigjson'],
    setupFunction: 'setup_ghcr_secret',
  },
  {
    name: 'git-deploy-key-nova',
    namespace: 'NAMESPACE',
    requiredWhen: 'Nova git checkout is enabled',
    keys: ['id_rsa'],
    setupFunction: 'setup_git_deploy_key git-deploy-key-nova Nova',
    evidenceNeedle: 'setup_git_deploy_key git-deploy-key-nova Nova',
  },
  {
    name: 'git-deploy-key-buster',
    namespace: 'NAMESPACE',
    requiredWhen: 'Buster git checkout is enabled',
    keys: ['id_rsa'],
    setupFunction: 'setup_git_deploy_key git-deploy-key-buster Buster',
    evidenceNeedle: 'setup_git_deploy_key git-deploy-key-buster Buster',
  },
  {
    name: 'operator-oauth',
    namespace: 'TAILSCALE_OPERATOR_NAMESPACE',
    requiredWhen: 'TAILSCALE_OPERATOR_ENABLED is enabled',
    keys: ['client_id', 'client_secret'],
    setupFunction: 'setup_tailscale_oauth_secret',
  },
];

const SETUP_ORDER = [
  'setup_shared_secret',
  'setup_pipeline_source_attestation_secret',
  'setup_redis_secret',
  'setup_postgresql_secret when KUBECLAW_DEPLOY_POSTGRESQL is enabled',
  'setup_litellm_secret when KUBECLAW_DEPLOY_LITELLM is enabled',
  'rewrite_litellm_database_url_namespace when KUBECLAW_DEPLOY_LITELLM is enabled',
  'setup_google_sa_key when KUBECLAW_DEPLOY_LITELLM is enabled',
  'setup_ghcr_secret',
  'setup_git_deploy_key git-deploy-key-nova Nova',
  'setup_git_deploy_key git-deploy-key-buster Buster',
  'setup_tailscale_oauth_secret',
];

const RESOLUTION_ORDER = [
  'reuse complete target Secret unless KUBECLAW_SECRETS_OVERWRITE is true',
  'patch missing keys interactively when a target Secret exists and a TTY is available',
  'create openclaw-shared-secrets from SOPS file when present',
  'copy source namespace Secret from SRC_NS when present',
  'prompt or generate values interactively when allowed',
  'warn in noninteractive mode when required input is unavailable',
];

export function buildSecretSetupInventory({
  read,
  parseHeaderEnv,
  parseDefaultAssignments,
  lineNumber,
}) {
  const scriptPath = 'my-values/setup-secrets.sh';
  const text = read(scriptPath);
  const environment = parseHeaderEnv(text);
  const secrets = SECRET_SPECS.map(({ evidenceNeedle, ...secret }) => ({
    ...secret,
    evidenceLine: lineNumber(text, evidenceNeedle ?? `${secret.setupFunction}()`),
  }));

  return {
    generatedFrom: [scriptPath],
    environment,
    defaults: parseDefaultAssignments(text, environment.map(({ name }) => name)),
    setupOrder: SETUP_ORDER,
    resolutionOrder: RESOLUTION_ORDER,
    secrets,
  };
}
