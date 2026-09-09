import { matchesPolicyPattern, policyIncludesFile } from './policy-patterns.ts';
import { validatePolicyTargetPaths } from './policy-paths.ts';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import { validateBaseline, validateRuleAdmission } from './lint-governance.ts';
import { loadKubernetesPolicyPacks } from './kubernetes-policy-pack.ts';
import { LintPolicyError, fail, isoDate, record, repoRelative, stringList, text } from './policy-validation.ts';

const LINT_POLICY_SCHEMA_VERSION = 'pipeline_lint_policy.v7';
const LANGUAGES = new Set(['javascript', 'typescript', 'python', 'shell', 'docker', 'helm', 'yaml', 'go', 'terraform']);
const CATEGORIES = new Set(['format', 'lint', 'types', 'architecture', 'duplication', 'security', 'dependencies', 'manifests']);
const SCOPES = new Set(['changed-files', 'affected-projects', 'project', 'repository']);
const TIERS = new Set(['pre-check', 'full']);
const SEVERITIES = new Set(['warning', 'error']);


function positiveInteger(value: unknown, field: string, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > maximum) fail(field, `required integer from 1 to ${maximum}`);
  return value as number;
}

function uniqueStrings(values: string[], field: string): string[] {
  if (new Set(values).size !== values.length) fail(field, 'duplicate values are not allowed');
  return values;
}

function validateProjectKubernetes(project: Record<string, any>, field: string, packIds: Set<string>): Record<string, any> {
  if (project.kubernetes === undefined) return {
    raw_manifests: [], helm_charts: [], policy_packs: [], kubernetes_version: null, schema_location: null,
    limits: { max_files: 128, max_file_bytes: 1_048_576, max_rendered_bytes: 10_485_760, max_documents: 2048 },
  };
  const settings = record(project.kubernetes, `${field}.kubernetes`);
  const knownSettings = new Set(['raw_manifests', 'helm_charts', 'policy_packs', 'kubernetes_version', 'schema_location', 'limits']);
  for (const key of Object.keys(settings)) if (!knownSettings.has(key)) fail(`${field}.kubernetes.${key}`, 'unknown field');
  const rawManifests = uniqueStrings(stringList(settings.raw_manifests, `${field}.kubernetes.raw_manifests`).map((entry, index) => repoRelative(entry, `${field}.kubernetes.raw_manifests[${index}]`)), `${field}.kubernetes.raw_manifests`);
  const helmCharts = uniqueStrings(stringList(settings.helm_charts, `${field}.kubernetes.helm_charts`).map((entry, index) => repoRelative(entry, `${field}.kubernetes.helm_charts[${index}]`)), `${field}.kubernetes.helm_charts`);
  if (rawManifests.length + helmCharts.length === 0) fail(`${field}.kubernetes`, 'at least one raw manifest or Helm chart is required');
  const policyPacks = uniqueStrings(stringList(settings.policy_packs, `${field}.kubernetes.policy_packs`), `${field}.kubernetes.policy_packs`);
  if (policyPacks.length + rawManifests.length + helmCharts.length > 256) fail(`${field}.kubernetes`, 'selected packs and manifest sources exceed the 256-entry evidence capacity');
  for (const id of policyPacks) if (!packIds.has(id)) fail(`${field}.kubernetes.policy_packs`, `unknown operator-approved pack '${id}'`);
  const kubernetesVersion = text(settings.kubernetes_version, `${field}.kubernetes.kubernetes_version`);
  if (!/^\d+\.\d+\.\d+$/u.test(kubernetesVersion)) fail(`${field}.kubernetes.kubernetes_version`, 'required full Kubernetes version');
  const schemaLocation = text(settings.schema_location, `${field}.kubernetes.schema_location`);
  if (!path.isAbsolute(schemaLocation)) fail(`${field}.kubernetes.schema_location`, 'required absolute operator-controlled path');
  if (/^https?:/iu.test(schemaLocation)) fail(`${field}.kubernetes.schema_location`, 'network schema locations are forbidden');
  const limits = record(settings.limits, `${field}.kubernetes.limits`);
  const knownLimits = new Set(['max_files', 'max_file_bytes', 'max_rendered_bytes', 'max_documents']);
  for (const key of Object.keys(limits)) if (!knownLimits.has(key)) fail(`${field}.kubernetes.limits.${key}`, 'unknown field');
  return {
    raw_manifests: rawManifests,
    helm_charts: helmCharts,
    policy_packs: policyPacks,
    kubernetes_version: kubernetesVersion,
    schema_location: schemaLocation,
    limits: {
      max_files: positiveInteger(limits.max_files, `${field}.kubernetes.limits.max_files`, 128),
      max_file_bytes: positiveInteger(limits.max_file_bytes, `${field}.kubernetes.limits.max_file_bytes`, 16 * 1024 * 1024),
      max_rendered_bytes: positiveInteger(limits.max_rendered_bytes, `${field}.kubernetes.limits.max_rendered_bytes`, 64 * 1024 * 1024),
      max_documents: positiveInteger(limits.max_documents, `${field}.kubernetes.limits.max_documents`, 100_000),
    },
  };
}

