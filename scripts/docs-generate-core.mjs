import { renderCliDocumentationFacts } from './lib/cli/cli-semantic-composition.mjs';
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

export function renderCli(deploy, runtimeInputs, sourceLink = (sourcePath, line) => `\`${sourcePath}:${line}\``, nativeCli = null) {
  const publishedFlags = runtimeInputs.cliFlags.filter((flag) => ['operator-runtime', 'maintainer-verification'].includes(flag.surface));
  const definitions = publishedFlags.filter((flag) => flag.classification === 'definition');
  const derived = runtimeInputs.derivedValues;
  return `# CLI Reference

Status: generated reference
Audience: reference reader, operator, developer
Owner: platform-operations
Evidence: docs/generated/inventory/deploy-script.json; docs/generated/inventory/configuration-runtime-inputs.json; docs/generated/inventory/cli-surfaces.json; scripts/docs-generate.mjs
Applies to: deployment commands and published operator/developer CLI definitions
Last verified: generated from current inventory

## Summary

This page lists deployment commands and source-backed operator or developer CLI definitions. Internal documentation and one-time repository tooling remain in the machine inventory but is not a user command surface. Arguments passed to external commands are outside this inventory because their parsers and compatibility contracts belong to those commands; they are not KubeClaw option definitions.

${generatedNotice([...deploy.generatedFrom, 'docs/generated/inventory/configuration-runtime-inputs.json'])}
## Deployment Commands

${table(['Command', 'Description'], deploy.commands.map((command) => [
  `\`${command.invocation}\``,
  command.description,
]))}

## Component Flags

${deploy.componentFlags.map((flag) => `- \`${flag}\``).join('\n')}

## Additional Public Command Options

