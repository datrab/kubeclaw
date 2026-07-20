import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const LINT_POLICY_SCHEMA_VERSION = 'pipeline_lint_policy.v5';
const LANGUAGES = new Set(['javascript', 'typescript', 'python', 'shell', 'docker', 'helm', 'yaml', 'go', 'terraform']);
const CATEGORIES = new Set(['format', 'lint', 'types', 'architecture', 'duplication', 'security', 'dependencies', 'manifests']);
const SCOPES = new Set(['changed-files', 'affected-projects', 'project', 'repository']);
const TIERS = new Set(['pre-check', 'full']);
const SEVERITIES = new Set(['warning', 'error']);

class LintPolicyError extends Error {
  code = 'LINT_POLICY_INVALID';

  constructor(message: string) {
    super(message);
    this.name = 'LintPolicyError';
  }
}

function fail(field: string, message: string): never {
  throw new LintPolicyError(`${field}: ${message}`);
}

function record(value: unknown, field: string): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(field, 'required object');
  return value as Record<string, any>;
}

function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) fail(field, 'required non-empty string');
  return value.trim();
}

function stringList(value: unknown, field: string, { nonEmpty = false } = {}): string[] {
  if (!Array.isArray(value) || (nonEmpty && value.length === 0)) fail(field, `required ${nonEmpty ? 'non-empty ' : ''}array`);
  const entries = value.map((entry, index) => text(entry, `${field}[${index}]`));
  if (new Set(entries).size !== entries.length) fail(field, 'duplicate values are not allowed');
  return entries;
}

function repoRelative(value: unknown, field: string): string {
  const normalized = path.posix.normalize(text(value, field).replace(/\\/g, '/'));
  if (path.posix.isAbsolute(normalized) || normalized === '..' || normalized.startsWith('../')) fail(field, 'must be repository-relative');
  return normalized;
}

