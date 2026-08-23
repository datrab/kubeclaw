import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULTS,
  entriesOf,
  firstHeading,
  isPlainObject,
  listDirs,
  listFiles,
  MIGRATED_SUITES,
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

function inferSuites(moduleDir: string, hasBuster: boolean, existing: unknown): string[] {
  if (Array.isArray(existing)) return existing.filter((suite) => typeof suite === 'string' && !MIGRATED_SUITES.has(suite));
  if (!hasBuster) return [];
  const suites: string[] = [];
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
  const serveSuites = ['security', 'a11y', 'perf', 'e2e', 'visual-reg'];
  if (!input.suites.some((suite: string) => serveSuites.includes(suite))) return;
  config.serve = {
    type: 'server',
    project_dir: `Projects/${input.project}/src`,
    start_cmd: input.scripts.start,
    image: `localhost/${input.project}:${input.moduleId}`,
    port: 3000,
  };
  const dockerfile = path.join(input.projectSrcDir, 'Dockerfile');
  if (!fs.existsSync(dockerfile)) return;
  config.serve.dockerfile = relFromRepo(input.repoRoot, dockerfile);
  config.serve.build_context = `Projects/${input.project}/src`;
}

function addSuiteConfigs(config: AnyRecord, input: AnyRecord) {
  if (input.suites.includes('api')) {
    config.api = { spec_file: relFromSwarm(path.join(input.projectSrcDir, '.swarm'), path.join(input.moduleDir, 'test-spec.json')) };
  }
}

function sanitizedTestConfig(value: unknown, suites: string[]): AnyRecord | undefined {
  if (!isPlainObject(value)) return undefined;
  const config = structuredClone(value);
  delete config.k8s;
  delete config.bundle;
  if (isPlainObject(config.serve)) {
    for (const field of ['health_path', 'health_retries', 'health_base_delay', 'health_timeout',
      'smoke_paths', 'smoke_expected_text']) delete config.serve[field];
    if (!suites.some((suite) => ['security', 'a11y', 'perf', 'e2e', 'visual-reg'].includes(suite))) delete config.serve;
  }
  return Object.keys(config).length ? config : undefined;
}

function safeNodeId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9-]+/gu, '-').replace(/^-+|-+$/gu, '').slice(0, 64) || 'scope';
}

function legacyBundleNodes(existingConfig: unknown, projectSrcDir: string, repositoryRoot: string, scopeId: string): AnyRecord {
  const bundle = objectOrEmpty(objectOrEmpty(existingConfig).bundle);
  const configured = bundle.www_dir;
  if (typeof configured !== 'string' || configured.trim().length === 0) {
    throw new Error(`LEGACY_BUNDLE_CONFIGURATION_RETIRED:${scopeId}: set bundle.www_dir once so the scaffold can create an explicit size-budget artifact producer`);
  }
  const absolute = path.isAbsolute(configured) ? path.resolve(configured) : path.resolve(projectSrcDir, configured);
  const relative = path.relative(projectSrcDir, absolute).split(path.sep).join('/');
  if (!relative || relative === '..' || relative.startsWith('../')) {
    throw new Error(`LEGACY_BUNDLE_OUTPUT_PATH_DENIED:${scopeId}:${configured}`);
  }
  const workingDirectory = path.relative(repositoryRoot, projectSrcDir).split(path.sep).join('/');
  if (!workingDirectory || workingDirectory === '..' || workingDirectory.startsWith('../')) {
    throw new Error(`LEGACY_BUNDLE_PROJECT_PATH_DENIED:${scopeId}:${projectSrcDir}`);
  }
  const thresholds = objectOrEmpty(bundle.thresholds);
  const config: AnyRecord = { format: 'tar', largestFiles: 5 };
  if (Number.isFinite(thresholds.max_size_kb) && thresholds.max_size_kb >= 0) {
    config.maximumTotalBytes = Math.trunc(thresholds.max_size_kb * 1024);
  }
  if (Number.isSafeInteger(thresholds.max_file_count) && thresholds.max_file_count >= 0) {
    config.maximumFileCount = thresholds.max_file_count;
  }
  const blocking = config.maximumTotalBytes !== undefined || config.maximumFileCount !== undefined;
  const archive = `.swarm/size-budget-${safeNodeId(scopeId)}.tar`;
  return {
    'size-budget-artifact': {
      uses: 'kubeclaw.direct-command@1', mode: 'blocking', retries: 0, concurrencyGroup: 'size-budget',
      config: { executable: 'tar', args: ['--format=ustar', '--transform=s,^\\./,,;s,^\\.$,root,',
        '-cf', archive, '-C', relative, '.'],
        workingDirectory, resultMode: 'exit-code', artifacts: [
          { id: 'build-output', path: archive, mediaType: 'application/vnd.kubeclaw.build-output.tar' },
        ] },
    },
    'size-budget': {
      uses: 'kubeclaw.size-budget@1', mode: blocking ? 'blocking' : 'advisory', retries: 0,
      concurrencyGroup: 'size-budget', config,
      inputs: { 'build-output': { from: 'size-budget-artifact', output: 'artifact-1' } },
    },
  };
}

