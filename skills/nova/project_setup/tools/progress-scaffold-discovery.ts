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
  delete config.manifest;
  delete config.api;
  delete config.a11y;
  delete config.perf;
  delete config['visual-reg'];
  delete config.e2e;
  delete config.security;
  if (isPlainObject(config.serve)) {
    for (const field of ['health_path', 'health_retries', 'health_base_delay', 'health_timeout',
      'smoke_paths', 'smoke_expected_text', 'deployment_yaml', 'secret_yaml']) delete config.serve[field];
    if (!suites.some((suite) => ['security', 'a11y', 'perf', 'e2e', 'visual-reg'].includes(suite))) delete config.serve;
  }
  return Object.keys(config).length ? config : undefined;
}

function legacyManifestPath(config: AnyRecord, field: 'deployment_yaml' | 'secret_yaml'): string | null {
  const manifest = objectOrEmpty(config.manifest);
  const serve = objectOrEmpty(config.serve);
  const value = manifest[field] ?? serve[field];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function lintDeclaration(existing: unknown, progress: AnyRecord, repositoryRoot: string): AnyRecord | undefined {
  const current = objectOrEmpty(existing);
  const raw = Array.isArray(current.rawManifests)
    ? current.rawManifests.filter((entry) => typeof entry === 'string') : [];
  const charts = Array.isArray(current.helmCharts)
    ? current.helmCharts.filter((entry) => typeof entry === 'string') : [];
  const scopes = [...entriesOf(progress.modules), ...entriesOf(progress.gates)];
  for (const [scopeId, scope] of scopes) {
    const selected = Array.isArray(scope.test_suites) && scope.test_suites.includes('manifest');
    const config = objectOrEmpty(scope.test_config);
    if (!selected && !isPlainObject(config.manifest)) continue;
    const deployment = legacyManifestPath(config, 'deployment_yaml');
    if (!deployment) throw new Error(`LEGACY_MANIFEST_DEPLOYMENT_MISSING:${scopeId}`);
    raw.push(relativeRepositoryPath(repositoryRoot, deployment, `${scopeId}:manifest.deployment_yaml`));
    const secret = legacyManifestPath(config, 'secret_yaml');
    if (secret) raw.push(relativeRepositoryPath(repositoryRoot, secret, `${scopeId}:manifest.secret_yaml`));
  }
  const rawManifests = [...new Set(raw)];
  const helmCharts = [...new Set(charts)];
  if (rawManifests.length + helmCharts.length === 0) return undefined;
  return {
    uses: 'kubeclaw.lint.full',
    policyProject: typeof current.policyProject === 'string' && current.policyProject.trim()
      ? current.policyProject.trim() : 'workspace',
    rawManifests,
    helmCharts,
  };
}

function safeNodeId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9-]+/gu, '-').replace(/^-+|-+$/gu, '').slice(0, 64) || 'scope';
}

function relativeRepositoryPath(repositoryRoot: string, value: string, label: string): string {
  const absolute = path.isAbsolute(value) ? path.resolve(value) : path.resolve(repositoryRoot, value);
  const relative = path.relative(repositoryRoot, absolute).split(path.sep).join('/');
  if (!relative || relative === '..' || relative.startsWith('../')) {
    throw new Error(`LEGACY_BUILD_PATH_DENIED:${label}:${value}`);
  }
  return relative;
}

