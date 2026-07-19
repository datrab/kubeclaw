#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const checkOnly = process.argv.includes('--check');

function readJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(root, relPath), 'utf8'));
}

function stableWriteMap() {
  const deploy = readJson('docs/generated/inventory/deploy-script.json');
  const secrets = readJson('docs/generated/inventory/secret-setup.json');
  const helm = readJson('docs/generated/inventory/helm-values.json');
  const workflows = readJson('docs/generated/inventory/workflows.json');

  return new Map([
    ['docs/reference/cli.md', renderCli(deploy)],
    ['docs/reference/secrets.md', renderSecrets(secrets)],
    ['docs/reference/helm-values.md', renderHelmValues(helm)],
    ['docs/reference/environment-variables.md', renderEnvironment(deploy, secrets)],
    ['docs/reference/verification-commands.md', renderVerification(deploy)],
    ['docs/reference/workflows.md', renderWorkflows(workflows)],
  ]);
}

function table(headers, rows) {
  const escape = (value) => String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', '<br>');
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escape).join(' | ')} |`),
  ].join('\n');
}

function generatedNotice(sources) {
  return [
    '<!-- BEGIN GENERATED: source-backed reference -->',
    '',
    `Generated from: ${sources.map((source) => `\`${source}\``).join(', ')}`,
    '',
  ].join('\n');
}

function generatedEnd() {
  return '\n\n<!-- END GENERATED -->\n';
}

function renderCli(deploy) {
  return `# CLI Reference

Status: generated reference
Audience: reference reader, operator, developer

## Summary

This page lists deployment CLI commands currently extracted from source inventory. Pipeline and Buster CLI references will be added in later inventory slices.

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

- \`../deployment/setup-flow.md\`
- \`../deployment/deployment-verification.md\`
- \`../operators/recovery-runbook.md\`

## Command Expectations

| Command group | Runtime owner | Expected artifacts or resources | Failure signals |
| --- | --- | --- | --- |
| setup and secrets | \`scripts/deploy.sh\`; \`my-values/setup-secrets.sh\` | namespace, required Kubernetes Secrets, Helm repositories, optional workspace namespace record | missing command, invalid secret setup mode, missing required Secret keys |
| infra | \`scripts/deploy.sh\`; \`my-values/infra/*.yaml\` | Redis, optional PostgreSQL/Qdrant/LiteLLM, registry helpers, NetworkPolicies, namespace fence | rollout timeout, Helm repo failure, invalid manifest, partial infra warning when \`ALLOW_PARTIAL_INFRA=true\` |
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

function renderSecrets(secrets) {
  return `# Secrets Reference

Status: generated reference
Audience: reference reader, operator

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
| Redis | \`my-values/setup-secrets.sh\`; \`my-values/infra/redis-values.yaml\` | agent and Buster Redis clients | Redis auth/connection failure, Buster task queue idle with connection errors |
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

function renderHelmValues(helm) {
  return `# Helm Values

Status: generated reference
Audience: reference reader, operator

## Summary

This page lists top-level keys and Secret references from the chart defaults, Nova/Buster values, and infrastructure values/manifests. Deeper per-value defaults will be added in later inventory slices.

${generatedNotice(helm.generatedFrom)}
## Values And Manifest Files

${table(['File', 'Top-level keys', 'Secret references'], helm.files.map((file) => [
  `\`${file.path}\``,
  file.topLevelKeys.map((key) => `\`${key}\``).join(', '),
  file.secretReferences.length
    ? file.secretReferences.map((ref) => `\`${ref.key}: ${ref.value}\` at line ${ref.line}`).join('<br>')
    : '',
]))}
${generatedEnd()}
## Used by

- \`../deployment/helm-chart.md\`
- \`../deployment/values-files.md\`
- \`../deployment/secrets.md\`
- \`../deployment/agent-deployments.md\`

## Runtime Meaning

| Value group | Runtime effect | Expected proof |
| --- | --- | --- |
| image and pull secrets | selects agent and sidecar images, tags, pull policy, and GHCR pull Secret | rendered Deployments include expected image refs and \`imagePullSecrets\` |
| auth/provider/Discord/Stitch/LiteLLM | selects direct values or existing Secret name/key references | rendered env refs point to expected Secret keys and generated secrets reference lists those keys |
| persistence and Buster worker | creates workspace/config PVCs plus pipeline-only BuildKit/result mounts | rendered PVCs, dedicated worker image, security contexts, and Buster volumes match production values |
| service and extra ports | exposes gateway/bridge ClusterIP ports plus explicit extra NodePorts | rendered Services contain only documented ports |
| buster namespace broker | adds lease CRD/RBAC/controller and controller env vars | Buster render includes CRD, lease client RBAC, controller Deployment, and namespace fence docs |
| probes, startup doctor, and dependency checks | configures runtime health script for gateway, Redis, Redis stream, LiteLLM, and Buster heartbeat checks; \`gateway.startupDoctor\` runs \`openclaw doctor --fix\` once after gateway health | rendered env vars, startup hook, and smoke commands exercise the health and doctor surfaces |

## Failure Signals

- A top-level value appears in this page but has no rendered effect: add deployment truth coverage or remove the stale value.
- Rendered Secret refs do not match \`my-values/setup-secrets.sh\`: update values, helper, inventory, and docs together.
- Buster values disable sandbox/broker behavior unexpectedly: inspect \`my-values/buster-values.yaml\` before changing chart templates.
- A live pod keeps old config after values change: remember the init container preserves persisted config unless override flags request replacement.

## Generated from

- \`../generated/inventory/helm-values.json\`
- \`../../scripts/docs-generate.mjs\`
`;
}