function validateProject(input: unknown, field: string): Record<string, any> {
  const project = record(input, field);
  const languages = stringList(project.languages, `${field}.languages`, { nonEmpty: true });
  for (const language of languages) if (!LANGUAGES.has(language)) fail(`${field}.languages`, `unknown language '${language}'`);
  const rawEvidence = record(project.language_evidence, `${field}.language_evidence`);
  const languageEvidence: Record<string, string[]> = {};
  for (const language of languages) {
    languageEvidence[language] = stringList(rawEvidence[language], `${field}.language_evidence.${language}`, { nonEmpty: true })
      .map((entry, index) => repoRelative(entry, `${field}.language_evidence.${language}[${index}]`));
  }
  for (const language of Object.keys(rawEvidence)) if (!languages.includes(language)) fail(`${field}.language_evidence.${language}`, 'language is not enabled for this project');
  if (!Number.isSafeInteger(project.discovery_max_depth) || project.discovery_max_depth < 0) fail(`${field}.discovery_max_depth`, 'required non-negative integer');
  const goSettings = project.go === undefined ? { modules: [] } : record(project.go, `${field}.go`);
  const goModules = Array.isArray(goSettings.modules) ? goSettings.modules.map((entry, index) => {
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
  const terraformSettings = project.terraform === undefined ? { roots: [] } : record(project.terraform, `${field}.terraform`);
  const terraformRoots = stringList(terraformSettings.roots, `${field}.terraform.roots`)
    .map((root, index) => repoRelative(root, `${field}.terraform.roots[${index}]`));
  if (languages.includes('terraform') && terraformRoots.length === 0) fail(`${field}.terraform.roots`, 'required non-empty array when Terraform is enabled');
  const terraformProviderMirror = terraformSettings.provider_mirror === undefined ? null : text(terraformSettings.provider_mirror, `${field}.terraform.provider_mirror`);
  if (terraformProviderMirror !== null && !path.isAbsolute(terraformProviderMirror)) fail(`${field}.terraform.provider_mirror`, 'required absolute path');
  if (languages.includes('terraform') && terraformProviderMirror === null) fail(`${field}.terraform.provider_mirror`, 'required when Terraform is enabled');
  return {
    id: text(project.id, `${field}.id`),
    root: repoRelative(project.root, `${field}.root`),
    languages,
    language_evidence: languageEvidence,
    discovery_max_depth: project.discovery_max_depth,
    go: { modules: goModules },
    terraform: { roots: terraformRoots, provider_mirror: terraformProviderMirror },
  };
}

function validateTool(input: unknown, field: string, policyDir: string): Record<string, any> {
  const tool = record(input, field);
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
  return {
    id: text(tool.id, `${field}.id`),
    required: tool.required,
    category: tool.category,
    scope: tool.scope,
    tier: tool.tier,
    timeout_ms: tool.timeout_ms,
    blocking_severity: tool.blocking_severity,
    languages,
    config_path: configPath,
    arguments: tool.arguments === undefined ? [] : stringList(tool.arguments, `${field}.arguments`),
    targets: stringList(tool.targets, `${field}.targets`)
      .map((entry, index) => repoRelative(entry, `${field}.targets[${index}]`)),
    include: stringList(tool.include, `${field}.include`),
    exclude: stringList(tool.exclude, `${field}.exclude`),
  };
}

function validateArchitecture(input: unknown): Record<string, any> {
  const architecture = record(input, 'policy.architecture');
  if (!Array.isArray(architecture.layers) || architecture.layers.length === 0) fail('policy.architecture.layers', 'required non-empty array');
  const layers = architecture.layers.map((entry, index) => {
    const field = `policy.architecture.layers[${index}]`;
    const layer = record(entry, field);
    return {
      id: text(layer.id, `${field}.id`),
      roots: stringList(layer.roots, `${field}.roots`, { nonEmpty: true }).map((root, rootIndex) => repoRelative(root, `${field}.roots[${rootIndex}]`)),
      may_depend_on: stringList(layer.may_depend_on, `${field}.may_depend_on`),
    };
  });
  const ids = layers.map(layer => layer.id);
  if (new Set(ids).size !== ids.length) fail('policy.architecture.layers', 'duplicate layer ids are not allowed');
  const known = new Set(ids);
  for (const layer of layers) for (const target of layer.may_depend_on) if (!known.has(target)) fail(`policy.architecture.layers.${layer.id}.may_depend_on`, `unknown layer '${target}'`);
  return { layers };
}

function validateBaseline(input: unknown, policyDir: string): Record<string, any> {
  const baselinePath = path.resolve(policyDir, text(input, 'policy.baseline_path'));
  if (!fs.existsSync(baselinePath)) fail('policy.baseline_path', `does not exist: ${baselinePath}`);
  let source = '';
  let parsed: unknown;
  try { source = fs.readFileSync(baselinePath, 'utf8'); parsed = JSON.parse(source); }
  catch (error) { fail('policy.baseline_path', `invalid JSON: ${(error as Error).message}`); }
  const baseline = record(parsed, 'baseline');
  if (baseline.schema_version !== 'pipeline_lint_baseline.v1') fail('baseline.schema_version', 'expected pipeline_lint_baseline.v1');
  if (!Array.isArray(baseline.groups)) fail('baseline.groups', 'required array');
  const entries = baseline.groups.flatMap((entry: unknown, index: number) => {
    const field = `baseline.groups[${index}]`;
    const value = record(entry, field);
    const expires = text(value.expires, `${field}.expires`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expires) || Number.isNaN(Date.parse(`${expires}T00:00:00Z`))) fail(`${field}.expires`, 'required ISO date');
    const tool = text(value.tool, `${field}.tool`);
    const owner = text(value.owner, `${field}.owner`);
    const reason = text(value.reason, `${field}.reason`);
    const tracking = text(value.tracking, `${field}.tracking`);
    return stringList(value.fingerprints, `${field}.fingerprints`, { nonEmpty: true }).map((fingerprint, fingerprintIndex) => {
      if (!/^[a-f0-9]{64}$/.test(fingerprint)) fail(`${field}.fingerprints[${fingerprintIndex}]`, 'required lowercase SHA-256');
      return { tool, fingerprint, owner, reason, expires, tracking };
    });
  });
  const keys = entries.map(entry => `${entry.tool}:${entry.fingerprint}`);
  if (new Set(keys).size !== keys.length) fail('baseline.groups', 'duplicate tool fingerprints are not allowed');
  return {
    path: baselinePath,
    digest: crypto.createHash('sha256').update(source).digest('hex'),
    entries,
    entries_by_key: new Map(entries.map(entry => [`${entry.tool}:${entry.fingerprint}`, entry])),
  };
}

function validateLintPolicy(input: unknown, policyPath: string): Record<string, any> {
  const policy = record(input, 'policy');
  if (policy.schema_version !== LINT_POLICY_SCHEMA_VERSION) fail('policy.schema_version', `expected ${LINT_POLICY_SCHEMA_VERSION}`);
  if (!Array.isArray(policy.projects) || policy.projects.length !== 1) fail('policy.projects', 'required array with exactly one project');
  if (!Array.isArray(policy.tools) || policy.tools.length === 0) fail('policy.tools', 'required non-empty array');
  const policyDir = path.dirname(policyPath);
  const baseline = validateBaseline(policy.baseline_path, policyDir);
  const projects = policy.projects.map((entry, index) => validateProject(entry, `policy.projects[${index}]`));
  const tools = policy.tools.map((entry, index) => validateTool(entry, `policy.tools[${index}]`, policyDir));
  for (const [field, values] of [['policy.projects', projects], ['policy.tools', tools]] as const) {
    const ids = values.map(value => value.id);
    if (new Set(ids).size !== ids.length) fail(field, 'duplicate ids are not allowed');
  }
  const activeLanguages = new Set(projects.flatMap(project => project.languages));
  const canonicalGoTargets = [...new Set(projects.flatMap(project => project.go.modules.map((module: Record<string, any>) => path.posix.dirname(module.mod_file))))].sort();
  const canonicalGoPackages = [...new Set(projects.flatMap(project => project.go.modules.flatMap((module: Record<string, any>) => module.packages)))].sort();
  const canonicalTerraformTargets = [...new Set(projects.flatMap(project => project.terraform.roots))].sort();
  for (const tool of tools) {
    const applicable = tool.languages.length === 0 || tool.languages.some((language: string) => activeLanguages.has(language));
    if (applicable && tool.targets.length === 0) fail(`policy.tools.${tool.id}.targets`, 'required non-empty array for an applicable tool');
    const targetAuthority = tool.languages.length === 1 && tool.languages[0] === 'go'
      ? canonicalGoTargets
      : (tool.languages.length === 1 && tool.languages[0] === 'terraform' ? canonicalTerraformTargets : null);
    if (targetAuthority && JSON.stringify([...tool.targets].sort()) !== JSON.stringify(targetAuthority)) {
      fail(`policy.tools.${tool.id}.targets`, `must match canonical ${tool.languages[0]} roots: ${targetAuthority.join(', ') || '<none>'}`);
    }
    if (['go-vet', 'go-imports', 'staticcheck', 'govulncheck'].includes(tool.id)
      && JSON.stringify([...tool.arguments].sort()) !== JSON.stringify(canonicalGoPackages)) {
      fail(`policy.tools.${tool.id}.arguments`, `must match canonical Go packages: ${canonicalGoPackages.join(', ')}`);
    }
  }
  const globalExclusions = stringList(policy.global_exclusions, 'policy.global_exclusions');
  const architecture = validateArchitecture(policy.architecture);
  const dependencyCruiser = tools.find(tool => tool.id === 'dependency-cruiser');
  const architectureRoots = [...new Set(architecture.layers.flatMap((layer: Record<string, any>) => layer.roots))].sort();
  if (dependencyCruiser && JSON.stringify([...dependencyCruiser.targets].sort()) !== JSON.stringify(architectureRoots)) {
    fail('policy.tools.dependency-cruiser.targets', `must match canonical architecture roots: ${architectureRoots.join(', ')}`);
  }
  for (const entry of baseline.entries) if (!tools.some(tool => tool.id === entry.tool)) fail('baseline.groups', `unknown tool '${entry.tool}'`);
  return { schema_version: LINT_POLICY_SCHEMA_VERSION, projects, tools, global_exclusions: globalExclusions, architecture, baseline };
}

function loadLintPolicy(policyPath: string): Record<string, any> {
  if (!path.isAbsolute(policyPath)) fail('policy path', 'must be absolute');
  if (!fs.existsSync(policyPath)) fail('policy path', `does not exist: ${policyPath}`);
  let parsed: unknown;
  let source = '';
  try { source = fs.readFileSync(policyPath, 'utf8'); parsed = JSON.parse(source); }
  catch (error) { fail('policy', `invalid JSON: ${(error as Error).message}`); }
  const policy = validateLintPolicy(parsed, policyPath);
  for (const tool of policy.tools) {
    if (tool.config_path && tool.required && !fs.existsSync(tool.config_path)) fail(`policy.tools.${tool.id}.config_path`, `does not exist: ${tool.config_path}`);
  }
  policy.digest = crypto.createHash('sha256').update(source).digest('hex');
  policy.config_digests = Object.fromEntries(policy.tools
    .filter((tool: Record<string, any>) => tool.config_path && fs.existsSync(tool.config_path))
    .map((tool: Record<string, any>) => [tool.id, crypto.createHash('sha256').update(fs.readFileSync(tool.config_path)).digest('hex')]));
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

function globRegex(pattern: string): RegExp {
  let source = '^';
  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index];
    if (char === '*' && pattern[index + 1] === '*') {
      const followedBySlash = pattern[index + 2] === '/';
      source += followedBySlash ? '(?:.*/)?' : '.*';
      index += followedBySlash ? 2 : 1;
    } else if (char === '*') source += '[^/]*';
    else source += /[.+^${}()|[\]\\]/.test(char) ? `\\${char}` : char;
  }
  return new RegExp(`${source}$`);
}