function inferTestConfig(input: AnyRecord): AnyRecord | undefined {
  if (isPlainObject(input.existingConfig)) return sanitizedTestConfig(input.existingConfig, input.suites);
  if (!Array.isArray(input.suites) || input.suites.length === 0) return undefined;
  const config: AnyRecord = {};
  const enriched = { ...input, scripts: packageScripts(input.projectSrcDir) };
  addServeConfig(config, enriched);
  addSuiteConfigs(config, enriched);
  return config;
}

function httpNodes(existingConfig: unknown, deploymentNode?: string): AnyRecord {
  const config = objectOrEmpty(existingConfig);
  const serve = objectOrEmpty(config.serve);
  const baseConfig: AnyRecord = {
    ...(deploymentNode ? {} : { url: `${TODO_PREFIX} provider-reachable HTTP origin or use a deployment input` }),
    path: typeof serve.health_path === 'string' ? serve.health_path : '/',
    expectedStatuses: [200],
    requestTimeoutMs: Number.isSafeInteger(serve.health_timeout) ? serve.health_timeout : 10_000,
  };
  const tests: AnyRecord = {
    'http-health': {
      uses: 'kubeclaw.http@1', mode: 'blocking',
      retries: Number.isSafeInteger(serve.health_retries) ? Math.max(0, serve.health_retries - 1) : 2,
      concurrencyGroup: 'http', config: baseConfig,
      ...(deploymentNode ? { inputs: { deployment: { from: deploymentNode, output: 'deployment',
        schemaId: 'kubeclaw.kubernetes-deployment-fixture@1' } } } : {}),
    },
  };
  const expected = objectOrEmpty(serve.smoke_expected_text);
  const paths = Array.isArray(serve.smoke_paths) ? serve.smoke_paths : [];
  paths.forEach((requestPath: unknown, index: number) => {
    if (typeof requestPath !== 'string') return;
    tests[`smoke-${index + 1}`] = {
      uses: 'kubeclaw.http@1', mode: 'blocking', needs: ['http-health'], concurrencyGroup: 'http',
      config: { ...baseConfig, path: requestPath,
        ...(typeof expected[requestPath] === 'string' ? { expectedText: expected[requestPath] } : {}) },
      ...(deploymentNode ? { inputs: { deployment: { from: deploymentNode, output: 'deployment',
        schemaId: 'kubeclaw.kubernetes-deployment-fixture@1' } } } : {}),
    };
  });
  return tests;
}

function withDependency(node: unknown, dependency: string): unknown {
  if (!isPlainObject(node)) return node;
  const needs = Array.isArray(node.needs) ? node.needs.filter((item) => typeof item === 'string') : [];
  return { ...node, needs: [...new Set([...needs, dependency])] };
}

