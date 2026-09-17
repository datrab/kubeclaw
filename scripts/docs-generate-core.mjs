export function table(headers, rows) {
  const escape = (value) => String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', '<br>');
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escape).join(' | ')} |`),
  ].join('\n');
}

export function generatedNotice(sources) {
  return [
    '<!-- BEGIN GENERATED: source-backed reference -->',
    '',
    `Generated from: ${sources.map((source) => `\`${source}\``).join(', ')}`,
    '',
  ].join('\n');
}

export function generatedEnd() {
  return '\n\n<!-- END GENERATED -->\n';
}

export function renderCli(deploy) {
  return `# CLI Reference

Status: generated reference
Audience: reference reader, operator, developer
Owner: platform-operations
Evidence: docs/generated/inventory/deploy-script.json; scripts/docs-generate.mjs
Applies to: deployment command surface
Last verified: generated from current inventory

## Summary

This page lists deployment CLI commands found in the current source inventory. It covers the commands that the repository exposes today.

${generatedNotice(deploy.generatedFrom)}
## Deployment Commands

${table(['Command', 'Description'], deploy.commands.map((command) => [
  `\`${command.invocation}\``,
  command.description,
]))}

## Command Cases

${deploy.commandCases.map((command) => `- \`${command}\``).join('\n')}

## Component Flags

${deploy.componentFlags.map((flag) => `- \`${flag}\``).join('\n')}
${generatedEnd()}
## Used by

- [Install and Bootstrap](../use/install.md)
- [Operate a Pipeline](../use/operate.md)
- [Recover the Platform](../use/recovery.md)

## Command Expectations

| Command group | Runtime owner | Expected artifacts or resources | Failure signals |
| --- | --- | --- | --- |
| setup and secrets | \`scripts/deploy.sh\`; \`my-values/setup-secrets.sh\` | namespace, required Kubernetes Secrets, Helm repositories, optional workspace namespace record | missing command, invalid secret setup mode, missing required Secret keys |
| infra | \`scripts/deploy.sh\`; \`my-values/infra/*.yaml\` | Redis, optional PostgreSQL/LiteLLM, registry helpers, NetworkPolicies, namespace fence | rollout timeout, Helm repo failure, invalid manifest, partial infra warning when \`ALLOW_PARTIAL_INFRA=true\` |
| agents | \`charts/kubeclaw/templates/*.yaml\`; \`my-values/nova-values.yaml\`; \`my-values/buster-values.yaml\` | \`Deployment/agent-nova\`, \`Deployment/agent-buster\`, Services, PVCs, runtime ConfigMaps | Helm render failure, image pull failure, init-container Git/config/skill error |
| image, code, and smoke | \`scripts/deploy.sh\`; chart health script | targeted rollouts, bundle/image selection, pod smoke output | rollout timeout, bundle download failure, gateway health failure, Redis/LiteLLM dependency failure |
| teardown | \`scripts/deploy.sh\` | removed Helm releases/resources according to selected teardown scope | confirmation prompt mismatch, retained PVCs or Secrets that need manual review |

## Verification

\`\`\`bash
npm run docs:inventory:check
npm run docs:generate:check
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
git diff --check
\`\`\`

This generated page proves command inventory and documented command groups. It does not prove live provider credentials, Tailscale tailnet policy, node firewall rules, or CNI enforcement.

## Generated from

- \`../generated/inventory/deploy-script.json\`
- \`../../scripts/docs-generate.mjs\`
`;
}

export function renderSecrets(secrets) {
  return `# Secrets Reference

Status: generated reference
Audience: reference reader, operator
Owner: platform-security
Evidence: docs/generated/inventory/secret-setup.json; scripts/docs-generate.mjs
Applies to: Kubernetes secret setup
Last verified: generated from current inventory

## Summary

This page lists Kubernetes Secrets created, reused, copied, or checked by the KubeClaw secret setup helper.

${generatedNotice(secrets.generatedFrom)}
## Secret Resolution Order

${secrets.resolutionOrder.map((step, index) => `${index + 1}. ${step}`).join('\n')}

## Secret Setup Order

${secrets.setupOrder.map((step, index) => `${index + 1}. ${step}`).join('\n')}

## Secrets

${table(['Secret', 'Namespace', 'Required when', 'Keys', 'Setup source'], secrets.secrets.map((secret) => [
  `\`${secret.name}\``,
  `\`${secret.namespace}\``,
  secret.requiredWhen,
  secret.keys.map((key) => `\`${key}\``).join(', '),
  `${secret.setupFunction}${secret.evidenceLine ? `, line ${secret.evidenceLine}` : ''}`,
]))}
${generatedEnd()}
## Examples

Check required app namespace Secrets:

\`\`\`bash
kubectl -n "$NAMESPACE" get secret openclaw-shared-secrets redis-secrets ghcr-secret git-deploy-key-nova git-deploy-key-buster
\`\`\`

Check Tailscale OAuth Secret:

\`\`\`bash
kubectl -n tailscale get secret operator-oauth
\`\`\`

## Secret Ownership And Failure Signals

| Secret group | Created or reused by | Consumed by | Failure signal |
| --- | --- | --- | --- |
| shared OpenClaw credentials | \`my-values/setup-secrets.sh\`; chart values using \`openclaw-shared-secrets\` | gateway config, agent env, Discord/webhook wiring, provider credentials | missing key warning, gateway auth failure, Discord/provider credential failure |
| Redis | \`my-values/setup-secrets.sh\`; \`my-values/infra/redis-values.yaml\` | optional telemetry transport and agent-observability ingestion | Redis auth/connection failure or delayed live telemetry; pipeline and Buster job authority remain independent |
| PostgreSQL and LiteLLM | \`my-values/setup-secrets.sh\`; LiteLLM infra manifests | optional PostgreSQL chart and LiteLLM deployment | LiteLLM rollout failure, invalid \`DATABASE_URL\`, missing \`LITELLM_MASTER_KEY\` |
| GHCR and Git deploy keys | \`my-values/setup-secrets.sh\`; agent values | image pull and init-container Git clone | \`ImagePullBackOff\`, missing \`/secrets/ssh/id_rsa\`, Git clone failure |
| Tailscale OAuth | \`my-values/setup-secrets.sh\`; Tailscale operator values | official Tailscale Kubernetes Operator | missing \`IngressClass/tailscale\`, no final-preview URL, operator auth errors |

## Recovery Notes

- Existing Secrets are reused unless \`KUBECLAW_SECRETS_OVERWRITE=true\`.
- Noninteractive setup never invents provider credentials; pre-create/copy Secrets or run with \`KUBECLAW_SECRET_SETUP_MODE=interactive\`.
- If a Secret exists but is missing keys, patch only the missing keys or intentionally rerun setup with overwrite.
- Run deployment truth after changing the helper or generated inventory so rendered Secret refs stay in sync.

## Generated from

- \`../generated/inventory/secret-setup.json\`
- \`../../scripts/docs-generate.mjs\`
`;
}