function matchesPolicyPattern(file: string, pattern: string): boolean {
  return globRegex(pattern).test(file.replace(/\\/g, '/').replace(/^\.\//, ''));
}

function policyIncludesFile(file: string, tool: Record<string, any>, globalExclusions: string[]): boolean {
  const normalized = file.replace(/\\/g, '/').replace(/^\.\//, '');
  const targeted = tool.targets.some((target: string) => target === '.' || normalized === target || normalized.startsWith(`${target.replace(/\/$/, '')}/`));
  if (!targeted) return false;
  if ([...globalExclusions, ...tool.exclude].some(pattern => matchesPolicyPattern(normalized, pattern))) return false;
  return tool.include.length === 0 || tool.include.some((pattern: string) => matchesPolicyPattern(normalized, pattern));
}

function validatePolicyTargetPaths(repoRoot: string, policy: Record<string, any>, project: Record<string, any>): void {
  const projectRoot = path.resolve(repoRoot, project.root);
  for (const module of project.go.modules) {
    const absolute = path.resolve(projectRoot, module.mod_file);
    if (!fs.existsSync(absolute)) fail('policy project go module', `does not exist: ${module.mod_file}`);
  }
  for (const root of project.terraform.roots) {
    const absolute = path.resolve(projectRoot, root);
    if (!fs.existsSync(absolute)) fail('policy project terraform root', `does not exist: ${root}`);
  }
  for (const tool of policy.tools) {
    for (const target of tool.targets) {
      const absolute = path.resolve(projectRoot, target);
      const relative = path.relative(projectRoot, absolute);
      if (relative.startsWith('..') || path.isAbsolute(relative)) fail(`policy.tools.${tool.id}.targets`, `escapes project root: ${target}`);
      if (!fs.existsSync(absolute)) fail(`policy.tools.${tool.id}.targets`, `does not exist: ${target}`);
    }
  }
  for (const layer of policy.architecture.layers) {
    for (const root of layer.roots) {
      if (!fs.existsSync(path.resolve(projectRoot, root))) fail(`policy.architecture.layers.${layer.id}.roots`, `does not exist: ${root}`);
    }
  }
}

function applicablePolicyToolIds(policy: Record<string, any>, projectTypes: Set<string>, tier: string): string[] {
  const tierOrder = ['pre-check', 'full'];
  const tierIndex = tierOrder.indexOf(tier);
  if (tierIndex < 0) fail('tier', `unknown tier '${tier}'`);
  return policy.tools
    .filter((tool: Record<string, any>) => tierOrder.indexOf(tool.tier) <= tierIndex)
    .filter((tool: Record<string, any>) => tool.languages.length === 0 || tool.languages.some((language: string) => projectTypes.has(language)))
    .map((tool: Record<string, any>) => tool.id)
    .sort();
}

export { LINT_POLICY_SCHEMA_VERSION, LintPolicyError, applicablePolicyToolIds, loadLintPolicy, matchesPolicyPattern, policyDigest, policyIncludesFile, selectPolicyProject, validateLintPolicy, validatePolicyTargetPaths };
