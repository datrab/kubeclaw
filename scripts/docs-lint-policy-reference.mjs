#!/usr/bin/env node

import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const policyPath = path.join(root, 'charts/kubeclaw/files/config/lint-policy.json');
const target = path.join(root, 'docs/site/reference/lint-policy-generated.md');
const revision = '32b02816cc19cc8865a45b221b8b6ca28e99e8fb';
const versionsPath = path.join(root, 'versions.json');
const novaToolsPackagePath = path.join(root, 'docker/nova-tools/package.json');
const novaToolsLockPath = path.join(root, 'docker/nova-tools/package-lock.json');

const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
const configDirectory = path.dirname(policyPath);
const baselinePath = path.resolve(configDirectory, policy.baseline_path);
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const packs = policy.kubernetes_policy_packs.map((reference) => {
  const absolutePath = path.resolve(configDirectory, reference.path);
  const contents = fs.readFileSync(absolutePath);
  const digest = crypto.createHash('sha256').update(contents).digest('hex');
  if (digest !== reference.sha256) throw new Error(`Policy pack ${reference.id} digest does not match ${reference.path}.`);
  const pack = JSON.parse(contents);
  if (pack.id !== reference.id || pack.version !== reference.version) {
    throw new Error(`Policy pack ${reference.path} identity/version does not match its policy reference.`);
  }
  return { reference, pack };
});
const repositoryVersions = JSON.parse(fs.readFileSync(versionsPath, 'utf8'));
const novaToolsPackage = JSON.parse(fs.readFileSync(novaToolsPackagePath, 'utf8'));
const novaToolsLock = JSON.parse(fs.readFileSync(novaToolsLockPath, 'utf8'));
const lockedDirectDependencies = novaToolsLock.packages?.['']?.dependencies ?? {};
for (const [name, version] of Object.entries(novaToolsPackage.dependencies)) {
  if (lockedDirectDependencies[name] !== version) {
    throw new Error(`Nova tools lock does not preserve direct dependency ${name}@${version}.`);
  }
}
const { TOOL_ADAPTERS } = await import(path.join(
  root, 'skills/nova/plugins/lint/src/engine/tool-registry.ts'));
const adapters = new Map(TOOL_ADAPTERS.map((adapter) => [adapter.id, adapter]));
const policyToolIds = policy.tools.map((tool) => tool.id);
const adapterIds = TOOL_ADAPTERS.map((adapter) => adapter.id);
if (new Set(policyToolIds).size !== policyToolIds.length) throw new Error('Lint policy contains duplicate tool IDs.');
if (new Set(adapterIds).size !== adapterIds.length) throw new Error('Lint registry contains duplicate adapter IDs.');
if (policyToolIds.some((id) => !adapters.has(id))
  || adapterIds.some((id) => !policyToolIds.includes(id))) {
  throw new Error('Lint policy and adapter registry do not contain the same tool IDs.');
}
const eslintConfigs = await Promise.all([
  'eslint.config.mjs', 'eslint-type-evidence-config.mjs',
  'eslint-type-evidence-tests-config.mjs', 'eslint-type-evidence-generated-config.mjs',
].map((file) => import(path.join(root, 'charts/kubeclaw/files/config', file))));
const eslintRuleIds = [...new Set(eslintConfigs.flatMap(({ default: groups }) =>
  groups.flatMap((group) => Object.keys(group.rules ?? {}))))].sort();
const semgrepSource = fs.readFileSync(path.join(root, 'charts/kubeclaw/files/config/.semgrep.yml'), 'utf8');
const semgrepRuleIds = [...semgrepSource.matchAll(/^\s*- id:\s*([^\s]+)$/gmu)]
  .map((match) => match[1]).sort();
const lintSourcePaths = fs.readdirSync(path.join(root, 'skills/nova/plugins/lint/src/engine'))
  .filter((file) => file.endsWith('.ts'))
  .map((file) => path.join(root, 'skills/nova/plugins/lint/src/engine', file))
  .concat(['request.ts', 'adapter.ts', 'candidate.ts', 'stage.ts'].map((file) =>
    path.join(root, 'skills/nova/plugins/lint/src', file)))
  .concat(path.join(root, 'scripts/run-lint-report.mjs'));