function validateProject(input: unknown, field: string, packIds: Set<string>): Record<string, any> {
  const project = record(input, field);
  const languages = stringList(project.languages, `${field}.languages`, { nonEmpty: true });
  for (const language of languages) if (!LANGUAGES.has(language)) fail(`${field}.languages`, `unknown language '${language}'`);
  const languageEvidence = validateLanguageEvidence(project, field, languages);
  if (!Number.isSafeInteger(project.discovery_max_depth) || project.discovery_max_depth < 0) fail(`${field}.discovery_max_depth`, 'required non-negative integer');
  const goModules = validateProjectGo(project, field, languages);
  const terraform = validateProjectTerraform(project, field, languages);
  const kubernetes = validateProjectKubernetes(project, field, packIds);
  return {
    id: text(project.id, `${field}.id`),
    root: repoRelative(project.root, `${field}.root`),
    languages,
    language_evidence: languageEvidence,
    discovery_max_depth: project.discovery_max_depth,
    go: { modules: goModules },
    terraform,
    kubernetes,
  };
}

function validateLanguageEvidence(project: Record<string, any>, field: string, languages: string[]): Record<string, string[]> {
  const rawEvidence = record(project.language_evidence, `${field}.language_evidence`);
  const languageEvidence: Record<string, string[]> = {};
  for (const language of languages) {
    languageEvidence[language] = stringList(rawEvidence[language], `${field}.language_evidence.${language}`, { nonEmpty: true })
      .map((entry: any, index: any) => repoRelative(entry, `${field}.language_evidence.${language}[${index}]`));
  }
  for (const language of Object.keys(rawEvidence)) if (!languages.includes(language)) fail(`${field}.language_evidence.${language}`, 'language is not enabled for this project');
  return languageEvidence;
}

function validateProjectGo(project: Record<string, any>, field: string, languages: string[]): Record<string, any>[] {
  const goSettings = project.go === undefined ? { modules: [] } : record(project.go, `${field}.go`);
  const goModules = Array.isArray(goSettings.modules) ? goSettings.modules.map((entry: any, index: any) => {
    const moduleField = `${field}.go.modules[${index}]`;
    const module = record(entry, moduleField);
    return {
      mod_file: repoRelative(module.mod_file, `${moduleField}.mod_file`),
      packages: stringList(module.packages, `${moduleField}.packages`, { nonEmpty: true }),
      build_tags: stringList(module.build_tags, `${moduleField}.build_tags`),
      allowed_import_prefixes: stringList(module.allowed_import_prefixes, `${moduleField}.allowed_import_prefixes`, { nonEmpty: true }),
    };
  }) : fail(`${field}.go.modules`, 'required array');
  if (languages.includes('go') && goModules.length === 0) fail(`${field}.go.modules`, 'required non-empty array when Go is enabled');
  return goModules;
}

