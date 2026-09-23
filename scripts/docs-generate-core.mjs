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

export function renderCli(deploy, runtimeInputs, sourceLink = (sourcePath, line) => `\`${sourcePath}:${line}\``) {
  const publishedFlags = runtimeInputs.cliFlags.filter((flag) => ['operator-runtime', 'maintainer-verification'].includes(flag.surface));
  const definitions = publishedFlags.filter((flag) => flag.classification === 'definition');
  const derived = runtimeInputs.derivedValues;
  return `# CLI Reference

Status: generated reference
Audience: reference reader, operator, developer
Owner: platform-operations
Evidence: docs/generated/inventory/deploy-script.json; docs/generated/inventory/configuration-runtime-inputs.json; scripts/docs-generate.mjs
Applies to: deployment commands and published operator/developer CLI definitions
Last verified: generated from current inventory

## Summary

This page lists deployment commands and source-backed operator or developer CLI definitions. Internal documentation and one-time repository tooling remains in the machine inventory but is not a user command surface. Arguments passed to external commands are outside this inventory because their parsers and compatibility contracts belong to those commands; they are not KubeClaw option definitions.

${generatedNotice([...deploy.generatedFrom, 'docs/generated/inventory/configuration-runtime-inputs.json'])}
## Deployment Commands

${table(['Command', 'Description'], deploy.commands.map((command) => [
  `\`${command.invocation}\``,
  command.description,
]))}

## Command Cases

${deploy.commandCases.map((command) => `- \`${command}\``).join('\n')}

## Component Flags

${deploy.componentFlags.map((flag) => `- \`${flag}\``).join('\n')}

## Defined Flags

${table(['Flag', 'Surface', 'Value and type', 'Required and default', 'Authored guide', 'Owner and consumer', 'Precedence and impact', 'Failure meaning', 'Source'], definitions.map((flag) => [
  `\`${flag.name}\`${flag.aliasFor ? `<br>alias for \`${flag.aliasFor}\`` : ''}`,
  `\`${flag.surface}\``,
  `${flag.valueTaking === true ? 'takes a value' : flag.valueTaking === false ? 'no separate value' : 'arity not proved by source'}<br>${flag.type}`,
  `${flag.required}; ${flag.default}<br>${flag.requiredReason}`,
  flag.documentationAuthority
    ? sourceLink(flag.documentationAuthority.replace(/:[0-9]+$/u, ''), Number(flag.documentationAuthority.match(/:([0-9]+)$/u)?.[1] ?? 1))
    : flag.documentationReason,
  `Owner: ${flag.ownerComponent}<br>Consumer: ${flag.consumers.map((consumer) => `${consumer.kind} at ${consumer.path}:${consumer.line}`).join('<br>')}`,
  `${flag.precedence.join(' → ')}<br>${flag.changeImpact}`,
  `${flag.failureMeaning}<br>Unknown options: ${flag.unknownOptionBehavior}<br>Duplicates: ${flag.duplicateOptionBehavior}`,
  sourceLink(flag.path, flag.line),
]))}

## Derived Script Values

Presentation-only shell constants are not operator configuration. Runtime-derived rows show calculated values and their input variables.

${table(['Name', 'Class', 'Formula and analysis', 'Inputs', 'Precedence', 'Owner and consumer', 'Impact', 'Source'], derived.map((item) => [
  `\`${item.name}\``,
  `\`${item.classification}\``,
  `\`${item.formula}\`<br>${item.analysisStatus}${item.unsupportedReason ? `: ${item.unsupportedReason}` : ''}`,
  item.inputs.length ? item.inputs.map((name) => `\`${name}\``).join(', ') : 'none',
  item.precedence.join(' → '),
  `${item.ownerComponent}<br>${item.consumers.map((consumer) => `${consumer.kind} at ${consumer.path}:${consumer.line}`).join('<br>')}`,
  `${item.changeImpact}<br>${item.failureMeaning}`,
  sourceLink(item.path, item.line),
]))}
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
- \`../generated/inventory/configuration-runtime-inputs.json\`
- \`../../scripts/docs-generate.mjs\`
`;
}