function literalValues(node) {
  const values = [];
  const comparisonOperators = new Set([
    ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.EqualsEqualsEqualsToken,
    ts.SyntaxKind.ExclamationEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ]);
  const visit = (child) => {
    const comparisonLiteral = ts.isStringLiteralLike(child) && ts.isBinaryExpression(child.parent)
      && comparisonOperators.has(child.parent.operatorToken.kind);
    if (ts.isStringLiteralLike(child) && !ts.isTemplateExpression(child)
      && !comparisonLiteral) values.push(child.text);
    else ts.forEachChild(child, visit);
  };
  visit(node);
  return values;
}

function propertyName(node) {
  return node.name && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name))
    ? node.name.text : null;
}

export function fixedCodeInventory(sourcePaths = lintSourcePaths) {
  const codes = new Set();
  const codeParameters = new Map();
  const sources = sourcePaths.map((sourcePath) => ts.createSourceFile(
    sourcePath, fs.readFileSync(sourcePath, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS));
  for (const source of sources) {
    const findCodeParameters = (node) => {
      if (ts.isFunctionDeclaration(node) && node.name) {
        const index = node.parameters.findIndex((parameter) => ts.isIdentifier(parameter.name)
          && parameter.name.text === 'code');
        if (index >= 0) codeParameters.set(node.name.text, index);
      }
      ts.forEachChild(node, findCodeParameters);
    };
    findCodeParameters(source);
  }
  for (const source of sources) {
    const visit = (node) => {
      if ((ts.isPropertyAssignment(node) || ts.isPropertyDeclaration(node))
        && propertyName(node) === 'code' && node.initializer) {
        for (const value of literalValues(node.initializer)) codes.add(value);
      }
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)
        && node.name.text === 'code' && node.initializer) {
        for (const value of literalValues(node.initializer)) codes.add(value);
      }
      if (ts.isCallExpression(node)) {
        const name = ts.isIdentifier(node.expression) ? node.expression.text : null;
        const codeIndex = name === 'failConfigMissing' ? 0 : codeParameters.get(name);
        if (codeIndex !== undefined && node.arguments[codeIndex]) {
          for (const value of literalValues(node.arguments[codeIndex])) codes.add(value);
        }
        if (name === 'requireInside' && node.arguments[2]) {
          for (const label of literalValues(node.arguments[2])) {
            codes.add(`${label}_INVALID`);
            codes.add(`${label}_DENIED`);
          }
        }
        if (name === 'kubeconformTool') {
          codes.add(node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])
            ? node.arguments[0].text : 'kubeconform');
        }
      }
      if (ts.isNewExpression(node) && ts.isIdentifier(node.expression)
        && node.expression.text === 'Error' && node.arguments?.[0]) {
        const argument = node.arguments[0];
        const candidate = ts.isTemplateExpression(argument) ? argument.head.text :
          (ts.isStringLiteralLike(argument) ? argument.text : '');
        const match = /^(?:LINT|ADAPTER)_[A-Z0-9_]+/u.exec(candidate);
        if (match) codes.add(match[0]);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return [...codes].filter((value) => value !== 'LINT_POLICY_PATH'
    && value !== 'LINT_WORKING_DIRECTORY').sort();
}

const architectureSource = fs.readFileSync(
  path.join(root, 'skills/nova/plugins/lint/src/engine/architecture-tools.ts'), 'utf8');
const knipBlock = /const KNIP_CATEGORIES = \{([\s\S]*?)\n\};/u.exec(architectureSource)?.[1] ?? '';
const knipCodeIds = [...knipBlock.matchAll(/^\s*([A-Za-z]+):/gmu)]
  .map((match) => `knip:${match[1]}`)
  .filter((codeValue) => codeValue !== 'knip:devDependencies');