function validateProjectTerraform(project: Record<string, any>, field: string, languages: string[]): Record<string, any> {
  const terraformSettings = project.terraform === undefined ? { roots: [] } : record(project.terraform, `${field}.terraform`);
  const terraformRoots = stringList(terraformSettings.roots, `${field}.terraform.roots`)
    .map((root: any, index: any) => repoRelative(root, `${field}.terraform.roots[${index}]`));
  if (languages.includes('terraform') && terraformRoots.length === 0) fail(`${field}.terraform.roots`, 'required non-empty array when Terraform is enabled');
  const terraformProviderMirror = terraformSettings.provider_mirror === undefined ? null : text(terraformSettings.provider_mirror, `${field}.terraform.provider_mirror`);
  if (terraformProviderMirror !== null && !path.isAbsolute(terraformProviderMirror)) fail(`${field}.terraform.provider_mirror`, 'required absolute path');
  if (languages.includes('terraform') && terraformProviderMirror === null) fail(`${field}.terraform.provider_mirror`, 'required when Terraform is enabled');
  return { roots: terraformRoots, provider_mirror: terraformProviderMirror };
}

function validateTool(input: unknown, field: string, policyDir: string): Record<string, any> {
  const tool = record(input, field);
  const id = text(tool.id, `${field}.id`);
  const languages = stringList(tool.languages, `${field}.languages`);
  for (const language of languages) if (!LANGUAGES.has(language)) fail(`${field}.languages`, `unknown language '${language}'`);
  if (typeof tool.required !== 'boolean') fail(`${field}.required`, 'required boolean');
  if (!Number.isSafeInteger(tool.timeout_ms) || tool.timeout_ms < 1) fail(`${field}.timeout_ms`, 'required positive integer');
  if (!CATEGORIES.has(tool.category)) fail(`${field}.category`, 'unknown category');
  if (!SCOPES.has(tool.scope)) fail(`${field}.scope`, 'unknown scope');
  if (!TIERS.has(tool.tier)) fail(`${field}.tier`, 'unknown tier');
  if (!SEVERITIES.has(tool.blocking_severity)) fail(`${field}.blocking_severity`, 'unknown severity');
  const configPath = tool.config_path === null || tool.config_path === undefined
    ? null
    : path.resolve(policyDir, text(tool.config_path, `${field}.config_path`));
  const configuredTargets = stringList(tool.targets, `${field}.targets`)
    .map((entry: any, index: any) => repoRelative(entry, `${field}.targets[${index}]`));
  return {
    id,
    required: tool.required,
    category: tool.category,
    scope: tool.scope,
    tier: tool.tier,
    timeout_ms: tool.timeout_ms,
    blocking_severity: tool.blocking_severity,
    languages,
    config_path: configPath,
    arguments: tool.arguments === undefined ? [] : stringList(tool.arguments, `${field}.arguments`),
    configured_targets: configuredTargets,
    targets: id === 'semgrep' && configuredTargets.length === 0 ? ['.'] : configuredTargets,
    include: stringList(tool.include, `${field}.include`),
    exclude: stringList(tool.exclude, `${field}.exclude`),
  };
}

function validateArchitecture(input: unknown): Record<string, any> {
  const architecture = record(input, 'policy.architecture');
  if (!Array.isArray(architecture.layers) || architecture.layers.length === 0) fail('policy.architecture.layers', 'required non-empty array');
  const layers = architecture.layers.map((entry: any, index: any) => {
    const field = `policy.architecture.layers[${index}]`;
    const layer = record(entry, field);
    return {
      id: text(layer.id, `${field}.id`),
      roots: stringList(layer.roots, `${field}.roots`, { nonEmpty: true }).map((root: any, rootIndex: any) => repoRelative(root, `${field}.roots[${rootIndex}]`)),
      may_depend_on: stringList(layer.may_depend_on, `${field}.may_depend_on`),
    };
  });
  const ids = layers.map((layer: any) => layer.id);
  if (new Set(ids).size !== ids.length) fail('policy.architecture.layers', 'duplicate layer ids are not allowed');
  const known = new Set(ids);
  for (const layer of layers) for (const target of layer.may_depend_on) if (!known.has(target)) fail(`policy.architecture.layers.${layer.id}.may_depend_on`, `unknown layer '${target}'`);
  return { layers };
}