function scopeWithProviders(existingScope: unknown, testConfig: unknown, options: {
  addHttp: boolean; addSizeBudget: boolean; projectSrcDir: string; repositoryRoot: string; scopeId: string;
}): AnyRecord {
  const scope = objectOrEmpty(existingScope);
  const fixtures = objectOrEmpty(scope.fixtures);
  const deploymentNode = Object.entries(fixtures).find(([, fixture]) => isPlainObject(fixture)
    && fixture.uses === 'kubeclaw.kubernetes-fixture@1')?.[0];
  const tests = objectOrEmpty(scope.tests);
  const hasHttp = Object.values(tests).some((test) => isPlainObject(test) && test.uses === 'kubeclaw.http@1');
  const existingSizeBudget = Object.entries(tests).find(([, test]) => isPlainObject(test) && test.uses === 'kubeclaw.size-budget@1');
  const hasSizeBudget = existingSizeBudget !== undefined;
  const generatedBudget = !hasSizeBudget && options.addSizeBudget
    ? legacyBundleNodes(testConfig, options.projectSrcDir, options.repositoryRoot, options.scopeId) : {};
  const combinedTests = { ...tests, ...generatedBudget,
    ...(!hasHttp && options.addHttp ? httpNodes(testConfig, deploymentNode) : {}) };
  const budgetNodeId = existingSizeBudget?.[0] ?? 'size-budget';
  const orderedTests = options.addSizeBudget
    ? Object.fromEntries(Object.entries(combinedTests).map(([id, test]) => [id,
      isPlainObject(test) && test.uses === 'kubeclaw.http@1' ? withDependency(test, budgetNodeId) : test]))
    : combinedTests;
  const orderedFixtures = options.addSizeBudget
    ? Object.fromEntries(Object.entries(fixtures).map(([id, fixture]) => [id, withDependency(fixture, budgetNodeId)]))
    : fixtures;
  return { ...scope,
    tests: orderedTests,
    fixtures: orderedFixtures,
    concurrencyLimits: { ...(options.addHttp ? { http: 4 } : {}), ...(options.addSizeBudget ? { 'size-budget': 2 } : {}),
      ...objectOrEmpty(scope.concurrencyLimits) } };
}

function rejectRetiredKubernetesConfig(scope: AnyRecord, scopeId: string) {
  const suites = scope.test_suites;
  if ((Array.isArray(suites) && suites.includes('k8s')) || isPlainObject(objectOrEmpty(scope.test_config).k8s)) {
    throw new Error(`LEGACY_K8S_CONFIGURATION_RETIRED:${scopeId}: define kubeclaw.kubernetes-fixture@1 in .swarm/pipeline.json`);
  }
}

function buildPipeline(context: Context, progress: AnyRecord, modules: AnyRecord, gates: AnyRecord): AnyRecord {
  const existing = objectOrEmpty(readJsonIfExists(path.join(context.swarmDir, 'pipeline.json')));
  const existingModules = objectOrEmpty(existing.modules);
  const existingGates = objectOrEmpty(existing.gates);
  const progressModules = objectOrEmpty(progress.modules);
  const progressGates = objectOrEmpty(progress.gates);
  const projectSrcDir = path.dirname(context.swarmDir);
  const moduleScopes = Object.fromEntries(Object.entries(modules)
    .filter(([, module]) => isPlainObject(module) && Array.isArray(module.stages) && module.stages.includes('buster'))
    .map(([id]) => {
      const prior = objectOrEmpty(progressModules[id]);
      rejectRetiredKubernetesConfig(prior, id);
      const selected = prior.test_suites;
      return [id, scopeWithProviders(existingModules[id], prior.test_config, {
        addHttp: !Array.isArray(selected) || selected.includes('health'),
        addSizeBudget: Array.isArray(selected) && selected.includes('bundle'), projectSrcDir,
        repositoryRoot: context.repoRoot, scopeId: id,
      })];
    }));
  const gateScopes = Object.fromEntries(Object.entries(gates)
    .filter(([, gate]) => isPlainObject(gate) && gate.type === 'buster')
    .map(([id]) => {
      const prior = objectOrEmpty(progressGates[id]);
      rejectRetiredKubernetesConfig(prior, id);
      const selected = prior.test_suites;
      return [id, scopeWithProviders(existingGates[id], prior.test_config, {
        addHttp: !Array.isArray(selected) || selected.includes('health'),
        addSizeBudget: Array.isArray(selected) && selected.includes('bundle'), projectSrcDir,
        repositoryRoot: context.repoRoot, scopeId: id,
      })];
    }));
  return { project: context.project, modules: moduleScopes, gates: gateScopes };
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
    const suites = inferSuites(moduleDir, hasBuster, existing.test_suites);
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
    const suites = (Array.isArray(existing.test_suites) ? existing.test_suites : required)
      .filter((suite) => typeof suite === 'string' && !MIGRATED_SUITES.has(suite));
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
  const pipeline = buildPipeline(context, progress, modules, gates);
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
    pipeline,
  };
}