export function generatedCodeInventory() {
  return [...new Set([...fixedCodeInventory(), ...knipCodeIds])].sort();
}
const generatedCodeIds = generatedCodeInventory();
export const DYNAMIC_CODE_FAMILIES = [
  'kubernetes-policy/<rule-id>', '<tool>-timeout', '<tool>-execution-failed',
  '<tool>-parse-failed',
];
export const UPSTREAM_CODE_FAMILIES = [
  'TS<number>', 'Ruff rule code', 'SC<number>', 'ESLint rule ID', 'Mypy error code',
  'Staticcheck code', 'OSV identifier', 'TFLint rule name', 'Trivy issue ID',
  'Hadolint code', 'Semgrep rule ID',
];

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

const directConfigNames = [...new Set(policy.tools.map((tool) => tool.config_path).filter(Boolean))].sort();
const localImports = directConfigNames.filter((name) => name.endsWith('.mjs')).flatMap((name) => {
  const source = fs.readFileSync(path.join(configDirectory, name), 'utf8');
  return [...source.matchAll(/from\s+['"]\.\/([^'"]+)['"]/gu)].map((match) => match[1]);
});
const implicitConfigNames = [...new Set([
  ...localImports,
  ...([...architectureSource.matchAll(/['"](jscpd-tests\.json)['"]/gu)].map((match) => match[1])),
])].filter((name) => !directConfigNames.includes(name)).sort();
const configDigestRows = [
  ...directConfigNames.map((name) => [name, 'explicit policy `config_path`']),
  ...implicitConfigNames.map((name) => [name, 'implicit imported or companion source']),
].map(([name, ownership]) => `| \`${name}\` | ${ownership} | \`${sha256(path.join(configDirectory, name))}\` |`).join('\n');

function cell(value) {
  if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) return '—';
  const text = Array.isArray(value) ? value.join('<br>') : String(value);
  return text.replaceAll('|', '\\|').replaceAll('\n', '<br>');
}

function code(value) {
  if (value === '—') return value;
  return value.split('<br>').map((item) => `\`${item.replaceAll('`', '\\`')}\``).join('<br>');
}

function list(value) {
  return code(cell(value));
}

const experimentalTools = new Set(policy.experimental_tools);
const executionRows = policy.tools.map((tool) =>
  `| \`${tool.id}\` | ${cell(adapters.get(tool.id).name)} | \`${adapters.get(tool.id).binary}\` | \`${tool.category}\` | \`${tool.tier}\` | \`${tool.scope}\` | ${tool.required ? 'yes' : 'no'} | ${tool.timeout_ms} | \`${tool.blocking_severity}\` | ${experimentalTools.has(tool.id) ? 'yes' : 'no'} | \`${experimentalTools.has(tool.id) ? 'nonblocking experimental' : `blocking at ${tool.blocking_severity}`}\` | ${list(tool.languages)} | ${adapters.get(tool.id).detect ? 'language and adapter detector' : (tool.languages.length > 0 ? 'language' : 'no extra detector')} | ${list(tool.config_path)} |`,
).join('\n');

const selectionRows = policy.tools.map((tool) =>
  `| \`${tool.id}\` | ${list(tool.arguments)} | ${list(tool.id === 'semgrep' && tool.targets.length === 0 ? ['.'] : tool.targets)} | ${list(tool.include)} | ${list(tool.exclude)} |`,
).join('\n');

const applicabilityRows = policy.projects.flatMap((project) => {
  const shippedLanguages = new Set(project.languages);
  const explicitKubernetesInputs = project.kubernetes.raw_manifests.length
    + project.kubernetes.helm_charts.length;
  return policy.tools.map((tool) => {
    let state = 'eligible';
    let reason = 'It passes the project-level language and experimental filters.';
    if (experimentalTools.has(tool.id)) {
      state = 'opt-in';
      reason = 'It requires `includeExperimental=true`.';
    } else if (tool.languages.length > 0 && !tool.languages.some((language) => shippedLanguages.has(language))) {
      state = 'dormant';
      reason = 'The project does not enable its language.';
    } else if (tool.id === 'kubeconform' && explicitKubernetesInputs > 0) {
      state = 'not selected';
      reason = '`kubernetes-schema` owns the configured explicit inputs.';
    }
    return `| \`${project.id}\` | \`${tool.id}\` | ${state} | ${reason} |`;
  });
}).join('\n');

const projectRows = policy.projects.map((project) => [
  `| ID | \`${project.id}\` |`,
  `| Root | \`${project.root}\` |`,
  `| Discovery depth | ${project.discovery_max_depth} |`,
  `| Languages | ${list(project.languages)} |`,
  `| Raw manifests | ${list(project.kubernetes?.raw_manifests)} |`,
  `| Helm charts | ${list(project.kubernetes?.helm_charts)} |`,
  `| Policy packs | ${list(project.kubernetes?.policy_packs)} |`,
  `| Baseline path | ${list(policy.baseline_path)} |`,
  `| Kubernetes version | ${list(project.kubernetes?.kubernetes_version)} |`,
  `| Schema location | ${list(project.kubernetes?.schema_location)} |`,
].join('\n')).join('\n');

const evidenceRows = policy.projects.flatMap((project) =>
  Object.entries(project.language_evidence).map(([language, patterns]) =>
    `| \`${project.id}\` | \`${language}\` | ${list(patterns)} |`),
).join('\n');

const goRows = policy.projects.flatMap((project) => (project.go?.modules ?? []).map((module) =>
  `| \`${project.id}\` | ${list(module.mod_file)} | ${list(module.packages)} | ${list(module.build_tags)} | ${list(module.allowed_import_prefixes)} |`,
)).join('\n') || '| — | — | — | — | — |';

const terraformRows = policy.projects.map((project) =>
  `| \`${project.id}\` | ${list(project.terraform?.roots)} | ${list(project.terraform?.provider_mirror)} |`,
).join('\n');

const limitRows = policy.projects.map((project) => {
  const limits = project.kubernetes?.limits ?? {};
  return `| \`${project.id}\` | ${limits.max_files ?? '—'} | ${limits.max_file_bytes ?? '—'} | ${limits.max_rendered_bytes ?? '—'} | ${limits.max_documents ?? '—'} |`;
}).join('\n');

const layerRows = policy.architecture.layers.map((layer) =>
  `| \`${layer.id}\` | ${list(layer.roots)} | ${list(layer.may_depend_on)} |`,
).join('\n');

const admissionRows = policy.rule_admission.rules.map((rule) =>
  `| \`${rule.tool}\` | \`${rule.code}\` | ${cell(rule.principle)} | ${cell(rule.remediation)} | ${rule.historical_changed_sets} | ${rule.false_positives} | \`${rule.approved_by}\` | ${rule.approved_on} |`,
).join('\n');

const waiverRows = baseline.groups.flatMap((group) => group.fingerprints.map((fingerprint) =>
  `| \`${group.tool}\` | \`${fingerprint}\` | ${cell(group.owner)} | ${cell(group.reason)} | \`${group.tracking}\` | ${group.created} | ${group.expires} | ${cell(group.approved_by)} | ${group.approved_on} |`,
)).join('\n') || '| — | — | — | — | — | — | — | — | — |';

const packRows = packs.map(({ reference }) =>
  `| \`${reference.id}\` | \`${reference.version}\` | ${list(reference.path)} | \`${reference.sha256}\` |`,
).join('\n');

const packRuleRows = packs.flatMap(({ reference, pack }) => pack.rules.map((rule) =>
  `| \`${reference.id}\` | \`${rule.id}\` | \`${rule.type}\` | \`${rule.severity}\` | ${Object.keys(rule).filter((key) => !['id', 'type', 'severity'].includes(key)).map((key) => `\`${key}=${JSON.stringify(rule[key])}\``).join('<br>') || '—'} |`,
)).join('\n');

const versionArgumentNames = [
  'GOCYCLO_VERSION', 'GOVULNCHECK_VERSION', 'GO_VERSION', 'HADOLINT_VERSION', 'HELM_VERSION',
  'KUBECONFORM_VERSION', 'KUBECTL_VERSION', 'MYPY_VERSION', 'RUFF_VERSION', 'SEMGREP_VERSION',
  'SHFMT_VERSION', 'STATICCHECK_VERSION', 'TERRAFORM_VERSION', 'TFLINT_VERSION',
  'TRIVY_VERSION',
];
const analyserPackageNames = [
  'dependency-cruiser', 'eslint', 'jscpd', 'knip', 'typescript', 'typescript-eslint',
];
const analyserVersionRows = [
  ...versionArgumentNames.map((name) => [name.replace(/_VERSION$/u, '').toLowerCase()
    .replaceAll('_', '-'), repositoryVersions.buildArgs[name], '`versions.json` build argument']),
  ...analyserPackageNames.map((name) => [name, novaToolsPackage.dependencies[name],
    '`docker/nova-tools/package.json` direct dependency; lock verified']),
  ['kubernetes-schema-tree', repositoryVersions.buildArgs.KUBERNETES_JSON_SCHEMA_COMMIT,
    '`versions.json` source commit; selected tree matches `KUBECTL_VERSION`'],
  ['nova-runtime-base', `${repositoryVersions.openclaw.version}@${repositoryVersions.openclaw.digest}`,
    '`versions.json` OpenClaw base image identity'],
].map(([name, version, authority]) => `| \`${name}\` | \`${version}\` | ${authority} |`).join('\n');

const identifierRows = [
  ['ESLint and type evidence', eslintRuleIds],
  ['Semgrep', semgrepRuleIds],
  ['Engine-owned fixed codes', generatedCodeIds],
  ['Dynamic code families', DYNAMIC_CODE_FAMILIES],
  ['Upstream code families', UPSTREAM_CODE_FAMILIES],
].map(([family, values]) => `| ${family} | ${values.length} | ${list(values)} |`).join('\n');

const content = `# Generated Lint Policy Facts

Status: generated reference
Audience: lint-policy maintainer, operator, Nova maintainer
Owner: lint
Generator: scripts/docs-lint-policy-reference.mjs
Evidence: charts/kubeclaw/files/config/lint-policy.json; ${path.relative(root, baselinePath)}; ${packs.map(({ reference }) => path.relative(root, path.resolve(configDirectory, reference.path))).join('; ')}; versions.json; docker/nova-tools/package.json; docker/nova-tools/package-lock.json; charts/kubeclaw/files/config/eslint.config.mjs; charts/kubeclaw/files/config/eslint-type-evidence-config.mjs; charts/kubeclaw/files/config/eslint-type-evidence-tests-config.mjs; charts/kubeclaw/files/config/eslint-type-evidence-generated-config.mjs; charts/kubeclaw/files/config/type-evidence-eslint-plugin.mjs; charts/kubeclaw/files/config/.semgrep.yml; skills/nova/plugins/lint/src; scripts/run-lint-report.mjs
Evidence revision: \`${revision}\`
Applies to: \`${policy.schema_version}\`, \`${baseline.schema_version}\`, and ${packs.map(({ pack }) => `\`${pack.schema_version}\``).join(', ')}
Last verified: generated from repository configuration on 2026-09-20