function renderEnvironment(deploy, secrets) {
  const combined = new Map();
  for (const item of [...deploy.environment, ...secrets.environment]) {
    if (!combined.has(item.name)) {
      combined.set(item.name, {
        name: item.name,
        description: item.description,
        deployDefault: deploy.defaults[item.name] ?? '',
        secretDefault: secrets.defaults[item.name] ?? '',
      });
    }
  }
  const rows = [...combined.values()].sort((a, b) => a.name.localeCompare(b.name));

  return `# Environment Variables

Status: generated reference
Audience: reference reader, operator

## Summary

This page lists deployment and secret setup environment variables extracted from the first generated inventory slice.

${generatedNotice([...deploy.generatedFrom, ...secrets.generatedFrom])}
## Variables

${table(['Name', 'Description', 'Deploy default', 'Secret setup default'], rows.map((item) => [
  `\`${item.name}\``,
  item.description,
  item.deployDefault ? `\`${item.deployDefault}\`` : '',
  item.secretDefault ? `\`${item.secretDefault}\`` : '',
]))}
${generatedEnd()}
## Ownership And Runtime Boundaries

| Variable group | Owner | Runtime effect | Verification |
| --- | --- | --- | --- |
| Namespace and workspace prompt | \`scripts/deploy.sh\`; \`my-values/setup-secrets.sh\` | selects the Kubernetes namespace and optionally records \`my-values/.workspace-namespace\` for local operator convenience | \`./scripts/deploy.sh status\`; generated inventory check |
| Component switches | \`scripts/deploy.sh\`; \`my-values/setup-secrets.sh\` | controls optional PostgreSQL, Qdrant, LiteLLM, and Tailscale setup paths; \`ALLOW_PARTIAL_INFRA\` changes rollout failures from fail-closed to warning | deployment truth plus live rollout status |
| Secret setup controls | \`my-values/setup-secrets.sh\` | chooses interactive/noninteractive/auto resolution, overwrite behavior, source namespace copies, and Tailscale OAuth bootstrap | \`kubectl -n "$NAMESPACE" get secret ...\`; \`kubectl -n "$TAILSCALE_OPERATOR_NAMESPACE" get secret operator-oauth\` |
| Code bundle selection | \`scripts/deploy.sh\` | derives GitHub release bundle URLs from repository + commit unless explicit archive URLs are provided | \`NOVA_CODE_BUNDLE_EXPECTED_COMMIT=<sha> ./scripts/deploy.sh code nova\`; \`BUSTER_CODE_BUNDLE_EXPECTED_COMMIT=<sha> ./scripts/deploy.sh code buster\` |

## Failure Modes

- Invalid boolean-like values can skip expected component paths or keep optional setup enabled; use the exact values listed in this table.
- Noninteractive secret setup warns when a required source is unavailable instead of inventing credentials.
- \`ALLOW_PARTIAL_INFRA=true\` is for troubleshooting only; the default infra path should fail closed on required rollout failures.
- Code deploy requires the expected commit for each targeted agent and, for private repositories, a bundle auth Secret the pod can use to fetch GitHub release assets.

## Checks

\`\`\`bash
npm run docs:inventory:check
npm run docs:generate:check
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
\`\`\`

## Generated from

- \`../generated/inventory/deploy-script.json\`
- \`../generated/inventory/secret-setup.json\`
- \`../../scripts/docs-generate.mjs\`
`;
}

function renderVerification(deploy) {
  const commands = deploy.commands.filter((command) => /smoke|status|image|code/.test(command.invocation));
  return `# Verification Commands

Status: generated reference
Audience: operator, developer

## Summary

This page lists deployment verification commands plus source-backed local checks.

${generatedNotice(deploy.generatedFrom)}
## Deployment Verification Commands

${table(['Command', 'Description'], commands.map((command) => [
  `\`${command.invocation}\``,
  command.description,
]))}
${generatedEnd()}
## Local Documentation And Deployment Checks