${(deploy.supplementalCliCommands ?? []).map(command => `\`${command.invocation}\`

${command.behavior}

${table(['Option', 'Value', 'Required / default', 'Meaning', 'Source'], command.options.map(option => [
  `\`${option.name}\``, option.value, option.default, option.meaning, sourceLink(command.sourcePath, option.line),
]))}`).join('\n\n')}

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
${nativeCli ? renderCliDocumentationFacts(nativeCli) : ''}
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

export function renderSecrets(secrets, runtimeInputs = { secrets: [] }, sourceLink = (sourcePath, line) => `\`${sourcePath}${line ? `:${line}` : ''}\``, retained = null) {
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
Last verified: ${retained ? `retained artifact ${retained.artifactRevision}; original sources ${retained.sourceRevision}; semantic owner ${retained.semanticOwnerRevision}` : 'generated from current inventory'}

${retained ? retained.notice : ''}## Summary

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

${retained ? 'These facts are retained observations from the pinned historical inventories, not a new recursive inspection or a current redaction run. Names, keys, source coordinates, producer evidence and historical qualification states stay unchanged. Only the explicitly source-bound PostgreSQL consumer explanations are corrected. Their current meaning evidence is separate from original fact links. No Secret values are acquired or rediscovered by this projection.' : 'The following facts come from recursive YAML inspection, exact Helm-template SecretKeyRef and volume sites, and Secret-key arguments in deployment scripts. A resource or key name is not a credential, so it remains visible. The generator redacts Secret values, identities, access lists, and credential-bearing URLs before it writes this page.'}

${table(['Kind and Secret', 'Namespace and condition', 'Keys', 'Purpose', 'Producer and consumers', 'Rotation', 'Failure', 'Source'], resolvedFacts.map((secret) => [
  secretIdentity(secret),
  `\`${secret.namespace ?? '<runtime namespace>'}\`<br>${secret.namespaceMeaning}<br>${secret.requiredWhen}`,
  renderedKeys(secret),
  secret.purpose,
  `Producer: ${secret.producer}<br>${secret.producers?.length ? `Producer evidence: ${secret.producers.map((producer) => sourceLink(producer.path, producer.line)).join(', ')}<br>` : ''}Consumer contract: ${secret.consumerAuthority}${retained?.meaningEvidence(secret) ?? ''}<br>${secret.consumers?.length ? `Consumer evidence: ${secret.consumers.map((consumer) => `${sourceLink(consumer.path, consumer.line)}${consumer.key ? ` key \`${consumer.key}\`` : ''}`).join('<br>')}` : 'No direct checked-in reference is available; use the consumer contract and command evidence.'}`,
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
: "\${EXPECTED_CONTEXT:?Use EXPECTED_CONTEXT from the bound administration shell}"
: "\${NAMESPACE:?Set NAMESPACE to the intended app namespace}"
bound_kubectl -n "$NAMESPACE" get secret openclaw-shared-secrets redis-secrets ghcr-secret git-deploy-key-nova git-deploy-key-buster
\`\`\`

Check the Tailscale OAuth Secret. Use the namespace and Secret name selected for
the deployment. These commands use the deployment script defaults when the
variables are absent or empty. Set both variables first if the installation uses other values.

\`\`\`bash
assert_cluster_binding
: "\${KUBECONFIG:?Set KUBECONFIG to the intended cluster binding}"
: "\${EXPECTED_CONTEXT:?Use EXPECTED_CONTEXT from the bound administration shell}"
TAILSCALE_OPERATOR_NAMESPACE="\${TAILSCALE_OPERATOR_NAMESPACE:-tailscale}"
TAILSCALE_OAUTH_SECRET_NAME="\${TAILSCALE_OAUTH_SECRET_NAME:-operator-oauth}"
bound_kubectl -n "$TAILSCALE_OPERATOR_NAMESPACE" get secret "$TAILSCALE_OAUTH_SECRET_NAME"
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

export function renderWorkflowTable(workflows) {
  // Documentation production belongs to the internal inventory. The reader
  // reference describes automation that builds, validates, or delivers the product.
  const productWorkflows = workflows.workflows.filter((workflow) => workflow.path !== '.github/workflows/docs-checks.yaml');
  return table(['Workflow', 'Triggers', 'Path filters', 'Schedules', 'Jobs', 'Commands/actions'], productWorkflows.map((workflow) => [
  `\`${workflow.path}\` (${workflow.name})`,
  workflow.triggers.map((trigger) => `\`${trigger}\``).join(', '),
  workflow.pathFilters.length ? workflow.pathFilters.map((filter) => `\`${filter}\``).join('<br>') : '',
  workflow.schedules.length ? workflow.schedules.map((schedule) => `\`${schedule}\``).join('<br>') : '',
  workflow.jobs.map((job) => `\`${job}\``).join(', '),
  workflow.commandAndActionRefs.map((ref) => `\`${ref}\``).join('<br>'),
]));
}

/** Current configuration hub; no retained snapshot or program-output API award. */
export function renderConfigurationFamilyHub(reference, sourceLink, {sourceRevision=null}={}) {
  if (reference.schemaVersion !== 'kubeclaw.configuration-family-reference.v1'
    || reference.composition.globalApiDiscoveryPassed !== false
    || typeof sourceLink !== 'function') throw new Error('CONFIGURATION_HUB_INPUT_INVALID');
  const relationKey = fact => JSON.stringify([fact.kind,fact.family,fact.source,fact.setting,fact.owner,fact.consumer,fact.defaultAndPrecedence,fact.reloadOrRetention,fact.sensitivity,fact.sourceSha256??null,fact.consumerRole??null]);
  if (!Array.isArray(reference.inverseConsumers)
    || reference.inverseConsumers.some(group => !Array.isArray(group.facts) || group.facts.some(fact => fact.consumer !== group.consumer))
    || JSON.stringify(reference.facts.map(relationKey).sort()) !== JSON.stringify(reference.inverseConsumers.flatMap(group => group.facts.map(relationKey)).sort())) {
    throw new Error('CONFIGURATION_HUB_INVERSE_RELATION_MISSING');
  }
  const snapshot = sourceRevision ? '`' + sourceRevision + '`' : 'working-source candidate; publication snapshot pending';
  const families = reference.families;
  for (const family of families) {
    if (!reference.facts.some(fact => fact.family === family.id)
      || !family.owner || !family.consumer || !family.defaultAndPrecedence || !family.reloadOrRetention) {
      throw new Error(`CONFIGURATION_HUB_FAMILY_LOOKUP_MISSING:${family.id}`);
    }
  }
  const source = name => '[`' + name + '`](' + sourceLink(name, 1, 1) + ')';
  const boundaries = reference.facts.filter(fact => ['family-boundary', 'direct-source-boundary'].includes(fact.kind));
  const inverse = [...new Set(boundaries.map(fact => fact.consumer))].sort().map(consumer => {
    const rows = boundaries.filter(fact => fact.consumer === consumer);
    const ids = [...new Set(rows.map(fact => fact.family))];
    return [source(consumer), ids.map(id => families.find(family => family.id === id).title).join('; '),
      [...new Set(rows.map(fact => fact.reference ?? families.find(family => family.id === fact.family).route))].join('<br>')];
  });
  const payloadBoundaries = reference.payloadBoundaries.filter(item => !item.executableBehaviorProved);
  return `# Configuration

Status: generated checked-in configuration reference; consumer boundaries below
Audience: operator, project author, plugin author, maintainer
Owner: documentation; each named consumer owns its setting semantics
Evidence: docs/generated/inventory/configuration-families.json; docs/config/configuration-family-map.json; scripts/docs-configuration-inventory.mjs
Applies to: current selected configuration families, source contracts and inverse-consumer routes
Last verified: ${reference.checkedInDate}; guarded source inventory, not a deployment or live-reload observation
Source snapshot: ${snapshot}

${generatedNotice(['docs/generated/inventory/configuration-families.json', 'docs/config/configuration-family-map.json'])}
## Find the setting before changing it

Start with the process or artifact that consumes the value, not its filename.
A Helm value, a platform grant and a stage setting can share a name without
sharing authority. Changing one does not override the other two.

1. Find the family or consuming component in the tables below.
2. Open its detailed reference and identify the exact field, version and default rule.
3. Follow that consumer's validation, change and recovery boundary before activation.

For input, result and checkpoint contracts that are not configuration settings,
use [Schema authorities](schemas.md). For a package versus a caller grant or
native-host permission, use [Roles and package ownership](roles-and-package-ownership.md).

## Select the configuration family

The detailed route supplies field-specific contracts. A schema shape, copied
file, generated result or successful compilation is not proof of activation.

${table(['Family / artifact', 'Selection', 'Consumer and authority', 'Defaults and override boundary', 'Detailed route'], families.map(family => [family.title, family.selection, family.consumerSummary, family.defaultAndPrecedence, family.route]))}

## Start from a consumer

Use the consumer below to return to its configuration family. The complete index of recorded
field contracts and whole-file delivery boundaries, including registration, transport, runtime and
explicit non-delivery roles, is in ${source('docs/generated/inventory/configuration-families.json')}.
A registration declaration or ConfigMap copy remains distinct from a runtime reader.
A payload source tree is not field-level runtime behavior: delivery of a whole file
does not prove that its tool or image reads every key or inserts a default.

${table(['Consuming source', 'Configuration family', 'Detailed route'], inverse)}

## Determine the effective value

There is no global last-writer-wins rule. Record the family first, then use
[Configuration precedence](configuration-precedence.md).

${table(['Input state', 'What to establish', 'Do not infer'], [
 ['Omitted field', 'Exact schema requirement and actual resolver/consumer fallback.', 'A displayed schema default is inserted by every caller.'],
 ['Empty string', 'Whether the receiver permits it, uses a nullish fallback or requires nonempty text.', 'Empty equals omitted.'],
 ['null, false or zero', 'The exact type/branch and the consumer condition.', 'All false-like values disable or clear a setting.'],
 ['Object or array', 'This family’s merge, replacement and resolution rules.', 'Helm, compact profiles and plugin configuration share one merge algorithm.'],
 ['Relative path', 'The loader’s canonical input and path origin.', 'Every path is relative to the current shell directory.'],
 ['Secret reference', 'Named Secret/key/file and the actual receiving process.', 'A reference proves contents, authorization or successful authentication.'],
])}

### Example: a provider default

Identify the contract ID and field in [Provider configuration](buster-provider-configuration.md).
Check whether the caller only validates or resolves provider configuration.
Ordinary validation does not insert defaults. Resolution clones values and
validates with default insertion; it does not install, grant or execute a provider.
Retain the non-secret contract/schema identity and selected field, not the resolved object.

### Example: an empty Prism URL

The control loader uses \`PRISM_WORKER_URL ?? 'http://prism-worker:8080'\`.
Omission selects that fallback; an empty string does not. It must still be a
valid URL. Composition captures the process environment before asynchronous
loading, so editing a Secret does not update an already captured configuration.
Use [Environment variables](environment-variables.md) and the exact receiving contract.

## Change and reload boundaries

A setting is hot only when its named consumer explicitly watches or rereads it.
Use [Configuration change impact](configuration-change-impact.md) for the procedure.

${table(['Configuration family', 'Change / retention boundary'], families.map(family => [family.title, family.reloadOrRetention]))}

## Diagnose without exposing secrets

1. Retain the first diagnostic, input version, canonical source and redacted owner identity.
2. Follow the family’s schema, registration, grant and receiver route. Do not widen unrelated authority.
3. Keep the prior working generation and unresolved cleanup state if activation fails.
4. Verify the actual receiving process before retiring a prior Secret or input generation.

Use [Common errors](common-errors.md) for a named diagnostic and
[Secrets](secrets.md) for redacted source/consumer/rotation boundaries.

## Source coverage and explicit limits

The current composition retains the selected YAML/Helm authority and receiver
checks, registered schemas, deployed and undeployed payload boundaries,
owned runtime/CLI inputs, configured environment selectors and direct host,
publication and durable-storage source contracts. The inverse index records
actual field contracts rather than promoting every candidate source file to a reader.

Local validation fixtures and documentation output do not become configuration
emitters because their bytes happen to be JSON, YAML or Kubernetes-shaped.
Dynamic or external input without qualified provenance is not evaluated as a
working setting. Generic acquisition limitations do not supply facts or defaults:
the included facts require their direct source and receiving contracts.

The broad executable program-output API discovery path is separate and is not
certified by this composition. It does not replace [API fields](api-object-updates.md),
prove a deployed effective value or establish successful reload, admission or rotation.

${payloadBoundaries.length ? `### Payloads without a proved checked-in runtime reader or delivery\n\n${table(['Source payload', 'Declared boundary'], payloadBoundaries.map(payload => [source(payload.path), payload.deliveryGap ?? payload.readerBoundary ?? payload.behaviorClassification]))}\n\nA source file or stored payload is not a working operator option when its reader or delivery is unproved.\n` : ''}
## Maintain this reference

Generate the guarded configuration artifacts with
\`node scripts/docs-configuration-inventory.mjs --configuration-reference-only\`,
then the hub with \`node scripts/docs-generate.mjs --only configuration-hub --revision COMMIT\`.
Use a reviewed commit containing the current source, map and inventory bytes.
This bounded route does not advance the shared documentation source lock.
Use their \`--check\` modes for drift. A changed selected source, missing family,
inverse consumer or source authority is a stop, not permission to relabel unknown data.
These commands do not claim the normal global configuration/API command passed.

${generatedEnd()}`;
}