<!-- Generated by scripts/docs-lint-policy-reference.mjs. Do not edit this file by hand. -->

## Purpose And Use

This page records repetitive facts from the shipped lint configuration. The
[authored policy guide](lint-policy.md) explains their meaning and reasons. The
[rule guide](lint-rules.md) explains triggers, exceptions, and remediation.

Regenerate this page after a policy, baseline, pack, lint configuration, adapter,
or fixed-code change. The generated-reference check compares the complete generated
result with these sources.

## Tool Execution Settings

\`Required\` controls missing-binary behavior. The policy threshold is preserved
verbatim, while effective mode shows that experimental findings never block.
A dash means that the field is absent.

| Tool | Adapter name | Binary | Category | Tier | Scope | Required | Timeout (ms) | Policy threshold | Experimental member | Effective mode | Languages | Initial detection | Native config |
| --- | --- | --- | --- | --- | --- | --- | ---: | --- | --- | --- | --- | --- | --- |
${executionRows}

## Tool Selection Settings

The engine combines targets, include patterns, tool exclusions, and global
exclusions. Arguments are additional policy-owned command arguments.

| Tool | Arguments | Targets | Include | Exclude |
| --- | --- | --- | --- | --- |
${selectionRows}

## Shipped Full-Run Applicability

This table describes project-level eligibility without \`includeExperimental\`.
An adapter detector can suppress an eligible tool before execution. A selected
tool can still return \`not_applicable\` when its scope has no matching input.

| Project | Tool | Initial state | Reason |
| --- | --- | --- | --- |
${applicabilityRows}

## Global Exclusions

${policy.global_exclusions.map((pattern) => `- \`${pattern}\``).join('\n')}