function legacyBuildNode(existingConfig: unknown, projectSrcDir: string, repositoryRoot: string, scopeId: string): AnyRecord {
  const serve = objectOrEmpty(objectOrEmpty(existingConfig).serve);
  const defaultContext = path.relative(repositoryRoot, projectSrcDir).split(path.sep).join('/');
  const configuredContext = typeof serve.build_context === 'string' && serve.build_context.trim()
    ? serve.build_context.trim() : defaultContext;
  const buildContext = relativeRepositoryPath(repositoryRoot, configuredContext, `${scopeId}:build_context`);
  const configuredDockerfile = typeof serve.dockerfile === 'string' && serve.dockerfile.trim()
    ? serve.dockerfile.trim() : path.join(buildContext, 'Dockerfile').split(path.sep).join('/');
  const dockerfile = relativeRepositoryPath(repositoryRoot, configuredDockerfile, `${scopeId}:dockerfile`);
  if (!fs.existsSync(path.join(repositoryRoot, buildContext)) || !fs.statSync(path.join(repositoryRoot, buildContext)).isDirectory()) {
    throw new Error(`LEGACY_BUILD_CONTEXT_MISSING:${scopeId}:${buildContext}`);
  }
  if (!fs.existsSync(path.join(repositoryRoot, dockerfile)) || !fs.statSync(path.join(repositoryRoot, dockerfile)).isFile()) {
    throw new Error(`LEGACY_BUILD_DOCKERFILE_MISSING:${scopeId}:${dockerfile}`);
  }
  const definition: AnyRecord = { type: 'dockerfile', dockerfile };
  if (typeof serve.target === 'string' && serve.target.trim()) definition.target = serve.target.trim();
  if (isPlainObject(serve.build_args)) definition.buildArgs = structuredClone(serve.build_args);
  const values: AnyRecord = {
    buildContext,
    definition,
    outputName: safeNodeId(scopeId),
    platform: typeof serve.platform === 'string' && serve.platform.trim() ? serve.platform.trim() : 'linux/amd64',
  };
  return {
    uses: 'kubeclaw.container-build@1', mode: 'blocking', retries: 1,
    concurrencyGroup: 'container-build', config: values,
  };
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

function legacyApiNode(existingConfig: unknown, repositoryRoot: string, projectSrcDir: string, scopeId: string,
  deploymentNode?: string): AnyRecord {
  const config = objectOrEmpty(existingConfig);
  const api = objectOrEmpty(config.api);
  const serve = objectOrEmpty(config.serve);
  if (typeof api.spec_file !== 'string' || !api.spec_file.trim()) throw new Error(`LEGACY_API_SPEC_MISSING:${scopeId}`);
  const base = typeof serve.project_dir === 'string' && serve.project_dir.trim()
    ? path.resolve(repositoryRoot, serve.project_dir) : projectSrcDir;
  const baseRelative = path.relative(repositoryRoot, base);
  if (baseRelative === '..' || baseRelative.startsWith(`..${path.sep}`)) {
    throw new Error(`LEGACY_API_PROJECT_PATH_DENIED:${scopeId}:${String(serve.project_dir)}`);
  }
  const absolute = path.resolve(base, api.spec_file);
  const scopedRelative = path.relative(base, absolute);
  const relative = path.relative(repositoryRoot, absolute).split(path.sep).join('/');
  if (!relative || relative === '..' || relative.startsWith('../') || scopedRelative === '..'
    || scopedRelative.startsWith(`..${path.sep}`) || !fs.existsSync(absolute)) {
    throw new Error(`LEGACY_API_SPEC_DENIED:${scopeId}:${api.spec_file}`);
  }
  let realSpec: string;
  try { realSpec = fs.realpathSync(absolute); } catch { throw new Error(`LEGACY_API_SPEC_DENIED:${scopeId}:${api.spec_file}`); }
  const realRepository = fs.realpathSync(repositoryRoot);
  if (!realSpec.startsWith(`${realRepository}${path.sep}`) || !fs.statSync(realSpec).isFile()) {
    throw new Error(`LEGACY_API_SPEC_DENIED:${scopeId}:${api.spec_file}`);
  }
  const parsed = readJsonIfExists(realSpec);
  if (parsed?.schemaVersion !== 'kubeclaw.api-flow.v1') {
    throw new Error(`LEGACY_API_SPEC_VERSION_RETIRED:${scopeId}: convert ${api.spec_file} to kubeclaw.api-flow.v1`);
  }
  return { uses: 'kubeclaw.api-flow@1', mode: 'blocking', retries: 0, concurrencyGroup: 'api',
    ...(deploymentNode ? { needs: [deploymentNode] } : {}),
    config: { flowFile: relative, ...(deploymentNode ? {} : { url: `${TODO_PREFIX} provider-reachable API origin or add a deployment input` }) },
    ...(deploymentNode ? { inputs: { deployment: { from: deploymentNode, output: 'deployment',
      schemaId: 'kubeclaw.kubernetes-deployment-fixture@1' } } } : {}) };
}

function legacyA11yNode(existingConfig: unknown, scopeId: string, deploymentNode?: string): AnyRecord {
  const config = objectOrEmpty(existingConfig);
  const a11y = objectOrEmpty(config.a11y);
  if (isPlainObject(a11y.thresholds)) {
    throw new Error(`LEGACY_A11Y_THRESHOLDS_RETIRED:${scopeId}: replace numeric thresholds with exact rule, route, selector, reason, and expiry acceptances`);
  }
  const route = typeof a11y.path === 'string' && a11y.path.trim() ? a11y.path.trim() : '/';
  if (!route.startsWith('/') || route.startsWith('//') || /[?#\r\n]/u.test(route)) {
    throw new Error(`LEGACY_A11Y_PATH_INVALID:${scopeId}:${route}`);
  }
  if (a11y.timeout !== undefined
    && (!Number.isSafeInteger(a11y.timeout) || Number(a11y.timeout) < 1000 || Number(a11y.timeout) > 120000)) {
    throw new Error(`LEGACY_A11Y_TIMEOUT_INVALID:${scopeId}:${String(a11y.timeout)}`);
  }
  const values: AnyRecord = { routes: [route], profiles: ['desktop', 'mobile'],
    tags: Array.isArray(a11y.tags) && a11y.tags.length ? structuredClone(a11y.tags) : ['wcag2a', 'wcag2aa'],
    exclude: Array.isArray(a11y.exclude) ? structuredClone(a11y.exclude) : [],
    ...(Number.isSafeInteger(a11y.timeout) ? { timeoutMs: a11y.timeout } : {}),
    ...(deploymentNode ? {} : { url: `${TODO_PREFIX} provider-reachable browser origin or add a deployment input` }),
  };
  return { uses: 'kubeclaw.axe@1', mode: 'blocking', retries: 0, concurrencyGroup: 'browser-axe', config: values,
    ...(deploymentNode ? { needs: [deploymentNode], inputs: { deployment: { from: deploymentNode, output: 'deployment',
      schemaId: 'kubeclaw.kubernetes-deployment-fixture@1' } } } : {}) };
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

function exposureNodes(existingConfig: unknown, deploymentNode: string): { fixtures: AnyRecord; tests: AnyRecord } {
  const preview = objectOrEmpty(objectOrEmpty(existingConfig).tailscale_preview);
  const exposureId = 'tailscale-exposure';
  const config: AnyRecord = { path: '/' };
  if (typeof preview.hostname === 'string' && preview.hostname.trim()) config.hostname = preview.hostname.trim();
  const maxTimeSeconds = preview.max_time_seconds ?? 30;
  if (!Number.isSafeInteger(maxTimeSeconds) || maxTimeSeconds < 1 || maxTimeSeconds > 300) {
    throw new Error('LEGACY_TAILSCALE_PREVIEW_MAX_TIME_INVALID: use an integer from 1 to 300 seconds');
  }
  const baseHttp: AnyRecord = { path: '/', expectedStatuses: [200], requestTimeoutMs: maxTimeSeconds * 1000 };
  if (typeof preview.expected_text === 'string' && preview.expected_text) baseHttp.expectedText = preview.expected_text;
  const tests: AnyRecord = {
    'public-http-health': { uses: 'kubeclaw.http@1', mode: 'blocking', retries: 2,
      needs: [exposureId], concurrencyGroup: 'http', config: baseHttp,
      inputs: { endpoint: { from: exposureId, output: 'exposure', schemaId: 'kubeclaw.public-endpoint-fixture@1' } } },
  };
  const expected = objectOrEmpty(preview.smoke_expected_text);
  const paths = Array.isArray(preview.smoke_paths) ? preview.smoke_paths : [];
  paths.forEach((requestPath: unknown, index: number) => {
    if (typeof requestPath !== 'string') return;
    tests[`public-smoke-${index + 1}`] = { uses: 'kubeclaw.http@1', mode: 'blocking', retries: 1,
      needs: ['public-http-health'], concurrencyGroup: 'http', config: { ...baseHttp, path: requestPath,
        ...(typeof expected[requestPath] === 'string' ? { expectedText: expected[requestPath] } : {}) },
      inputs: { endpoint: { from: exposureId, output: 'exposure', schemaId: 'kubeclaw.public-endpoint-fixture@1' } } };
  });
  return { fixtures: { [exposureId]: { uses: 'kubeclaw.tailscale-exposure@1', retries: 0,
    needs: [deploymentNode], concurrencyGroup: 'tailscale-exposure', config,
    inputs: { deployment: { from: deploymentNode, output: 'deployment', schemaId: 'kubeclaw.kubernetes-deployment-fixture@1' } } } }, tests };
}

function withDependency(node: unknown, dependency: string): unknown {
  if (!isPlainObject(node)) return node;
  const needs = Array.isArray(node.needs) ? node.needs.filter((item) => typeof item === 'string') : [];
  return { ...node, needs: [...new Set([...needs, dependency])] };
}

function withImageInput(node: unknown, buildNode: string): unknown {
  if (!isPlainObject(node)) return node;
  const inputs = objectOrEmpty(node.inputs);
  return { ...node, inputs: { ...inputs, image: {
    from: buildNode, output: 'image', schemaId: 'kubeclaw.container-image@1',
  } } };
}

function scopeWithProviders(existingScope: unknown, testConfig: unknown, options: {
  addContainerBuild: boolean; addHttp: boolean; addSizeBudget: boolean; addExposure: boolean; addApi: boolean; addA11y: boolean; legacyUnitSelected: boolean;
  legacyPerfSelected: boolean;
  legacyVisualSelected: boolean;
  legacyE2eSelected: boolean;
  legacySecuritySelected: boolean;
  projectSrcDir: string; repositoryRoot: string; swarmDir: string; scopeId: string;
}): AnyRecord {
  const scope = objectOrEmpty(existingScope);
  const fixtures = objectOrEmpty(scope.fixtures);
  const deploymentNode = Object.entries(fixtures).find(([, fixture]) => isPlainObject(fixture)
    && fixture.uses === 'kubeclaw.kubernetes-fixture@1')?.[0];
  const tests = objectOrEmpty(scope.tests);
  const hasLighthouse = Object.values(tests).some((test) => isPlainObject(test)
    && test.uses === 'kubeclaw.lighthouse@1');
  if (isPlainObject(objectOrEmpty(testConfig).perf)) {
    throw new Error(`LEGACY_PERF_CONFIGURATION_RETIRED:${options.scopeId}: define named Lighthouse profiles, budgets, and kubeclaw.lighthouse@1 nodes in .swarm/pipeline.json`);
  }
  if (options.legacyPerfSelected && !hasLighthouse) {
    throw new Error(`LEGACY_PERF_CONFIGURATION_RETIRED:${options.scopeId}: define kubeclaw.lighthouse@1 in .swarm/pipeline.json`);
  }
  if (isPlainObject(objectOrEmpty(testConfig)['visual-reg'])) {
    throw new Error(`LEGACY_VISUAL_CONFIGURATION_RETIRED:${options.scopeId}: define reviewed baselines, profiles, and kubeclaw.visual@1 in .swarm/pipeline.json`);
  }
  if (options.legacyVisualSelected) {
    throw new Error(`LEGACY_VISUAL_CONFIGURATION_RETIRED:${options.scopeId}: define kubeclaw.visual@1 in .swarm/pipeline.json`);
  }
  if (isPlainObject(objectOrEmpty(testConfig).e2e) || options.legacyE2eSelected) {
    throw new Error(`LEGACY_E2E_CONFIGURATION_RETIRED:${options.scopeId}: define a project-owned Playwright config and kubeclaw.playwright@1 in .swarm/pipeline.json`);
  }
  if (isPlainObject(objectOrEmpty(testConfig).security) || options.legacySecuritySelected) {
    throw new Error(`LEGACY_SECURITY_CONFIGURATION_RETIRED:${options.scopeId}: define explicit kubeclaw.security-headers@1, dependency-scan-trivy@1, image-scan-trivy@1, kubernetes-policy-security@1, and kubernetes-runtime-security@1 nodes in .swarm/pipeline.json`);
  }
  if (options.addExposure && !deploymentNode) {
    throw new Error(`LEGACY_TAILSCALE_PREVIEW_CONFIGURATION_RETIRED:${options.scopeId}: define kubeclaw.kubernetes-fixture@1 before Tailscale exposure`);
  }
  const exposure = options.addExposure ? exposureNodes(testConfig, deploymentNode!) : { fixtures: {}, tests: {} };
  const hasDirectCommand = Object.values(tests).some((test) => isPlainObject(test)
    && test.uses === 'kubeclaw.direct-command@1');
  if (options.legacyUnitSelected && !hasDirectCommand) {
    throw new Error(`LEGACY_UNIT_CONFIGURATION_RETIRED:${options.scopeId}: define kubeclaw.direct-command@1 in .swarm/pipeline.json`);
  }
  const hasHttp = Object.values(tests).some((test) => isPlainObject(test) && test.uses === 'kubeclaw.http@1');
  const existingContainerBuild = Object.entries(tests).find(([, test]) => isPlainObject(test)
    && test.uses === 'kubeclaw.container-build@1');
  const hasContainerBuild = existingContainerBuild !== undefined;
  const hasDependencySecurity = Object.values(tests).some((test) => isPlainObject(test)
    && test.uses === 'kubeclaw.dependency-scan-trivy@1');
  const existingSizeBudget = Object.entries(tests).find(([, test]) => isPlainObject(test) && test.uses === 'kubeclaw.size-budget@1');
  const hasSizeBudget = existingSizeBudget !== undefined;
  const generatedA11y = options.addA11y ? legacyA11yNode(testConfig, options.scopeId, deploymentNode) : null;
  const generatedBudget = !hasSizeBudget && options.addSizeBudget
    ? legacyBundleNodes(testConfig, options.projectSrcDir, options.repositoryRoot, options.scopeId) : {};
  const generatedBuild = !hasContainerBuild && options.addContainerBuild
    ? { 'container-build': legacyBuildNode(testConfig, options.projectSrcDir, options.repositoryRoot, options.scopeId) }
    : {};
  const combinedTests = { ...tests,
    ...(!hasDependencySecurity ? { 'dependency-security': { uses: 'kubeclaw.dependency-scan-trivy@1', mode: 'blocking', retries: 0,
      concurrencyGroup: 'security-dependency', config: { projectDirectory: '.', policy: { profile: 'strict-v1' } } } } : {}),
    ...generatedBuild, ...generatedBudget, ...exposure.tests,
    ...(options.addApi && !Object.values(tests).some((test) => isPlainObject(test) && test.uses === 'kubeclaw.api-flow@1')
      ? { 'api-flow': legacyApiNode(testConfig, options.repositoryRoot, options.projectSrcDir, options.scopeId, deploymentNode) } : {}),
    ...(options.addA11y && !Object.values(tests).some((test) => isPlainObject(test) && test.uses === 'kubeclaw.axe@1')
      ? { axe: generatedA11y } : {}),
    ...(!hasHttp && options.addHttp ? httpNodes(testConfig, deploymentNode) : {}) };
  const budgetNodeId = existingSizeBudget?.[0] ?? 'size-budget';
  const orderedTests = options.addSizeBudget
    ? Object.fromEntries(Object.entries(combinedTests).map(([id, test]) => [id,
      isPlainObject(test) && test.uses === 'kubeclaw.http@1' ? withDependency(test, budgetNodeId) : test]))
    : combinedTests;
  const buildNodeId = existingContainerBuild?.[0] ?? 'container-build';
  const orderedFixtures = Object.fromEntries(Object.entries({ ...fixtures, ...exposure.fixtures }).map(([id, fixture]) => {
    let next = options.addSizeBudget ? withDependency(fixture, budgetNodeId) : fixture;
    if (options.addContainerBuild && isPlainObject(next) && next.uses === 'kubeclaw.kubernetes-fixture@1') {
      next = withImageInput(withDependency(next, buildNodeId), buildNodeId);
    }
    return [id, next];
  }));
  return { ...scope,
    tests: orderedTests,
    fixtures: orderedFixtures,
    concurrencyLimits: { ...(options.addContainerBuild ? { 'container-build': 1 } : {}),
      ...(options.addHttp || options.addExposure ? { http: 4 } : {}), ...(options.addSizeBudget ? { 'size-budget': 2 } : {}),
      ...(options.addExposure ? { 'tailscale-exposure': 1 } : {}),
      ...(options.addApi ? { api: 1 } : {}),
      ...(options.addA11y ? { 'browser-axe': 2 } : {}),
      'security-dependency': 1,
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
      // Provider conversion consumes the raw prior record here. Sanitization
      // applies only to the separately persisted residual progress record.
      return [id, scopeWithProviders(existingModules[id], prior.test_config, {
        addContainerBuild: Array.isArray(selected) && selected.includes('build'),
        addHttp: !Array.isArray(selected) || selected.includes('health'),
        addSizeBudget: Array.isArray(selected) && selected.includes('bundle'),
        addExposure: Array.isArray(selected) && selected.includes('tailscale-preview'),
        addApi: Array.isArray(selected) && selected.includes('api'),
        addA11y: Array.isArray(selected) && selected.includes('a11y'),
        legacyPerfSelected: Array.isArray(selected) && selected.includes('perf'),
        legacyVisualSelected: Array.isArray(selected) && selected.includes('visual-reg'),
        legacyE2eSelected: Array.isArray(selected) && selected.includes('e2e'),
        legacySecuritySelected: Array.isArray(selected) && selected.includes('security'),
        legacyUnitSelected: Array.isArray(selected) && selected.includes('unit'), projectSrcDir,
        repositoryRoot: context.repoRoot, swarmDir: context.swarmDir, scopeId: id,
      })];
    }));
  const gateScopes = Object.fromEntries(Object.entries(gates)
    .filter(([, gate]) => isPlainObject(gate) && gate.type === 'buster')
    .map(([id]) => {
      const prior = objectOrEmpty(progressGates[id]);
      rejectRetiredKubernetesConfig(prior, id);
      const selected = prior.test_suites;
      return [id, scopeWithProviders(existingGates[id], prior.test_config, {
        addContainerBuild: Array.isArray(selected) && selected.includes('build'),
        addHttp: !Array.isArray(selected) || selected.includes('health'),
        addSizeBudget: Array.isArray(selected) && selected.includes('bundle'),
        addExposure: Array.isArray(selected) && selected.includes('tailscale-preview'),
        addApi: Array.isArray(selected) && selected.includes('api'),
        addA11y: Array.isArray(selected) && selected.includes('a11y'),
        legacyPerfSelected: Array.isArray(selected) && selected.includes('perf'),
        legacyVisualSelected: Array.isArray(selected) && selected.includes('visual-reg'),
        legacyE2eSelected: Array.isArray(selected) && selected.includes('e2e'),
        legacySecuritySelected: Array.isArray(selected) && selected.includes('security'),
        legacyUnitSelected: Array.isArray(selected) && selected.includes('unit'), projectSrcDir,
        repositoryRoot: context.repoRoot, swarmDir: context.swarmDir, scopeId: id,
      })];
    }));
  return omitEmpty({ project: context.project,
    lint: lintDeclaration(existing.lint, progress, context.repoRoot),
    modules: moduleScopes, gates: gateScopes });
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
  // Provider conversion reads raw legacy config before retired fields are removed from persisted progress.
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