\`\`\`bash
./tests/verification/run-fast-verification.sh
./tests/verification/run-full-verification.sh
npm run docs:inventory:check
npm run docs:generate:check
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
git diff --check
\`\`\`

The fast/full verification wrappers are silent on clean passes. Passing warning output prints warning lines. Failed steps print the failed step name plus buffered output. Use \`--verbose\` or \`VERIFICATION_VERBOSE=1\` to stream step banners and passing output.

## Claim-To-Test Map

| Claim class | Source or verifier |
| --- | --- |
| Documentation inventory and generated references are current | \`npm run docs:inventory:check\`; \`npm run docs:generate:check\`; \`node scripts/docs-check.mjs\` |
| Fast local runtime, contract, docs, and canonical E2E checks pass | \`./tests/verification/run-fast-verification.sh\` |
| Exhaustive local verification surfaces pass | \`./tests/verification/run-full-verification.sh\` |
| Deployment manifests, NetworkPolicies, service exposure, PVCs, config mounts, and sandbox surfaces match source | \`node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"\` |
| Documentation surface links and generated docs expectations stay valid | \`npm run docs:check\` |
| Telemetry docs match the event envelope and sink contracts | \`node tests/verification/contracts/check-telemetry-contract.mjs --source-root "$PWD"\` |
| Restart, recovery, retry, crash, and resume behavior remain source-backed | \`node --test tests/verification/e2e/*.test.mjs\`; \`node tests/verification/e2e/run-real-pipeline-e2e.mjs --mode full\` |
| Status store lifecycle, artifacts, and Buster task settlement contracts stay stable | \`node tests/verification/contracts/check-status-store-slice-surface.mjs --source-root "$PWD"\`; \`node tests/verification/contracts/check-buster-pipeline-slice-surface.mjs --source-root "$PWD"\` |
| Proposed doc edits have no whitespace errors | \`git diff --check\` |
| Referenced source paths/config keys exist | Use a targeted \`test -e\`/ \`rg -q\` sanity check for newly cited paths and keys before closing the docs pass. |

## Generated from

- \`../generated/inventory/deploy-script.json\`
- \`../../scripts/docs-generate.mjs\`
`;
}

function renderWorkflows(workflows) {
  return `# Workflow Inventory

Status: generated reference
Audience: maintainer, developer

## Summary

This page lists repository GitHub Actions workflows, their trigger surfaces, path filters, jobs, schedules, and command/action references. Use it when docs, deployment, images, tests, skills, plugins, or CI behavior change.

${generatedNotice(workflows.generatedFrom)}
## Workflows

${table(['Workflow', 'Triggers', 'Path filters', 'Schedules', 'Jobs', 'Commands/actions'], workflows.workflows.map((workflow) => [
  `\`${workflow.path}\` (${workflow.name})`,
  workflow.triggers.map((trigger) => `\`${trigger}\``).join(', '),
  workflow.pathFilters.length ? workflow.pathFilters.map((filter) => `\`${filter}\``).join('<br>') : '',
  workflow.schedules.length ? workflow.schedules.map((schedule) => `\`${schedule}\``).join('<br>') : '',
  workflow.jobs.map((job) => `\`${job}\``).join(', '),
  workflow.commandAndActionRefs.map((ref) => `\`${ref}\``).join('<br>'),
]))}
${generatedEnd()}
## Drift Guardrails

| Guardrail | Protected surface | Failure signal |
| --- | --- | --- |
| \`npm run docs:check:generated\` | generated inventory and generated reference pages | stale \`docs/generated/inventory/*.json\` or stale generated reference Markdown |
| \`npm run docs:check:refs\` | local Markdown links and cited repository paths in active docs/current audit artifacts | missing doc, script, workflow, chart, config, test, skill, plugin, or root file path |
| \`npm run docs:check:coverage\` | documentation topic-map consistency | missing active docs referenced by the topic map or vague topic-map weakness language |
| \`git diff --check\` | whitespace hygiene in changed files | trailing whitespace or conflict-marker-like whitespace errors |

## Maintenance Notes

- Regenerate this page with \`npm run docs:inventory && npm run docs:generate\` after workflow files change.
- Keep workflow path filters broad enough to catch documented runtime drift. Prefer catching drift over saving a small amount of CI time.
- If a workflow command changes, update the human docs only when the changed command affects a documented operator/developer procedure.

## Generated from

- \`../generated/inventory/workflows.json\`
- \`../../scripts/docs-generate.mjs\`
`;
}

const outputs = stableWriteMap();
const stale = [];

for (const [relPath, expected] of outputs) {
  const absPath = path.join(root, relPath);
  if (checkOnly) {
    const actual = fs.existsSync(absPath) ? fs.readFileSync(absPath, 'utf8') : null;
    if (actual !== expected) stale.push(relPath);
  } else {
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, expected);
    console.log(`wrote ${relPath}`);
  }
}

if (checkOnly) {
  if (stale.length) {
    console.error('Generated reference docs are stale. Run: npm run docs:generate');
    for (const file of stale) console.error(`stale: ${file}`);
    process.exit(1);
  }
  console.log('generated reference docs are current');
}
