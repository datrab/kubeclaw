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

  return new Map([
    ['docs/reference/cli.md', renderCli(deploy)],
    ['docs/reference/secrets.md', renderSecrets(secrets)],
    ['docs/reference/helm-values.md', renderHelmValues(helm)],
    ['docs/reference/environment-variables.md', renderEnvironment(deploy, secrets)],
    ['docs/reference/verification-commands.md', renderVerification(deploy)],
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
## Generated from

- \`../generated/inventory/deploy-script.json\`
- \`../generated/inventory/secret-setup.json\`
- \`../../scripts/docs-generate.mjs\`
`;
}

function renderVerification(deploy) {
  const commands = deploy.commands.filter((command) => /smoke|status|verify|build-local/.test(command.invocation));
  return `# Verification Commands

Status: generated reference
Audience: operator, developer

## Summary

This page lists deployment verification commands from the first generated inventory slice plus source-backed local checks used during the documentation rebuild.

${generatedNotice(deploy.generatedFrom)}
## Deployment Verification Commands

${table(['Command', 'Description'], commands.map((command) => [
  `\`${command.invocation}\``,
  command.description,
]))}
${generatedEnd()}
## Local Documentation And Deployment Checks

\`\`\`bash
npm run docs:inventory:check
npm run docs:generate:check
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
git diff --check
\`\`\`

## Generated from

- \`../generated/inventory/deploy-script.json\`
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
