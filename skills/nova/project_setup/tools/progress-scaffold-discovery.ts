import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULTS,
  entriesOf,
  firstHeading,
  isPlainObject,
  listDirs,
  listFiles,
  naturalSort,
  nonEmptyStringOrDefault,
  objectKeys,
  objectOrEmpty,
  omitEmpty,
  readJsonIfExists,
  readTextIfExists,
  relFromRepo,
  relFromSwarm,
  SCHEMA,
  slugFromName,
  titleFromId,
  TODO_PREFIX,
  upperNameFromId,
  VALID_SUITES,
  valueOrDefault,
} from './progress-scaffold-values.ts';
import type { AnyRecord, Context } from './progress-scaffold-values.ts';

function existingModuleIdForDir(progress: AnyRecord, dir: string): string {
  const match = entriesOf(progress.modules).find(([, module]) => isPlainObject(module) && module.dir === dir);
  return match?.[0] ?? dir;
}

function inferSuites(moduleDir: string, forgeText: string, hasBuster: boolean, existing: unknown): string[] {
  if (Array.isArray(existing)) return existing;
  if (!hasBuster) return [];
  const suites = ['build', 'health'];
  if (/^##\s+Unit Tests\b/mi.test(forgeText)) suites.push('unit');
  if (fs.existsSync(path.join(moduleDir, 'test-spec.json'))) suites.push('api');
  if (fs.existsSync(path.join(moduleDir, 'baselines', 'paths.json'))) suites.push('visual-reg');
  return suites;
}

function inferRequiredSuites(markdown: string): string[] {
  const suites: string[] = [];
  let inRequired = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (/^##\s+Required Suites\b/i.test(line)) {
      inRequired = true;
      continue;
    }
    if (inRequired && /^##\s+/.test(line)) break;
    if (!inRequired) continue;
    const suite = line.match(/^\s*[-*]\s+`?([A-Za-z0-9-]+)`?\s*$/)?.[1];
    if (suite && VALID_SUITES.has(suite)) suites.push(suite);
  }
  return [...new Set(suites)];
}

function packageScripts(projectSrcDir: string) {
  const packageJson = readJsonIfExists(path.join(projectSrcDir, 'package.json'));
  const scripts = isPlainObject(packageJson?.scripts) ? packageJson.scripts : {};
  return {
    start: typeof scripts.start === 'string' ? 'npm start' : 'npm start',
    test: typeof scripts.test === 'string' ? 'npm test' : 'npm test',
  };
}

function addServeConfig(config: AnyRecord, input: AnyRecord) {
  const serveSuites = ['build', 'health', 'security', 'bundle', 'a11y', 'perf', 'e2e', 'visual-reg'];
  if (!input.suites.some((suite: string) => serveSuites.includes(suite))) return;
  config.serve = {
    type: 'server',
    project_dir: `Projects/${input.project}/src`,
    start_cmd: input.scripts.start,
    image: `localhost/${input.project}:${input.moduleId}`,
    port: 3000,
    health_path: '/health',
  };
  const dockerfile = path.join(input.projectSrcDir, 'Dockerfile');
  if (!fs.existsSync(dockerfile)) return;
  config.serve.dockerfile = relFromRepo(input.repoRoot, dockerfile);
  config.serve.build_context = `Projects/${input.project}/src`;
}

function addSuiteConfigs(config: AnyRecord, input: AnyRecord) {
  if (input.suites.includes('unit')) config.unit = { test_cmd: input.scripts.test };
  if (input.suites.includes('api')) {
    config.api = { spec_file: relFromSwarm(path.join(input.projectSrcDir, '.swarm'), path.join(input.moduleDir, 'test-spec.json')) };
  }
  if (input.suites.includes('manifest')) {
    config.manifest = {
      deployment_yaml: `${TODO_PREFIX} repository-relative Kubernetes manifest path`,
      required_env: [],
      thresholds: { max_missing_env: 0 },
    };
  }
  if (input.suites.includes('k8s')) {
    config.k8s = {
      dockerfile: `${TODO_PREFIX} repository-relative Dockerfile path`,
      build_context: `Projects/${input.project}/src`,
      image_name: input.project,
      service_name: input.project,
      manifests: [`${TODO_PREFIX} repository-relative Kubernetes manifest path`],
      port: 3000,
      health_path: '/health',
      purpose: 'pretest',
      cleanup_policy: 'delete',
      preview: { provider: 'off', path: '/' },
    };
  }
}

function inferTestConfig(input: AnyRecord): AnyRecord | undefined {
  if (isPlainObject(input.existingConfig)) return input.existingConfig;
  if (!Array.isArray(input.suites) || input.suites.length === 0) return undefined;
  const config: AnyRecord = {};
  const enriched = { ...input, scripts: packageScripts(input.projectSrcDir) };
  addServeConfig(config, enriched);
  addSuiteConfigs(config, enriched);
  return config;
}

function discoverModules(context: Context, existingProgress: AnyRecord) {
  const modulesDir = path.join(context.swarmDir, 'modules');
  const projectSrcDir = path.dirname(context.swarmDir);
  const modules: AnyRecord = {};
  for (const dir of listDirs(modulesDir)) {
    const moduleDir = path.join(modulesDir, dir);
    const id = existingModuleIdForDir(existingProgress, dir);
    const existing = objectOrEmpty(objectOrEmpty(existingProgress.modules)[id]);
    const forgeText = readTextIfExists(path.join(moduleDir, 'FORGE.md'));
    const hasBuster = fs.existsSync(path.join(moduleDir, 'BUSTER.md'));
    const stages = Array.isArray(existing.stages) ? existing.stages : (hasBuster ? ['forge', 'buster'] : ['forge']);
    const suites = inferSuites(moduleDir, forgeText, hasBuster, existing.test_suites);
    const substeps = listDirs(moduleDir).filter((substep) => fs.existsSync(path.join(moduleDir, substep, 'FORGE.md')));
    modules[id] = omitEmpty({
      title: nonEmptyStringOrDefault(existing.title, firstHeading(forgeText, id)),
      dir,
      substeps: Array.isArray(existing.substeps) && existing.substeps.length > 0 ? existing.substeps : (substeps.length ? substeps : undefined),
      depends_on: Array.isArray(existing.depends_on) ? existing.depends_on : [],
      stages,
      timeout_minutes: valueOrDefault(existing.timeout_minutes, DEFAULTS.module_timeout_minutes),
      max_fails: valueOrDefault(existing.max_fails, DEFAULTS.module_max_fails),
      thinking_level: nonEmptyStringOrDefault(existing.thinking_level, DEFAULTS.thinking_level),
      forge_model: existing.forge_model,
      forge_subagent: existing.forge_subagent,
      session: existing.session,
      capabilities: existing.capabilities,
      test_suites: suites,
      test_config: inferTestConfig({
        repoRoot: context.repoRoot,
        project: context.project,
        projectSrcDir,
        moduleId: id,
        moduleDir,
        suites,
        existingConfig: existing.test_config,
      }),
    });
  }
  return modules;
}

function existingGate(progress: AnyRecord, field: string, value: string) {
  const match = entriesOf(progress.gates).find(([, gate]) => isPlainObject(gate) && gate[field] === value);
  return match ? { id: match[0], gate: match[1] } : null;
}

function discoverReviewGates(context: Context, progress: AnyRecord) {
  const gates: AnyRecord = {};
  const reviewDir = path.join(context.swarmDir, 'echo-review');
  for (const file of listFiles(reviewDir, (name) => /\.md$/i.test(name))) {
    const relativePath = relFromSwarm(context.swarmDir, file);
    const prior = existingGate(progress, 'instructions_file', relativePath);
    const id = prior?.id ?? slugFromName(path.basename(file));
    const existing = objectOrEmpty(prior?.gate);
    const reviewName = nonEmptyStringOrDefault(existing.review_name, upperNameFromId(id));
    gates[id] = omitEmpty({
      type: 'review',
      title: nonEmptyStringOrDefault(existing.title, titleFromId(id)),
      review_name: reviewName,
      on_fail: nonEmptyStringOrDefault(existing.on_fail, DEFAULTS.review_on_fail),
      instructions_file: nonEmptyStringOrDefault(existing.instructions_file, relativePath),
      output_file: nonEmptyStringOrDefault(existing.output_file, `logs/echo-review/${reviewName}.json`),
      review_output_dir: nonEmptyStringOrDefault(existing.review_output_dir, DEFAULTS.review_output_dir),
      reviewers: existing.reviewers,
      primary_reviewer: existing.primary_reviewer,
      timeout_minutes: valueOrDefault(existing.timeout_minutes, DEFAULTS.review_timeout_minutes),
      max_fix_cycles: valueOrDefault(existing.max_fix_cycles, DEFAULTS.review_max_fix_cycles),
      lint_tier: nonEmptyStringOrDefault(existing.lint_tier, DEFAULTS.review_lint_tier),
    });
  }
  return gates;
}

function discoverBusterGates(context: Context, progress: AnyRecord) {
  const gates: AnyRecord = {};
  const busterDir = path.join(context.swarmDir, 'buster-test');
  const projectSrcDir = path.dirname(context.swarmDir);
  for (const file of listFiles(busterDir, (name) => /\.md$/i.test(name))) {
    const relativePath = relFromSwarm(context.swarmDir, file);
    const prior = existingGate(progress, 'instructions_file', relativePath);
    const id = prior?.id ?? slugFromName(path.basename(file));
    const existing = objectOrEmpty(prior?.gate);
    const required = inferRequiredSuites(readTextIfExists(file));
    const suites = Array.isArray(existing.test_suites) ? existing.test_suites : (required.length ? required : ['build', 'health', 'unit']);
    gates[id] = omitEmpty({
      type: 'buster',
      title: nonEmptyStringOrDefault(existing.title, titleFromId(id)),
      on_fail: nonEmptyStringOrDefault(existing.on_fail, DEFAULTS.buster_on_fail),
      instructions_file: nonEmptyStringOrDefault(existing.instructions_file, relativePath),
      output_file: nonEmptyStringOrDefault(existing.output_file, `buster-test/${upperNameFromId(id)}-RESULT.json`),
      timeout_minutes: valueOrDefault(existing.timeout_minutes, DEFAULTS.buster_timeout_minutes),
      max_fix_cycles: valueOrDefault(existing.max_fix_cycles, DEFAULTS.buster_max_fix_cycles),
      test_suites: suites,
      test_config: inferTestConfig({
        repoRoot: context.repoRoot,
        project: context.project,
        projectSrcDir,
        moduleId: id,
        moduleDir: busterDir,
        suites,
        existingConfig: existing.test_config,
      }),
    });
  }
  return gates;
}

function mergeObjects(discovered: AnyRecord, existing: unknown) {
  if (!isPlainObject(existing)) return discovered;
  const merged = { ...discovered };
  for (const [id, value] of Object.entries(existing)) {
    merged[id] = isPlainObject(merged[id]) && isPlainObject(value) ? { ...merged[id], ...value } : value;
  }
  return merged;
}

export function buildScaffold(context: Context): AnyRecord {
  const progress = objectOrEmpty(readJsonIfExists(context.progressFile));
  const prior = objectOrEmpty(readJsonIfExists(context.scaffoldFile));
  const modules = discoverModules(context, progress);
  const gates = mergeObjects(
    { ...objectOrEmpty(progress.gates), ...discoverReviewGates(context, progress), ...discoverBusterGates(context, progress) },
    prior.gates,
  );
  const moduleIds = objectKeys(modules).sort(naturalSort);
  const gateIds = objectKeys(gates).sort(naturalSort);
  const inferredOrder = gateIds.length
    ? [...moduleIds, ...gateIds.map((gateId) => `${TODO_PREFIX} place gate:${gateId} among [${moduleIds.join(', ')}]`)]
    : moduleIds;
  return {
    _schema: SCHEMA,
    _instructions: ['Edit TODO values and gate placements.', 'Run with --apply to write progress.json.'],
    project: context.project,
    version: valueOrDefault(prior.version, valueOrDefault(progress.version, DEFAULTS.version)),
    description: valueOrDefault(prior.description, valueOrDefault(progress.description, `${TODO_PREFIX} one-sentence project purpose`)),
    notes: valueOrDefault(prior.notes, valueOrDefault(progress.notes, [`${TODO_PREFIX} operator-visible scope note`])),
    defaults: valueOrDefault(prior.defaults, valueOrDefault(progress.defaults, {})),
    policy: isPlainObject(prior.policy) ? prior.policy : {
      arch_validation: valueOrDefault(progress.arch_validation, DEFAULTS.policy.arch_validation),
      pipeline_review: valueOrDefault(progress.pipeline_review, DEFAULTS.policy.pipeline_review),
      case_study: valueOrDefault(progress.case_study, DEFAULTS.policy.case_study),
      telemetry: valueOrDefault(progress.telemetry, DEFAULTS.policy.telemetry),
      payload: valueOrDefault(progress.payload, DEFAULTS.policy.payload),
    },
    execution_order: valueOrDefault(prior.execution_order, valueOrDefault(progress.execution_order, inferredOrder)),
    modules: mergeObjects(modules, prior.modules),
    gates,
  };
}