function validateUniqueIds(projects: Record<string, any>[], tools: Record<string, any>[]): void {
  for (const [field, values] of [['policy.projects', projects], ['policy.tools', tools]] as const) {
    const ids = values.map((value: any) => value.id);
    if (new Set(ids).size !== ids.length) fail(field, 'duplicate ids are not allowed');
  }
}

function applyExperimentalModes(policy: Record<string, any>, tools: Record<string, any>[]): void {
  const experimental = stringList(policy.experimental_tools, 'policy.experimental_tools');
  const configured = new Set(tools.map((tool: any) => tool.id));
  for (const id of experimental) if (!configured.has(id)) fail('policy.experimental_tools', `unknown tool '${id}'`);
  const selected = new Set(experimental);
  for (const tool of tools) tool.mode = selected.has(tool.id) ? 'experimental' : 'blocking';
}

function languageAuthority(tool: Record<string, any>, goTargets: string[], terraformTargets: string[]): string[] | null {
  if (tool.languages.length !== 1) return null;
  if (tool.languages[0] === 'go') return goTargets;
  if (tool.languages[0] === 'terraform') return terraformTargets;
  return null;
}

function validateGoArguments(tool: Record<string, any>, goPackages: string[]): void {
  if (!['go-vet', 'go-imports', 'staticcheck', 'govulncheck'].includes(tool.id)) return;
  if (JSON.stringify([...tool.arguments].sort()) !== JSON.stringify(goPackages)) fail(`policy.tools.${tool.id}.arguments`, `must match canonical Go packages: ${goPackages.join(', ')}`);
}

function validateLanguageAuthorities(projects: Record<string, any>[], tools: Record<string, any>[]): void {
  const activeLanguages = new Set(projects.flatMap((project: any) => project.languages));
  const goTargets = [...new Set(projects.flatMap((project: any) => project.go.modules.map((module: Record<string, any>) => path.posix.dirname(module.mod_file))))].sort();
  const goPackages = [...new Set(projects.flatMap((project: any) => project.go.modules.flatMap((module: Record<string, any>) => module.packages)))].sort();
  const terraformTargets = [...new Set(projects.flatMap((project: any) => project.terraform.roots))].sort();
  for (const tool of tools) {
    const applicable = tool.languages.length === 0 || tool.languages.some((language: string) => activeLanguages.has(language));
    if (applicable && tool.targets.length === 0) fail(`policy.tools.${tool.id}.targets`, 'required non-empty array for an applicable tool');
    const authority = languageAuthority(tool, goTargets, terraformTargets);
    if (authority && JSON.stringify([...tool.targets].sort()) !== JSON.stringify(authority)) fail(`policy.tools.${tool.id}.targets`, `must match canonical ${tool.languages[0]} roots: ${authority.join(', ') || '<none>'}`);
    validateGoArguments(tool, goPackages);
  }
}

function validateArchitectureTool(architecture: Record<string, any>, tools: Record<string, any>[]): void {
  const tool = tools.find((candidate: any) => candidate.id === 'dependency-cruiser');
  const roots = [...new Set(architecture.layers.flatMap((layer: Record<string, any>) => layer.roots))].sort();
  if (tool && JSON.stringify([...tool.targets].sort()) !== JSON.stringify(roots)) fail('policy.tools.dependency-cruiser.targets', `must match canonical architecture roots: ${roots.join(', ')}`);
}

function validateSuppressionTools(baseline: Record<string, any>, tools: Record<string, any>[]): void {
  const configured = new Map(tools.map((tool: any) => [tool.id, tool]));
  for (const entry of baseline.entries) {
    const tool = configured.get(entry.tool);
    if (!tool) fail('baseline.groups', `unknown tool '${entry.tool}'`);
    if (tool.mode !== 'blocking') fail('baseline.groups', `experimental tool '${entry.tool}' cannot own suppressions`);
  }
}