## Native Configuration Source Digests

These repository-byte digests protect direct configs and implicit behavior
sources. Runtime reports include only explicit policy \`config_path\` digests.

| Source | Ownership | Repository SHA-256 |
| --- | --- | --- |
${configDigestRows}

## Runtime Analyser Version Authority

These are the lint-relevant explicit runtime pins. Direct Nova npm analyser
versions are also checked against the root entry in its package lock. Python and
Go analysers installed by the image build use the explicit \`versions.json\`
arguments below. Tools supplied as Debian-snapshot packages have no independent
semantic version authority here: their authority is the built Nova tools image
identity together with its \`DEBIAN_SNAPSHOT\` input (\`${repositoryVersions.buildArgs.DEBIAN_SNAPSHOT}\`).

| Analyser | Version | Canonical source |
| --- | --- | --- |
${analyserVersionRows}

## Shipped Project

| Field | Effective value |
| --- | --- |
${projectRows}

### Language Evidence

| Project | Language | Evidence patterns |
| --- | --- | --- |
${evidenceRows}

### Go Modules

| Project | Module file | Packages | Build tags | Allowed external import prefixes |
| --- | --- | --- | --- | --- |
${goRows}

### Terraform Roots

| Project | Roots | Offline provider mirror |
| --- | --- | --- |
${terraformRows}

An empty root list makes the shipped Terraform tools not applicable. The mirror
remains mandatory when a project enables a Terraform root.

### Kubernetes Limits

| Project | Files | Bytes per file | Rendered bytes | Documents |
| --- | ---: | ---: | ---: | ---: |
${limitRows}

## Architecture Layers

| Layer | Roots | May depend on |
| --- | --- | --- |
${layerRows}

## Blocking Rule Admission

The authored guide explains admission. This table preserves the exact approved
principle, remediation, sampling count, false-positive count, and approval.

Historical commits: ${policy.rule_admission.historical_commits.map((commit) => `\`${commit}\``).join(', ')}.