export function renderSecrets(secrets, runtimeInputs = { secrets: [] }, sourceLink = (sourcePath, line) => `\`${sourcePath}${line ? `:${line}` : ''}\``) {
  // A configured Helm expression can produce a non-literal Secret name while
  // still having a complete, source-backed authority and consumer contract.
  // Keep those facts in the normal reference. Only semantic blockers belong in
  // the dynamic-name remediation table.
  const resolvedFacts = runtimeInputs.secrets.filter((secret) => secret.semanticStatus === 'authored-secret-authority');
  const unresolvedFacts = runtimeInputs.secrets.filter((secret) => secret.semanticStatus !== 'authored-secret-authority');
  const renderedKeys = (secret) => {
    if (secret.key) return `\`${secret.key}\``;
    return secret.keys?.map((key) => secret.keyConditions?.[key]
      ? `\`${key}\`<br>${secret.keyConditions[key]}` : `\`${key}\``).join('<br>') ?? '';
  };
  const secretIdentity = (secret) => {
    const stableAuthority = secret.authorityId && secret.authorityId !== secret.name
      ? `<br>Stable authority: \`${secret.authorityId}\`` : '';
    const nameState = secret.literalNameResolved === false ? '<br>Name is resolved when Helm renders the release.' : '';
    return `\`${secret.kind}\`<br>\`${secret.name}\`${stableAuthority}${nameState}`;
  };
  return `# Secrets Reference

Status: generated reference
Audience: reference reader, operator
Owner: platform-security
Evidence: docs/generated/inventory/secret-setup.json; docs/generated/inventory/configuration-runtime-inputs.json; scripts/docs-generate.mjs
Applies to: Kubernetes secret setup and checked-in Secret references
Last verified: generated from current inventory

## Summary

This page lists Kubernetes Secrets created, reused, copied, checked, or referenced by checked-in KubeClaw sources.

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
  (secret.keys ?? (secret.key ? [secret.key] : [])).map((key) => `\`${key}\``).join(', '),
  `${secret.setupFunction}<br>${sourceLink('my-values/setup-secrets.sh', secret.evidenceLine ?? null)}`,
]))}

## Discovered Declarations And References

The following facts come from recursive YAML inspection, exact Helm-template SecretKeyRef and volume sites, and Secret-key arguments in deployment scripts. A resource or key name is not a credential, so it remains visible. The generator redacts Secret values, identities, access lists, and credential-bearing URLs before it writes this page.

${table(['Kind and Secret', 'Namespace and condition', 'Keys', 'Purpose', 'Producer and consumers', 'Rotation', 'Failure', 'Source'], resolvedFacts.map((secret) => [
  secretIdentity(secret),
  `\`${secret.namespace ?? '<runtime namespace>'}\`<br>${secret.namespaceMeaning}<br>${secret.requiredWhen}`,
  renderedKeys(secret),
  secret.purpose,
  `Producer: ${secret.producer}<br>${secret.producers?.length ? `Producer evidence: ${secret.producers.map((producer) => sourceLink(producer.path, producer.line)).join(', ')}<br>` : ''}Consumer contract: ${secret.consumerAuthority}<br>${secret.consumers?.length ? `Consumer evidence: ${secret.consumers.map((consumer) => `${sourceLink(consumer.path, consumer.line)}${consumer.key ? ` key \`${consumer.key}\`` : ''}`).join('<br>')}` : 'No direct checked-in reference is available; use the consumer contract and command evidence.'}`,
  `Owner: ${secret.rotationOwner}<br>${secret.rotation}`,
  secret.failure,
  `${secret.nameSource ? `Name authority: ${secret.nameSource}<br>` : ''}${sourceLink(secret.path, secret.line)}${secret.fieldPath ? `<br>\`${secret.fieldPath}\`` : ''}`,
]))}

${unresolvedFacts.length ? `## Dynamic Secret Names

The following shell commands construct a Secret name at runtime. Their owning interface must supply the listed name authority before this reference can publish them as resolved declarations.

${table(['Source/name expression', 'Keys', 'Owner', 'Required name authority'], unresolvedFacts.map((secret) => [
  `\`${secret.path}:${secret.line}\`<br>\`${secret.name}\``,
  secret.keys?.map((key) => `\`${key}\``).join(', ') || 'not statically resolved',
  secret.blockerOwner,
  secret.closureCondition,
]))}
` : ''}
${generatedEnd()}
## Examples

Run live checks only in the bound administration shell defined by
[Bind Cluster Authority](../use/install.md#bind-cluster-authority). Keep its
read-only kubeconfig and expected cluster identity in that shell; stop on any
binding mismatch.

Check required app namespace Secrets:

\`\`\`bash
assert_cluster_binding
: "\${KUBECONFIG:?Set KUBECONFIG to the intended cluster binding}"
: "\${KUBE_CONTEXT:?Set KUBE_CONTEXT to the intended context}"
: "\${NAMESPACE:?Set NAMESPACE to the intended app namespace}"
kubectl --kubeconfig "$KUBECONFIG" --context "$KUBE_CONTEXT" -n "$NAMESPACE" get secret openclaw-shared-secrets redis-secrets ghcr-secret git-deploy-key-nova git-deploy-key-buster
\`\`\`

Check Tailscale OAuth Secret:

\`\`\`bash
assert_cluster_binding
: "\${KUBECONFIG:?Set KUBECONFIG to the intended cluster binding}"
: "\${KUBE_CONTEXT:?Set KUBE_CONTEXT to the intended context}"
kubectl --kubeconfig "$KUBECONFIG" --context "$KUBE_CONTEXT" -n tailscale get secret operator-oauth
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
- \`../generated/inventory/configuration-runtime-inputs.json\`
- \`../../scripts/docs-configuration-inventory.mjs\`
- \`../../scripts/docs-generate.mjs\`
`;
}
