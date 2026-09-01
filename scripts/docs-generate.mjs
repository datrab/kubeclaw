#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {
  generatedEnd,
  generatedNotice,
  renderCli,
  renderSecrets,
  table,
} from './docs-generate-core.mjs';

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

- \`../deployment/README.md\`
- \`../deployment/secrets.md\`
- \`../deployment/agent-deployments.md\`

## Runtime Meaning

| Value group | Runtime effect | Expected proof |
| --- | --- | --- |
| image and pull secrets | selects agent and sidecar images, tags, pull policy, and GHCR pull Secret | rendered Deployments include expected image refs and \`imagePullSecrets\` |
| auth/provider/Discord/Stitch/LiteLLM | selects direct values or existing Secret name/key references | rendered env refs point to expected Secret keys and generated secrets reference lists those keys |
| persistence | creates workspace/config PVCs for gateway and plugin-runtime state | rendered PVCs and security contexts match production values |
| service and extra ports | exposes gateway/bridge ClusterIP ports plus explicit extra NodePorts | rendered Services contain only documented ports |
| buster namespace broker | adds lease CRD/RBAC/controller and controller env vars | Buster render includes CRD, lease client RBAC, controller Deployment, and namespace fence docs |
| probes, startup doctor, and dependency checks | configures gateway, Redis, and LiteLLM health checks; \`gateway.startupDoctor\` runs \`openclaw doctor --fix\` as a blocking init migration while the gateway is stopped | rendered init container, env vars, and smoke commands exercise the health and doctor surfaces |

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
npm run verify:plugin-system-v2
npm run typecheck:skills
npm run docs:inventory:check
npm run docs:generate:check
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
git diff --check
\`\`\`

## Claim-To-Test Map

| Claim class | Source or verifier |
| --- | --- |
| Documentation inventory and generated references are current | \`npm run docs:inventory:check\`; \`npm run docs:generate:check\`; \`node scripts/docs-check.mjs\` |
| Core, package, capability, lifecycle, recovery, isolation, and malicious-package checks pass | \`npm run verify:plugin-system-v2\` |
| Deployment manifests, NetworkPolicies, service exposure, PVCs, config mounts, and sandbox surfaces match source | \`node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"\` |
| Documentation surface links and generated docs expectations stay valid | \`npm run docs:check\` |
| Restart, recovery, retry, crash, and resume behavior remain source-backed | \`node tests/verification/contracts/check-plugin-system-v2-phase7.mjs\`; \`node tests/verification/contracts/check-plugin-system-v2-resume.mjs\` |
| The complete real model-backed workflow works | \`node tests/verification/e2e/run-real-pipeline-e2e.mts --mode full\` |
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