function validateLintPolicy(input: unknown, policyPath: string, options: Record<string, any> = {}): Record<string, any> {
  const policy = record(input, 'policy');
  if (policy.schema_version !== LINT_POLICY_SCHEMA_VERSION) fail('policy.schema_version', `expected ${LINT_POLICY_SCHEMA_VERSION}`);
  if (!Array.isArray(policy.projects) || policy.projects.length !== 1) fail('policy.projects', 'required array with exactly one project');
  if (!Array.isArray(policy.tools) || policy.tools.length === 0) fail('policy.tools', 'required non-empty array');
  const policyDir = path.dirname(policyPath);
  const today = typeof options.today === 'string' ? isoDate(options.today, 'validation.today') : new Date().toISOString().slice(0, 10);
  const baseline = validateBaseline(policy.baseline_path, policyDir, today);
  const kubernetesPolicyPacks = loadKubernetesPolicyPacks(policy.kubernetes_policy_packs ?? [], policyDir);
  const packIds = new Set(kubernetesPolicyPacks.map((pack: Record<string, any>) => pack.id));
  const projects = policy.projects.map((entry: any, index: any) => validateProject(entry, `policy.projects[${index}]`, packIds));
  const tools = policy.tools.map((entry: any, index: any) => validateTool(entry, `policy.tools[${index}]`, policyDir));
  validateUniqueIds(projects, tools);
  applyExperimentalModes(policy, tools);
  const ruleAdmission = validateRuleAdmission(policy.rule_admission, tools);
  validateLanguageAuthorities(projects, tools);
  const globalExclusions = stringList(policy.global_exclusions, 'policy.global_exclusions');
  const architecture = validateArchitecture(policy.architecture);
  validateArchitectureTool(architecture, tools);
  validateSuppressionTools(baseline, tools);
  return { schema_version: LINT_POLICY_SCHEMA_VERSION, projects, tools, global_exclusions: globalExclusions, architecture, baseline, rule_admission: ruleAdmission, kubernetes_policy_packs: kubernetesPolicyPacks };
}

function loadLintPolicy(policyPath: string): Record<string, any> {
  if (!path.isAbsolute(policyPath)) fail('policy path', 'must be absolute');
  if (!fs.existsSync(policyPath)) fail('policy path', `does not exist: ${policyPath}`);
  let parsed: unknown;
  let source = '';
  try { source = fs.readFileSync(policyPath, 'utf8'); parsed = JSON.parse(source); }
  catch (error: any) { fail('policy', `invalid JSON: ${(error as Error).message}`); }
  const policy = validateLintPolicy(parsed, policyPath);
  for (const tool of policy.tools) {
    if (tool.config_path && tool.required && !fs.existsSync(tool.config_path)) fail(`policy.tools.${tool.id}.config_path`, `does not exist: ${tool.config_path}`);
  }
  policy.digest = crypto.createHash('sha256').update(source).digest('hex');
  policy.config_digests = Object.fromEntries(policy.tools
    .filter((tool: Record<string, any>) => tool.config_path && fs.existsSync(tool.config_path))
    .map((tool: Record<string, any>) => [tool.id, crypto.createHash('sha256').update(fs.readFileSync(tool.config_path)).digest('hex')]));
  policy.policy_pack_digests = Object.fromEntries(policy.kubernetes_policy_packs.map((pack: Record<string, any>) => [pack.id, pack.digest]));
  return policy;
}

function selectPolicyProject(policy: Record<string, any>, projectId: string): Record<string, any> {
  const project = policy.projects.find((entry: Record<string, any>) => entry.id === projectId);
  if (!project) fail('policy project', `unknown project '${projectId}'`);
  return project;
}

function policyDigest(policy: Record<string, any>): string {
  return text(policy.digest, 'policy.digest');
}


export { LINT_POLICY_SCHEMA_VERSION, LintPolicyError, loadLintPolicy, matchesPolicyPattern, policyDigest, policyIncludesFile, selectPolicyProject, validateLintPolicy, validatePolicyTargetPaths };