| Tool | Code | Principle | Required remediation | Changed sets | False positives | Approved by | Approved on |
| --- | --- | --- | --- | ---: | ---: | --- | --- |
${admissionRows}

## Generated Rule And Code Inventory

This inventory gives source-derived identities. The
[authored rule guide](lint-rules.md) explains triggers, boundaries, and recovery.
External analysers can add version-specific codes, so their upstream identities
cannot form a finite repository-owned list.

| Family | Count | Source-derived identities |
| --- | ---: | --- |
${identifierRows}

Dynamic and upstream-owned families are listed separately from repository-fixed
fallback identities. The admitted pack table below supplies the current
Kubernetes rule IDs.

## Active Baseline Entries

| Tool | Fingerprint | Owner | Reason | Tracking | Created | Expires | Approved by | Approved on |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
${waiverRows}

## Admitted Kubernetes Packs

| Pack | Version | Path | SHA-256 |
| --- | --- | --- | --- |
${packRows}

### Pack Rules

| Pack | Rule | Type | Severity | Parameters |
| --- | --- | --- | --- | --- |
${packRuleRows}
`;

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  && process.argv.includes('--check')) {
  if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== content) {
    throw new Error('Generated lint policy reference is stale. Run npm run docs:lint-policy:generate.');
  }
  process.stdout.write('Generated lint policy reference is current.\n');
} else if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  fs.writeFileSync(target, content);
  process.stdout.write(`Wrote ${path.relative(root, target)}.\n`);
}
