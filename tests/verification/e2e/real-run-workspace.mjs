import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  applyRealE2EConfigScenario,
  applyRealE2EWorkspaceScenario,
  applyRealE2EScenario,
  assertScenarioMutationChannel,
  realE2EScenarioModuleIds,
  validateRealE2EScenarioSetup,
} from './failure-scenarios.mjs';
import { expandSwarmConfig } from '../../../skills/buster/plugins/buster-suite-runtime/common/pipeline/platform-config.ts';

const execFileAsync = promisify(execFile);

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(SCRIPT_DIR, '../../..');
export const DEFAULT_REAL_E2E_MODEL = 'openai/gpt-5.3-codex-spark';
export const DEFAULT_REAL_E2E_THINKING = 'none';
export const DEFAULT_REAL_E2E_MODULE_TIMEOUT_MINUTES = 10;
export const DEFAULT_REAL_E2E_AGENT_JUDGMENT_MODULE_TIMEOUT_MINUTES = 10;
const REAL_E2E_MODULE_AUTO_RETRY_THRESHOLD = 2;
const REAL_E2E_MODULE_MAX_FAILS = REAL_E2E_MODULE_AUTO_RETRY_THRESHOLD + 1;
const FIXTURE_DIR = path.join(SCRIPT_DIR, 'fixtures', 'nginx-project');
function realE2EDeploymentImage() {
  const image = process.env.REAL_E2E_DEPLOYMENT_IMAGE?.trim();
  if (!image) throw new Error('REAL_E2E_DEPLOYMENT_IMAGE_REQUIRED: supply the published immutable release image');
  if (!/^[a-z0-9.-]+\.svc\.cluster\.local:\d+\/[a-z0-9._/:-]+@sha256:[a-f0-9]{64}$/u.test(image)) {
    throw new Error('REAL_E2E_DEPLOYMENT_IMAGE_INVALID: expected an in-cluster immutable SHA-256 image reference');
  }
  return image;
}
const DEPLOYED_COMPACT_CONFIG_PATH = path.join(REPO_ROOT, 'charts', 'kubeclaw', 'files', 'config', 'swarm.config.json');
const REAL_E2E_MODULE_ID = '01-nginx';
const REAL_E2E_SEED_MODULE_IDS = Object.freeze(['01-nginx', '02-nginx', '03-nginx', '04-nginx']);
const REAL_E2E_CONTRACT_REFS = Object.freeze({
  deployableArtifact: 'contracts.deployable_artifact',
  runtimeConfig: 'contracts.runtime_config',
  moduleReview: 'contracts.module_review',
  previewInfrastructure: 'contracts.preview_infrastructure',
});
const REAL_E2E_CONTRACT_PATHS = Object.freeze({
  deployableArtifact: '.swarm/contracts/deployable-artifact.json',
  runtimeConfig: '.swarm/contracts/runtime-config.json',
  moduleReview: '.swarm/contracts/module-review.json',
  previewInfrastructure: '.swarm/contracts/preview-infrastructure.json',
});
const FOUNDATION_RUNTIME_INTERFACE = 'foundation-runtime-static-serving.v2';
const REAL_E2E_MODULE_SURFACES = Object.freeze({
  '01-nginx': Object.freeze({
    role: 'foundation',
    source_paths: Object.freeze(['nginx/default.conf']),
    output_contract: '.swarm/contracts/module-outputs/01-foundation.json',
    provides: Object.freeze([FOUNDATION_RUNTIME_INTERFACE]),
    provided_surfaces: Object.freeze(['nginx/default.conf']),
    contract_boundaries: Object.freeze([
      'runtime_foundation: nginx base image, listener, document root, and fallback behavior',
    ]),
    summary: 'Foundation module that owns reusable nginx runtime behavior.',
  }),
  '02-nginx': Object.freeze({
    role: 'parallel-content',
    source_paths: Object.freeze(['src/content/branch-a.html']),
    output_contract: '.swarm/contracts/module-outputs/02-content.json',
    consumes: Object.freeze(['.swarm/contracts/module-outputs/01-foundation.json']),
    consumed_surfaces: Object.freeze([FOUNDATION_RUNTIME_INTERFACE]),
    provides: Object.freeze(['branch-a-static-content.v2']),
    provided_surfaces: Object.freeze(['src/content/branch-a.html']),
    summary: 'Parallel content branch that owns static content input only.',
  }),
  '03-nginx': Object.freeze({
    role: 'parallel-assets',
    source_paths: Object.freeze(['src/assets/branch-b.css']),
    output_contract: '.swarm/contracts/module-outputs/03-assets.json',
    consumes: Object.freeze(['.swarm/contracts/module-outputs/01-foundation.json']),
    consumed_surfaces: Object.freeze([FOUNDATION_RUNTIME_INTERFACE]),
    provides: Object.freeze(['branch-b-static-asset.v2']),
    provided_surfaces: Object.freeze(['src/assets/branch-b.css']),
    summary: 'Parallel asset branch that owns presentation asset input only.',
  }),
  '04-nginx': Object.freeze({
    role: 'release-assembly',
    source_paths: Object.freeze(['Dockerfile', 'src/index.html', 'src/integration/module-map.json', 'k8s/deployment.yaml']),
    output_contract: '.swarm/contracts/module-outputs/04-integration.json',
    consumes: Object.freeze([
      '.swarm/contracts/module-outputs/01-foundation.json',
      '.swarm/contracts/module-outputs/02-content.json',
      '.swarm/contracts/module-outputs/03-assets.json',
    ]),
    consumed_surfaces: Object.freeze([
      FOUNDATION_RUNTIME_INTERFACE,
      'src/content/branch-a.html',
      'src/assets/branch-b.css',
    ]),
    contract_boundaries: Object.freeze([
      'image_packaging: Dockerfile copies foundation config and assembled static source into nginx',
      'app_composition: src/index.html + src/integration/module-map.json',
      'deployment_packaging: k8s/deployment.yaml',
    ]),
    summary: 'Release assembly module that consumes foundation and branch outputs, then owns the deployable composition.',
  }),
});

const REAL_E2E_BUSTER_AGENT_JUDGMENT = Object.freeze({
  '01-nginx': Object.freeze({
    required: true,
    reason: 'foundation_module_requires_buster_agent_judgment',
  }),
});

const REAL_E2E_DETERMINISTIC_BUSTER_AUTHORITY = Object.freeze({
  required: false,
  reason: 'seed_leaf_modules_use_deterministic_suite_authority',
});

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value);
}

function canonicalModuleIds(moduleIds) {
  const ids = Array.isArray(moduleIds) ? moduleIds.filter((id) => typeof id === 'string' && id.trim()) : [];
  return ids.length ? ids : [REAL_E2E_MODULE_ID];
}

function moduleSurface(moduleId) {
  return REAL_E2E_MODULE_SURFACES[moduleId] || Object.freeze({
    role: 'module',
    source_paths: Object.freeze(['src']),
    output_contract: `.swarm/contracts/module-outputs/${moduleId}.json`,
    summary: `Module ${moduleId} owns its declared source surface.`,
  });
}

function moduleBusterAgentJudgment(moduleId) {
  return REAL_E2E_BUSTER_AGENT_JUDGMENT[moduleId] || REAL_E2E_DETERMINISTIC_BUSTER_AUTHORITY;
}

function buildModuleOutputContracts(moduleIds) {
  return Object.fromEntries(canonicalModuleIds(moduleIds).map((moduleId) => {
    const surface = moduleSurface(moduleId);
    return [moduleId, {
      schema_version: 'real_e2e_module_output_contract.v2',
      artifact_type: 'module_output_contract',
      module_id: moduleId,
      role: surface.role,
      owned_source_paths: [...surface.source_paths],
      provides: [...(surface.provides || [])],
      provided_surfaces: [...(surface.provided_surfaces || [])],
      consumes: [...(surface.consumes || [])],
      consumed_surfaces: [...(surface.consumed_surfaces || [])],
      contract_boundaries: [...(surface.contract_boundaries || [])],
      summary: surface.summary,
      authority: {
        owner: moduleId,
        verifier: 'module-buster',
        rule: 'Each module owns only its declared source paths and output contract; parallel modules must not mutate each other or the final deployable artifact directly.',
      },
    }];
  }));
}

function buildDeployableArtifactContract({ projectName, projectSrc, releaseCandidateImage, moduleIds = [REAL_E2E_MODULE_ID] }) {
  const modules = canonicalModuleIds(moduleIds);
  return {
    schema_version: 'real_e2e_deployable_artifact_contract.v2',
    artifact_type: 'deployable_artifact_contract',
    project: projectName,
    producer_modules: modules,
    release_candidate_module: modules[modules.length - 1],
    module_output_contracts: modules.map((moduleId) => ({
      module_id: moduleId,
      path: moduleSurface(moduleId).output_contract,
      role: moduleSurface(moduleId).role,
    })),
    authority: {
      producer: 'release-candidate-module-buster',
      consumer: 'final-buster',
      rule: 'Only the release_candidate_module Buster owns immutable image verification; Final Buster deploys the exact checked manifest and image.',
    },
    image: {
      role: 'release_candidate',
      reference: releaseCandidateImage,
      digest_authority: 'module-buster-build-evidence',
    },
    manifests: [
      {
        path: `${projectSrc}/k8s/deployment.yaml`,
        image_field: 'Deployment/spec/template/spec/containers[name=nginx]/image',
        mutation_authority: 'none-checked-manifest-is-immutable',
      },
    ],
    runtime_config_ref: REAL_E2E_CONTRACT_PATHS.runtimeConfig,
  };
}

function buildRuntimeConfigContract({ projectName, moduleIds = [REAL_E2E_MODULE_ID] }) {
  const modules = canonicalModuleIds(moduleIds);
  const staticSurfaces = [
    {
      producer_module: '02-nginx',
      consumer_module: '04-nginx',
      producer_contract: '.swarm/contracts/module-outputs/02-content.json',
      provided_surface: 'src/content/branch-a.html',
      source_path: 'src/content/branch-a.html',
      served_as: '/content/branch-a.html',
      expected_marker: 'REAL_E2E_BRANCH_A_CONTENT',
    },
    {
      producer_module: '03-nginx',
      consumer_module: '04-nginx',
      producer_contract: '.swarm/contracts/module-outputs/03-assets.json',
      provided_surface: 'src/assets/branch-b.css',
      source_path: 'src/assets/branch-b.css',
      served_as: '/assets/branch-b.css',
      expected_marker: '#real-e2e-content-branch',
    },
  ].filter((surface) => modules.includes(surface.producer_module) && modules.includes(surface.consumer_module));
  return {
    schema_version: 'real_e2e_runtime_config_contract.v2',
    artifact_type: 'runtime_config_contract',
    project: projectName,
    module_ids: modules,
    authority: {
      owner: 'application-module',
      validator: 'buster-k8s-suite',
      reporter: 'nova-discord-summary',
      rule: 'Application runtime inputs are declared here; preview infrastructure is declared only on final Buster preview config.',
    },
    env: [],
    config_maps: [],
    secrets: [],
    credentials: {
      requires_login: false,
      state: 'not_configured',
    },
    static_serving: {
      web_root: 'src',
      sentinel_text: 'REAL_E2E_NGINX_OK',
      surfaces: staticSurfaces,
    },
    allowed_app_resources: ['Deployment', 'Service', 'Secret'],
  };
}

function buildModuleReviewContract({ projectName, moduleIds = [REAL_E2E_MODULE_ID] }) {
  const modules = canonicalModuleIds(moduleIds);
  const sourcePaths = modules.flatMap((moduleId) => moduleSurface(moduleId).source_paths.map((sourcePath) => `Projects/${projectName}/src/${sourcePath}`));
  const outputContracts = modules.map((moduleId) => moduleSurface(moduleId).output_contract);
  return {
    schema_version: 'real_e2e_module_review_contract.v2',
    artifact_type: 'module_review_contract',
    project: projectName,
    module_ids: modules,
    authority: {
      owner: 'module-review',
      reviewer: 'echo-codex',
      rule: 'Echo module review is keyed by module_ids and reviews only the declared module surfaces.',
    },
    surfaces: {
      source_paths: sourcePaths,
      instruction_paths: modules.flatMap((moduleId) => [
        `.swarm/modules/${moduleId}/FORGE.md`,
        `.swarm/modules/${moduleId}/BUSTER.md`,
      ]),
      contract_refs: [
        REAL_E2E_CONTRACT_REFS.deployableArtifact,
        REAL_E2E_CONTRACT_REFS.runtimeConfig,
        REAL_E2E_CONTRACT_REFS.previewInfrastructure,
        ...outputContracts,
      ],
      evidence_refs: [
        ...modules.map((moduleId) => `.swarm/logs/modules/${moduleId}`),
      ],
    },
  };
}

function buildPreviewInfrastructureContract({ projectName }) {
  return {
    schema_version: 'real_e2e_preview_infrastructure_contract.v2',
    artifact_type: 'preview_infrastructure_contract',
    project: projectName,
    gate_id: 'final-buster',
    authority: {
      owner: 'final-buster',
      executor: 'buster-provider-plan',
      rule: 'Preview infrastructure is run-scoped gate-owned orchestration and must not be modeled as reusable module source.',
    },
    app_owned_resources: ['Deployment', 'Service', 'Secret'],
    gate_owned_resources: ['BusterNamespaceLease', 'tailscale-ingress-exposure', 'preview-url', 'cleanup-policy'],
    source_config_ref: 'pipeline.gates.final-buster.fixtures.tailscale-exposure',
    static_module_preview_resources: 'forbidden',
  };
}

function buildRealE2EContractCatalog({ projectName, projectSrc, releaseCandidateImage, moduleIds = [REAL_E2E_MODULE_ID] }) {
  return {
    deployable_artifact: buildDeployableArtifactContract({ projectName, projectSrc, releaseCandidateImage, moduleIds }),
    runtime_config: buildRuntimeConfigContract({ projectName, moduleIds }),
    module_review: buildModuleReviewContract({ projectName, moduleIds }),
    preview_infrastructure: buildPreviewInfrastructureContract({ projectName }),
    module_outputs: buildModuleOutputContracts(moduleIds),
  };
}

function safeRunIdSegment(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function safeNamespaceProjectSegment(projectName) {
  const normalized = String(projectName || 'project')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
  const segment = normalized || 'project';
  const maxProjectLength = 51;
  return segment.slice(0, maxProjectLength).replace(/-+$/g, '') || 'project';
}

function isSafeE2ENamespaceName(workspace, namespaceName) {
  if (!/^test-/.test(namespaceName || '')) return false;
  const projectSegment = safeNamespaceProjectSegment(workspace.projectName);
  if (namespaceName === `test-${projectSegment}` || namespaceName.startsWith(`test-${projectSegment}-`)) return true;
  return REAL_E2E_SEED_MODULE_IDS
    .map((moduleId) => `test-${moduleId}-`)
    .concat('test-final-buster-')
    .some((prefix) => namespaceName.startsWith(prefix));
}

export function validateRealE2EModel(model) {
  const normalized = String(model || '').trim();
  if (normalized !== DEFAULT_REAL_E2E_MODEL) {
    throw new Error(`REAL_E2E_MODEL_MUST_BE_SPARK:${normalized}`);
  }
  return DEFAULT_REAL_E2E_MODEL;
}

function e2eModel() {
  return validateRealE2EModel(process.env.REAL_E2E_MODEL || DEFAULT_REAL_E2E_MODEL);
}

function e2eThinking() {
  return process.env.REAL_E2E_THINKING || DEFAULT_REAL_E2E_THINKING;
}

function e2ePositiveNumberEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return value;
}

function e2eModuleTimeoutMinutes() {
  return e2ePositiveNumberEnv('REAL_E2E_MODULE_TIMEOUT_MINUTES', DEFAULT_REAL_E2E_MODULE_TIMEOUT_MINUTES);
}

function e2eAgentJudgmentModuleTimeoutMinutes() {
  return e2ePositiveNumberEnv(
    'REAL_E2E_AGENT_JUDGMENT_MODULE_TIMEOUT_MINUTES',
    DEFAULT_REAL_E2E_AGENT_JUDGMENT_MODULE_TIMEOUT_MINUTES,
  );
}

function e2eBusterGateTimeoutMinutes() {
  return e2ePositiveNumberEnv('REAL_E2E_BUSTER_GATE_TIMEOUT_MINUTES', e2eModuleTimeoutMinutes());
}

function explicitRealE2ETerminalExtrasEnabled() {
  const raw = process.env.REAL_E2E_TERMINAL_EXTRAS;
  if (raw == null || raw === '') return null;
  return !['0', 'false', 'no', 'off'].includes(String(raw).trim().toLowerCase());
}

function realE2ETerminalExtrasEnabled(boundary = realE2EExecutionBoundary()) {
  if (boundary !== 'full') return false;
  return explicitRealE2ETerminalExtrasEnabled() ?? true;
}

const REAL_E2E_EXECUTION_BOUNDARIES = Object.freeze(new Set(['full', 'modules', 'module-review', 'final-buster', 'final-review']));

function realE2EExecutionBoundary() {
  const boundary = String(process.env.REAL_E2E_EXECUTION_BOUNDARY || 'full').trim() || 'full';
  if (!REAL_E2E_EXECUTION_BOUNDARIES.has(boundary)) {
    throw new Error(`REAL_E2E_EXECUTION_BOUNDARY must be one of: ${[...REAL_E2E_EXECUTION_BOUNDARIES].join(', ')}`);
  }
  return boundary;
}

function executionOrderForBoundary(moduleIds, boundary = 'full') {
  const modules = [...canonicalModuleIds(moduleIds)];
  if (boundary === 'modules') return modules;
  if (boundary === 'module-review') return [...modules, 'gate:module-review'];
  if (boundary === 'final-buster') return [...modules, 'gate:final-buster'];
  if (boundary === 'final-review') {
    return [
      ...modules,
      'gate:module-review',
      'gate:operator-approval',
      'gate:final-buster',
      'gate:final-review',
    ];
  }
  return [
    ...modules,
    'gate:module-review',
    'gate:operator-approval',
    'gate:final-buster',
    'gate:final-review',
  ];
}

function releaseCandidateModuleId(moduleIds) {
  const modules = canonicalModuleIds(moduleIds);
  return modules[modules.length - 1] || REAL_E2E_MODULE_ID;
}

function architectureIntentForModules(moduleIds) {
  const modules = canonicalModuleIds(moduleIds);
  const fullModuleGraph = modules.includes('04-nginx');
  return {
    kind: 'intentional_minimal_pipeline_fixture',
    purpose: 'Exercise production pipeline orchestration with the smallest inspectable nginx workload.',
    module_graph: fullModuleGraph
      ? 'Four modules are intentional: 01 provides a shared runtime foundation, 02 and 03 exercise parallel isolated branches, and 04 exercises join/release assembly.'
      : `Scoped scenario topology is intentional: ${modules.join(', ')} is the complete module set for this run.`,
    release_boundary: fullModuleGraph
      ? 'Module 04 intentionally owns both static app composition and deployment packaging for this minimal fixture; final-buster owns run-scoped preview infrastructure.'
      : 'The scoped module owns its declared static serving surface for this fixture; final-buster owns run-scoped preview infrastructure when the execution boundary reaches it.',
    non_goal: 'This fixture is not modeling an independently evolving product domain; architecture review should validate explicit handoff contracts and orchestration boundaries.',
  };
}

function progressNotesForModules(moduleIds) {
  const modules = canonicalModuleIds(moduleIds);
  const fullModuleGraph = modules.includes('04-nginx');
  return [
    'This progress file is generated by tests/verification/e2e/run-real-pipeline-e2e.mjs.',
    'All listed stages use production pipeline contracts; missing infra must fail honestly.',
    fullModuleGraph
      ? 'The small four-module graph is intentional test topology: foundation, two parallel branches, and one join/release module.'
      : `The scoped module graph is intentional test topology for this scenario: ${modules.join(', ')}.`,
  ];
}

function applyScenarioModuleScope(progress, scenarioId) {
  if (!progress || typeof progress !== 'object') return progress;
  const scopedModuleIds = realE2EScenarioModuleIds(scenarioId);
  const keep = new Set(scopedModuleIds);
  for (const moduleId of Object.keys(progress.modules || {})) {
    if (!keep.has(moduleId)) delete progress.modules[moduleId];
  }
  const projectName = progress.project || 'real-pipeline-e2e';
  const projectSrc = `Projects/${projectName}/src`;
  const releaseCandidateImage = progress.contracts?.deployable_artifact?.image?.reference
    || realE2EDeploymentImage();
  progress.contracts = buildRealE2EContractCatalog({
    projectName,
    projectSrc,
    releaseCandidateImage,
    moduleIds: scopedModuleIds,
  });
  progress.architecture_intent = architectureIntentForModules(scopedModuleIds);
  progress.notes = progressNotesForModules(scopedModuleIds);
  const moduleReview = progress.gates?.['module-review'];
  if (moduleReview?.contract && typeof moduleReview.contract === 'object') {
    moduleReview.contract = {
      ...moduleReview.contract,
      module_ids: [...scopedModuleIds],
      reviewed_contract_refs: [
        REAL_E2E_CONTRACT_REFS.deployableArtifact,
        REAL_E2E_CONTRACT_REFS.runtimeConfig,
        REAL_E2E_CONTRACT_REFS.previewInfrastructure,
        ...scopedModuleIds.map((moduleId) => moduleSurface(moduleId).output_contract),
      ],
    };
  }
  progress.real_e2e = {
    ...(progress.real_e2e || {}),
    module_scope: [...scopedModuleIds],
  };
  const boundary = progress.real_e2e.execution_boundary || realE2EExecutionBoundary();
  progress.execution_order = executionOrderForBoundary(scopedModuleIds, boundary);
  return progress;
}

export function applyRealE2EExecutionBoundary(progress) {
  const boundary = realE2EExecutionBoundary();
  const moduleIds = Object.keys(progress?.modules || {});
  progress.real_e2e = {
    ...(progress.real_e2e || {}),
    execution_boundary: boundary,
  };
  if (boundary !== 'full') progress.execution_order = executionOrderForBoundary(moduleIds, boundary);
  return progress;
}

export function normalizeRealE2ERuntimeDefaults(progress, { scenarioId = null } = {}) {
  const model = e2eModel();
  const thinking = e2eThinking();
  const moduleTimeoutMinutes = e2eModuleTimeoutMinutes();
  const agentJudgmentModuleTimeoutMinutes = e2eAgentJudgmentModuleTimeoutMinutes();
  const busterGateTimeoutMinutes = e2eBusterGateTimeoutMinutes();
  const boundary = realE2EExecutionBoundary();

  if (!progress || typeof progress !== 'object') return progress;
  if (scenarioId) applyScenarioModuleScope(progress, scenarioId);

  progress.defaults = {
    ...(progress.defaults || {}),
    models: {
      ...(progress.defaults?.models || {}),
      forge: model,
      buster: model,
      echo: model,
      arch_validator: model,
    },
    reviewers: Array.isArray(progress.defaults?.reviewers)
      ? progress.defaults.reviewers.map((reviewer) => ({ ...reviewer, model }))
      : progress.defaults?.reviewers,
    thinking: {
      ...(progress.defaults?.thinking || {}),
      forge: thinking,
      buster: thinking,
      echo: thinking,
      arch_validator: thinking,
    },
  };

  for (const [moduleId, module] of Object.entries(progress.modules || {})) {
    if (!module || typeof module !== 'object') continue;
    const computedJudgment = moduleBusterAgentJudgment(moduleId);
    const requiresAgentJudgment = typeof module.agent_judgment?.required === 'boolean'
      ? module.agent_judgment.required
      : computedJudgment.required;
    module.timeout_minutes = requiresAgentJudgment
      ? agentJudgmentModuleTimeoutMinutes
      : moduleTimeoutMinutes;
    module.thinking_level = thinking;
  }

  if (progress.arch_validation && typeof progress.arch_validation === 'object') {
    const architectureValidationEnabled = boundary === 'full' || scenarioId === 'architecture-validator-block';
    progress.arch_validation.enabled = architectureValidationEnabled;
    progress.arch_validation.agent_enabled = architectureValidationEnabled;
    progress.arch_validation.model = model;
    progress.arch_validation.thinking_level = thinking;
    progress.arch_validation.timeout_minutes = 15;
  }

  delete progress.pipeline_review;

  const moduleReview = progress.gates?.['module-review'];
  if (moduleReview && typeof moduleReview === 'object') {
    moduleReview.forge_model = model;
    moduleReview.forge_thinking_level = thinking;
    moduleReview.timeout_minutes = 15;
  }

  const finalBuster = progress.gates?.['final-buster'];
  if (finalBuster && typeof finalBuster === 'object') {
    finalBuster.model = model;
    finalBuster.forge_model = model;
    finalBuster.timeout_minutes = busterGateTimeoutMinutes;
  }

  const finalReview = progress.gates?.['final-review'];
  if (finalReview && typeof finalReview === 'object') {
    finalReview.forge_model = model;
    finalReview.forge_thinking_level = thinking;
    finalReview.timeout_minutes = 20;
  }

  return progress;
}

export function normalizeRealE2ERunConfigDefaults(config) {
  const model = e2eModel();
  const thinking = e2eThinking();
  const boundary = realE2EExecutionBoundary();
  const terminalExtrasEnabled = realE2ETerminalExtrasEnabled(boundary);

  if (!config || typeof config !== 'object') return config;

  config.fallback_model = model;
  config.case_study = {
    ...(config.case_study || {}),
    enabled: terminalExtrasEnabled,
    model,
    thinking_level: thinking,
    agent_id: 'codex',
    output_file: '.swarm/artifacts/v2/reports/case-study.md',
    timeout_minutes: 30,
  };
  config.pipeline_review = {
    ...(config.pipeline_review || {}),
    enabled: terminalExtrasEnabled,
    model,
    thinking_level: thinking,
    agent_id: 'codex',
    instructions_file: 'pipeline-review/PIPELINE-REVIEW-INSTRUCTIONS.md',
    output_file: '.swarm/artifacts/v2/reports/pipeline-review.md',
    json_output_file: '.swarm/artifacts/v2/reports/pipeline-review.json',
    timeout_minutes: 10,
    agent_max_attempts: 2,
  };
  return config;
}

function withDiscordWebhookWait(url) {
  if (!url || typeof url !== 'string') return url || '';
  const parsed = new URL(url);
  parsed.searchParams.set('wait', 'true');
  return parsed.toString();
}

function projectNameForRun(runId) {
  return `real-pipeline-e2e-${safeRunIdSegment(runId)}`;
}

export function architectureBranchNameForProject(projectName) {
  return `${projectName}/architecture`;
}

export function isSafeE2ERemoteBranchName(branchName) {
  return /^verification\/e2e\/[a-z0-9-]+-[a-z0-9-]+$/.test(branchName || '')
    || /^real-pipeline-e2e-[a-z0-9-]+\/architecture$/.test(branchName || '');
}

export function isSafeE2ERunBranchName(branchName) {
  return /^verification\/e2e\/[a-z0-9-]+-[a-z0-9-]+$/.test(branchName || '');
}

export function assertSafeArchitectureSeedBranches({ worktreeBranch, expectedWorktreeBranch, architectureBranch }) {
  if (!isSafeE2ERunBranchName(expectedWorktreeBranch)) {
    throw new Error(`Unsafe expected E2E worktree branch for architecture seed: ${expectedWorktreeBranch || '<missing>'}`);
  }
  if (worktreeBranch !== expectedWorktreeBranch) {
    throw new Error(
      `Refusing to seed architecture branch from unexpected worktree branch: expected ${expectedWorktreeBranch}, got ${worktreeBranch || '<missing>'}`,
    );
  }
  if (!isSafeE2ERemoteBranchName(architectureBranch) || /^verification\/e2e\//.test(architectureBranch || '')) {
    throw new Error(`Unsafe architecture branch for E2E seed: ${architectureBranch || '<missing>'}`);
  }
}

export function assertSafeRunBranchPublish({ branchName }) {
  if (!isSafeE2ERunBranchName(branchName)) {
    throw new Error(`Unsafe E2E run branch publish target: ${branchName || '<missing>'}`);
  }
}

function validateRealE2EContractAuthority(progress) {
  const missing = [];
  for (const [key, ref] of Object.entries(REAL_E2E_CONTRACT_REFS)) {
    const [, contractKey] = ref.split('.');
    if (!progress?.contracts?.[contractKey]) missing.push(`${key}:${ref}`);
  }
  const moduleIds = Object.keys(progress?.modules || {});
  for (const moduleId of moduleIds) {
    const moduleContracts = progress?.modules?.[moduleId]?.contracts || {};
    if (moduleContracts.deployable_artifact_ref !== REAL_E2E_CONTRACT_REFS.deployableArtifact) missing.push(`modules.${moduleId}.contracts.deployable_artifact_ref`);
    if (moduleContracts.runtime_config_ref !== REAL_E2E_CONTRACT_REFS.runtimeConfig) missing.push(`modules.${moduleId}.contracts.runtime_config_ref`);
    if (moduleContracts.module_review_ref !== REAL_E2E_CONTRACT_REFS.moduleReview) missing.push(`modules.${moduleId}.contracts.module_review_ref`);
    if (moduleContracts.module_output_ref !== moduleSurface(moduleId).output_contract) missing.push(`modules.${moduleId}.contracts.module_output_ref`);
    if (moduleContracts.deployable_artifact) missing.push(`modules.${moduleId}.contracts.deployable_artifact`);
    if (moduleContracts.runtime_config) missing.push(`modules.${moduleId}.contracts.runtime_config`);
    if (moduleContracts.module_review) missing.push(`modules.${moduleId}.contracts.module_review`);
    if (moduleContracts.module_output) missing.push(`modules.${moduleId}.contracts.module_output`);
  }
  const moduleReviewContract = progress?.gates?.['module-review']?.contract || {};
  if (moduleReviewContract.module_review_ref !== REAL_E2E_CONTRACT_REFS.moduleReview) missing.push('gates.module-review.contract.module_review_ref');
  if (JSON.stringify(moduleReviewContract.module_ids || []) !== JSON.stringify(moduleIds)) missing.push('gates.module-review.contract.module_ids');
  const finalBusterContract = progress?.gates?.['final-buster']?.contract || {};
  if (finalBusterContract.deployable_artifact_ref !== REAL_E2E_CONTRACT_REFS.deployableArtifact) missing.push('gates.final-buster.contract.deployable_artifact_ref');
  if (finalBusterContract.runtime_config_ref !== REAL_E2E_CONTRACT_REFS.runtimeConfig) missing.push('gates.final-buster.contract.runtime_config_ref');
  if (finalBusterContract.preview_infrastructure_ref !== REAL_E2E_CONTRACT_REFS.previewInfrastructure) missing.push('gates.final-buster.contract.preview_infrastructure_ref');
  const embeddedCopies = [
    moduleReviewContract.module_review,
    finalBusterContract.deployable_artifact,
    finalBusterContract.runtime_config,
    finalBusterContract.preview_infrastructure,
  ].filter(Boolean);
  if (missing.length > 0) throw new Error(`real E2E canonical contract refs missing: ${missing.join(', ')}`);
  if (embeddedCopies.length > 0) throw new Error('real E2E progress must reference canonical contracts, not embed duplicate contract objects');
}

function moduleDependencies(moduleId, moduleIds) {
  if (moduleIds.length < 4) return moduleId === REAL_E2E_MODULE_ID ? [] : [REAL_E2E_MODULE_ID];
  if (moduleId === '02-nginx' || moduleId === '03-nginx') return ['01-nginx'];
  if (moduleId === '04-nginx') return ['01-nginx', '02-nginx', '03-nginx'];
  return [];
}

function moduleTitle(moduleId) {
  if (moduleId === '01-nginx') return 'Real nginx fixture foundation module';
  if (moduleId === '02-nginx') return 'Real nginx fixture parallel branch A';
  if (moduleId === '03-nginx') return 'Real nginx fixture parallel branch B';
  if (moduleId === '04-nginx') return 'Real nginx fixture release assembly module';
  return `Real nginx fixture module ${moduleId}`;
}

function moduleServeConfig({ moduleId, projectSrc, releaseCandidateImage }) {
  const base = {
    type: 'server',
    project_dir: projectSrc,
    start_cmd: 'nginx -g "daemon off;"',
    image: releaseCandidateImage,
    port: 8080,
    dockerfile: `${projectSrc}/Dockerfile`,
    build_context: projectSrc,
  };
  if (moduleId !== '01-nginx') return base;
  return {
    ...base,
    build_timeout: 300,
  };
}

function buildModuleProgress({ moduleId, moduleIds, projectSrc, releaseCandidateImage, moduleTimeoutMinutes, thinking }) {
  const surface = moduleSurface(moduleId);
  const agentJudgment = moduleBusterAgentJudgment(moduleId);
  const timeoutMinutes = agentJudgment.required
    ? e2eAgentJudgmentModuleTimeoutMinutes()
    : moduleTimeoutMinutes;
  return {
    title: moduleTitle(moduleId),
    dir: moduleId,
    depends_on: moduleDependencies(moduleId, moduleIds),
    role: surface.role,
    owned_paths: [...surface.source_paths],
    module_output_contract: surface.output_contract,
    consumes_module_outputs: [...(surface.consumes || [])],
    stages: ['forge', 'buster'],
    timeout_minutes: timeoutMinutes,
    max_fails: REAL_E2E_MODULE_MAX_FAILS,
    auto_retry_threshold: REAL_E2E_MODULE_AUTO_RETRY_THRESHOLD,
    thinking_level: thinking,
    test_suites: [],
    capabilities: ['image_build', 'kubernetes'],
    agent_judgment: agentJudgment,
    contracts: {
      deployable_artifact_ref: REAL_E2E_CONTRACT_REFS.deployableArtifact,
      runtime_config_ref: REAL_E2E_CONTRACT_REFS.runtimeConfig,
      module_review_ref: REAL_E2E_CONTRACT_REFS.moduleReview,
      module_output_ref: surface.output_contract,
    },
    test_config: {
      serve: moduleServeConfig({ moduleId, projectSrc, releaseCandidateImage }),
    },
  };
}

export function buildProgress({ projectName, runId = '', moduleIds = REAL_E2E_SEED_MODULE_IDS } = {}) {
  const model = e2eModel();
  const thinking = e2eThinking();
  const moduleTimeoutMinutes = e2eModuleTimeoutMinutes();
  const busterGateTimeoutMinutes = e2eBusterGateTimeoutMinutes();
  const terminalExtrasEnabled = realE2ETerminalExtrasEnabled();
  const executionBoundary = realE2EExecutionBoundary();
  const projectSrc = `Projects/${projectName}/src`;
  const releaseCandidateImage = realE2EDeploymentImage();
  const progressModuleIds = canonicalModuleIds(moduleIds);
  const contracts = buildRealE2EContractCatalog({ projectName, projectSrc, releaseCandidateImage, moduleIds: progressModuleIds });
  const modules = Object.fromEntries(progressModuleIds.map((moduleId) => [
    moduleId,
    buildModuleProgress({
      moduleId,
      moduleIds: progressModuleIds,
      projectSrc,
      releaseCandidateImage,
      moduleTimeoutMinutes,
      thinking,
    }),
  ]));
  const progress = {
    project: projectName,
    version: 1,
    description: 'Canonical real production-like pipeline E2E verification run.',
    architecture_intent: architectureIntentForModules(progressModuleIds),
    notes: progressNotesForModules(progressModuleIds),
    defaults: {
      models: {
        forge: model,
        buster: model,
        echo: model,
        arch_validator: model,
      },
      reviewers: [
        {
          label: 'echo-codex',
          model,
          dispatch: 'subagent',
          agent_id: 'codex',
        },
      ],
      thinking: {
        forge: thinking,
        buster: thinking,
        echo: thinking,
        arch_validator: thinking,
      },
    },
    arch_validation: {
      enabled: true,
      agent_enabled: true,
      model,
      thinking_level: thinking,
      timeout_minutes: 15,
      agent_max_attempts: 2,
      approval_gate: {
        timeout_minutes: 30,
      },
    },
    telemetry: {
      enabled: true,
    },
    payload: {
      rate_limit: {
        max_pauses: 1,
        initial_cooldown_s: 10,
        max_cooldown_s: 30,
      },
    },
    real_e2e: {
      execution_boundary: executionBoundary,
      module_scope: [...progressModuleIds],
      kubernetes_fixture: {
        image: {
          reference: releaseCandidateImage,
          digest: releaseCandidateImage.match(/@(sha256:[a-f0-9]{64})$/u)?.[1],
        },
        namespace_prefix: 'test',
        retention_mode: 'delete',
        retention_seconds: 1800,
        readiness_timeout_seconds: 180,
      },
      container_build: {
        build_context: projectSrc,
        dockerfile: 'Dockerfile',
      },
    },
    execution_order: executionOrderForBoundary(progressModuleIds, executionBoundary),
    contracts,
    modules,
    gates: {
      'module-review': {
        type: 'review',
        title: 'Module review gate',
        review_name: 'REAL-E2E-MODULE-REVIEW',
        on_fail: 'stop',
        instructions_file: 'echo-review/MODULE-REVIEW-INSTRUCTIONS.md',
        output_file: 'logs/echo-review/MODULE-REVIEW.json',
        review_output_dir: 'logs/echo-review',
        primary_reviewer: 'echo-codex',
        forge_model: model,
        forge_thinking_level: thinking,
        timeout_minutes: 15,
        auto_retry_threshold: 1,
        max_fix_cycles: 1,
        lint_tier: 'full',
        contract: {
          module_review_ref: REAL_E2E_CONTRACT_REFS.moduleReview,
          module_ids: progressModuleIds,
          reviewed_contract_refs: [
            REAL_E2E_CONTRACT_REFS.deployableArtifact,
            REAL_E2E_CONTRACT_REFS.runtimeConfig,
            REAL_E2E_CONTRACT_REFS.previewInfrastructure,
          ],
        },
      },
      'operator-approval': {
        type: 'approval',
        title: 'Real E2E operator approval gate',
        prompt: 'Approve the real E2E pipeline continuing into final deployment validation.',
        on_timeout: 'block',
        timeout_minutes: 5,
      },
      'final-buster': {
        type: 'buster',
        title: 'Final Buster validation with deployment and security evidence',
        contract: {
          deployable_artifact_ref: REAL_E2E_CONTRACT_REFS.deployableArtifact,
          runtime_config_ref: REAL_E2E_CONTRACT_REFS.runtimeConfig,
          preview_infrastructure_ref: REAL_E2E_CONTRACT_REFS.previewInfrastructure,
        },
        on_fail: 'fix_and_retest',
        instructions_file: 'buster-test/FINAL-BUSTER.md',
        output_file: 'buster-test/FINAL-BUSTER-RESULT.json',
        model,
        forge_model: model,
        timeout_minutes: busterGateTimeoutMinutes,
        max_fix_cycles: 0,
      },
      'final-review': {
        type: 'review',
        title: 'Final Echo review',
        review_name: 'REAL-E2E-FINAL-REVIEW',
        on_fail: 'stop',
        instructions_file: 'echo-review/FINAL-REVIEW-INSTRUCTIONS.md',
        output_file: 'logs/echo-review/FINAL-REVIEW.json',
        review_output_dir: 'logs/echo-review',
        primary_reviewer: 'echo-codex',
        forge_model: model,
        forge_thinking_level: thinking,
        timeout_minutes: 20,
        max_fix_cycles: 1,
        lint_tier: 'full',
      },
    },
  };
  validateRealE2EContractAuthority(progress);
  return progress;
}

function instructionFiles(progress) {
  const contracts = progress?.contracts || {};
  const projectSrc = `Projects/${progress.project}/src`;
  const moduleIds = Object.keys(progress?.modules || {});
  const moduleList = moduleIds.map((moduleId) => `\`${moduleId}\``).join(', ');
  const fullModuleGraph = moduleIds.includes('04-nginx');
  const moduleOutputBoundary = fullModuleGraph
    ? '- `.swarm/contracts/module-outputs/*.json` are per-module output boundaries. Module 01 owns the shared nginx runtime config, modules 02 and 03 publish named branch surfaces, and module 04 consumes those named outputs to own the Dockerfile packaging plus release assembly composition.'
    : '- `.swarm/contracts/module-outputs/*.json` are per-module output boundaries for the scoped module set declared in `.swarm/contracts/module-review.json`.'
  const packagingBoundary = fullModuleGraph
    ? '- Module 04 owns copying the assembled `src/` tree into the nginx web root; module 01 owns only the reusable nginx runtime config consumed by that packaging surface.'
    : '- The scoped module set is complete for this scenario; no undeclared branch, join, or release-assembly module is expected.'
  const deployableHandoff = fullModuleGraph
    ? 'release assembly module Buster'
    : 'module Buster';
  const deploymentInput = { deployment: { from: 'kubernetes-deployment', output: 'deployment',
    schemaId: 'kubeclaw.kubernetes-deployment-fixture@1' } };
  const publicEndpointInput = { endpoint: { from: 'tailscale-exposure', output: 'exposure',
    schemaId: 'kubeclaw.public-endpoint-fixture@1' } };
  const publicHttpOverride = progress.real_e2e?.public_http_url_override;
  const publicHttpInput = publicHttpOverride ? undefined : publicEndpointInput;
  const publicExpectedText = progress.real_e2e?.public_http_expected_text ?? 'REAL_E2E_NGINX_OK';
  const fixtureConfig = progress.real_e2e?.kubernetes_fixture ?? {};
  const sizeBudgetTests = (scopeId) => {
    const archive = `.swarm/size-budget-${safeRunIdSegment(scopeId)}.tar`;
    return {
      'size-budget-artifact': { uses: 'kubeclaw.direct-command@1', mode: 'blocking', retries: 0,
        concurrencyGroup: 'size-budget', config: { executable: 'tar',
          args: ['--format=ustar', '--transform=s,^\\./,,;s,^\\.$,root,', '-cf', archive,
            '-C', `${projectSrc}/src`, '.'], workingDirectory: '.', resultMode: 'exit-code',
          artifacts: [{ id: 'build-output', path: archive,
            mediaType: 'application/vnd.kubeclaw.build-output.tar' }] } },
      'size-budget': { uses: 'kubeclaw.size-budget@1', mode: 'blocking', retries: 0,
        concurrencyGroup: 'size-budget', config: { maximumTotalBytes: 10 * 1024 * 1024,
          maximumFileCount: 10_000, largestFiles: 10 }, inputs: {
          'build-output': { from: 'size-budget-artifact', output: 'artifact-1' },
        } },
    };
  };
  const unitPipeline = {
    project: progress.project,
    lint: {
      uses: 'kubeclaw.lint.full',
      policyProject: 'workspace',
      rawManifests: [`${projectSrc}/k8s/deployment.yaml`],
      helmCharts: [],
    },
    modules: Object.fromEntries(moduleIds.map((moduleId) => [moduleId, {
      suites: { unit: { uses: 'kubeclaw.unit-suite@1', add: {
        command: { uses: 'kubeclaw.direct-command@1', mode: 'blocking', retries: 1,
          concurrencyGroup: 'unit', config: { executable: 'npm', args: ['run', `verify:${moduleId}`],
            workingDirectory: '.', resultMode: 'exit-code' } },
      } } },
      tests: {
        ...sizeBudgetTests(moduleId),
        health: { uses: 'kubeclaw.http@1', mode: 'blocking', retries: 2,
          needs: ['size-budget'], concurrencyGroup: 'http', config: { url: 'http://registry-local.kubeclaw.svc.cluster.local:5001',
            path: '/v2/', expectedStatuses: [200], requestTimeoutMs: 10000 } },
      },
      concurrencyLimits: { unit: 2, 'size-budget': 1, http: 2 },
    }])),
    gates: {
      'final-buster': {
        suites: { unit: { uses: 'kubeclaw.unit-suite@1', add: {
          command: { uses: 'kubeclaw.direct-command@1', mode: 'blocking', retries: 1,
            concurrencyGroup: 'unit', config: { executable: 'npm',
              args: ['run', `verify:${releaseCandidateModuleId(moduleIds)}`], workingDirectory: '.',
              resultMode: 'exit-code' } },
        } } },
        tests: {
          ...sizeBudgetTests('final-buster'),
          'container-build': { uses: 'kubeclaw.container-build@1', mode: 'blocking', retries: 1,
            needs: ['size-budget'], concurrencyGroup: 'container-build', config: {
              buildContext: projectSrc,
              definition: { type: 'dockerfile', dockerfile: `${projectSrc}/Dockerfile` },
              outputName: 'real-pipeline-e2e', platform: 'linux/amd64',
            } },
          'checked-manifest': { uses: 'kubeclaw.direct-command@1', mode: 'blocking',
            concurrencyGroup: 'manifest', config: { executable: 'cp',
              args: [`${projectSrc}/k8s/deployment.yaml`, `${projectSrc}/.swarm/checked-final-buster.yaml`],
              workingDirectory: '.', resultMode: 'exit-code', artifacts: [{ id: 'checked-manifest',
                path: `${projectSrc}/.swarm/checked-final-buster.yaml`,
                mediaType: 'application/vnd.kubeclaw.checked-kubernetes-yaml' }] } },
          health: { uses: 'kubeclaw.http@1', mode: 'blocking', retries: 2,
            needs: ['size-budget'], concurrencyGroup: 'http', config: { path: '/', expectedStatuses: [200],
              expectedText: 'REAL_E2E_NGINX_OK', requestTimeoutMs: 10000 }, inputs: deploymentInput },
          'api-flow': { uses: 'kubeclaw.api-flow@1', mode: 'blocking', retries: 0,
            needs: ['kubernetes-deployment'], concurrencyGroup: 'api-flow',
            config: { flowFile: '.swarm/api-flow-success.json', requestTimeoutMs: 10000 },
            inputs: deploymentInput },
          openapi: { uses: 'kubeclaw.openapi@1', mode: 'blocking', retries: 0,
            needs: ['kubernetes-deployment'], concurrencyGroup: 'openapi',
            config: { specFile: '.swarm/openapi-success.json', operations: [
              { operationId: 'getHome', expectedStatuses: [200] },
            ], requestTimeoutMs: 10000 }, inputs: deploymentInput },
          axe: { uses: 'kubeclaw.axe@1', mode: 'blocking', retries: 0,
            needs: ['kubernetes-deployment'], concurrencyGroup: 'browser-axe',
            config: { routes: ['/'], profiles: ['desktop', 'mobile'], tags: ['wcag2a', 'wcag2aa'] },
            inputs: deploymentInput },
          performance: { uses: 'kubeclaw.lighthouse@1', mode: 'blocking', retries: 0,
            needs: ['kubernetes-deployment'], concurrencyGroup: 'browser-lighthouse',
            config: { purpose: 'performance', routes: ['/'], settingsFile: '.swarm/lighthouse-settings.json',
              profile: 'desktop', budget: 'fixture', runs: 3, timeoutMs: 120000 },
            inputs: deploymentInput },
          visual: { uses: 'kubeclaw.visual@1', mode: 'blocking', retries: 0,
            needs: ['kubernetes-deployment'], concurrencyGroup: 'browser-visual',
            config: { manifestFile: '.swarm/visual/baselines.json', profileFile: '.swarm/browser-profiles.json',
              targets: ['home-desktop'], comparisonProfile: 'strict-v1', timeoutMs: 60000 }, inputs: deploymentInput },
          playwright: { uses: 'kubeclaw.playwright@1', mode: 'blocking', retries: 0,
            needs: ['kubernetes-deployment'], concurrencyGroup: 'browser-playwright',
            config: { projectDirectory: '.', configFile: '.swarm/playwright.config.ts', workers: 2,
              timeoutMs: 120000 }, inputs: deploymentInput },
          'security-headers': { uses: 'kubeclaw.security-headers@1', mode: 'blocking', retries: 0,
            needs: ['kubernetes-deployment'], concurrencyGroup: 'security-headers',
            config: { profile: 'api-http-v1', paths: ['/'], policy: { profile: 'strict-v1' } },
            inputs: deploymentInput },
          'dependency-security': { uses: 'kubeclaw.dependency-scan-trivy@1', mode: 'blocking', retries: 0,
            concurrencyGroup: 'security-dependency', config: { projectDirectory: projectSrc,
              policy: { profile: 'strict-v1' } } },
          'image-security': { uses: 'kubeclaw.image-scan-trivy@1', mode: 'blocking', retries: 0,
            needs: ['container-build'], concurrencyGroup: 'security-image',
            config: { policy: { profile: 'strict-v1' } }, inputs: {
              image: { from: 'container-build', output: 'image', schemaId: 'kubeclaw.container-image@1' } } },
          'kubernetes-policy-security': { uses: 'kubeclaw.kubernetes-policy-security@1', mode: 'blocking', retries: 0,
            needs: ['checked-manifest'], concurrencyGroup: 'security-kubernetes-policy',
            config: { policy: { profile: 'strict-v1' } }, inputs: {
              'checked-manifest': { from: 'checked-manifest', output: 'artifact-1',
                mediaType: 'application/vnd.kubeclaw.checked-kubernetes-yaml' } } },
          'kubernetes-runtime-security': { uses: 'kubeclaw.kubernetes-runtime-security@1', mode: 'blocking', retries: 0,
            needs: ['kubernetes-deployment'], concurrencyGroup: 'security-kubernetes-runtime',
            config: { policy: { profile: 'strict-v1' } }, inputs: {
              deployment: deploymentInput.deployment,
              'checked-manifest': { from: 'checked-manifest', output: 'artifact-1',
                mediaType: 'application/vnd.kubeclaw.checked-kubernetes-yaml' } } },
          'public-http-health': { uses: 'kubeclaw.http@1', mode: 'blocking', retries: 2,
            needs: ['tailscale-exposure'], concurrencyGroup: 'http', config: {
              ...(publicHttpOverride ? { url: publicHttpOverride } : {}), path: '/', expectedStatuses: [200],
              expectedText: publicExpectedText, requestTimeoutMs: progress.real_e2e?.public_http_timeout_ms ?? 10000 },
            ...(publicHttpInput ? { inputs: publicHttpInput } : {}) },
        },
        fixtures: {
          'kubernetes-deployment': { uses: 'kubeclaw.kubernetes-fixture@1', retries: 0,
            needs: ['size-budget', 'container-build'],
            concurrencyGroup: 'kubernetes-fixture', config: {
              serviceName: 'real-pipeline-e2e-nginx',
              servicePort: 18080, namespacePrefix: fixtureConfig.namespace_prefix ?? 'test',
              retention: { mode: fixtureConfig.retention_mode ?? 'delete',
                seconds: fixtureConfig.retention_seconds ?? 1800 },
              readinessTimeoutSeconds: fixtureConfig.readiness_timeout_seconds ?? 180,
              secretReferences: fixtureConfig.secret_references ?? [] }, inputs: {
              'checked-manifest': { from: 'checked-manifest', output: 'artifact-1',
                mediaType: 'application/vnd.kubeclaw.checked-kubernetes-yaml' },
              image: { from: 'container-build', output: 'image', schemaId: 'kubeclaw.container-image@1' },
            } },
          'tailscale-exposure': { uses: 'kubeclaw.tailscale-exposure@1', retries: 0,
            needs: ['kubernetes-deployment'], concurrencyGroup: 'tailscale-exposure',
            config: { path: '/', readinessTimeoutSeconds: 180 }, inputs: { deployment: deploymentInput.deployment } },
        },
        concurrencyLimits: { unit: 1, 'size-budget': 1, 'container-build': 1,
          manifest: 1, 'kubernetes-fixture': 1, 'tailscale-exposure': 1, http: 1,
          'api-flow': 1, openapi: 1, 'browser-axe': 2, 'browser-lighthouse': 1, 'browser-visual': 1,
          'browser-playwright': 1, 'security-headers': 2, 'security-dependency': 1,
          'security-image': 1, 'security-kubernetes-policy': 1, 'security-kubernetes-runtime': 1 },
      },
    },
  };
  const apiFailureSpecs = [];
  const addApiFailure = (scope, legacy) => {
    const flowFile = legacy?.test_config?.api?.spec_file;
    if (typeof flowFile !== 'string') return;
    scope.tests['intentional-api-failure'] = { uses: 'kubeclaw.api-flow@1', mode: 'blocking', retries: 0,
      concurrencyGroup: 'api-flow', config: { flowFile,
        url: 'http://registry-local.kubeclaw.svc.cluster.local:5001' } };
    scope.concurrencyLimits['api-flow'] = 1;
    apiFailureSpecs.push(flowFile);
  };
  for (const moduleId of moduleIds) addApiFailure(unitPipeline.modules[moduleId], progress.modules[moduleId]);
  addApiFailure(unitPipeline.gates['final-buster'], progress.gates?.['final-buster']);
  const files = {
    'pipeline.json': `${JSON.stringify(unitPipeline, null, 2)}\n`,
    'api-flow-success.json': `${JSON.stringify({
      schemaVersion: 'kubeclaw.api-flow.v1',
      steps: [{ id: 'get-home', path: '/', expect: { status: 200, bodyContains: 'REAL_E2E_NGINX_OK' } }],
    }, null, 2)}\n`,
    'openapi-success.json': `${JSON.stringify({
      openapi: '3.1.0',
      info: { title: 'Real pipeline fixture', version: '1.0.0' },
      paths: { '/': { get: { operationId: 'getHome', responses: { 200: { description: 'Fixture page', content: {
        'text/html': { schema: { type: 'string', minLength: 1 } },
      } } } } } },
    }, null, 2)}\n`,
    'lighthouse-settings.json': `${JSON.stringify({
      schemaVersion: 'kubeclaw.lighthouse-settings.v1',
      profiles: { desktop: { formFactor: 'desktop', screen: { width: 1280, height: 720,
        deviceScaleFactor: 1, mobile: false }, throttling: { rttMs: 40, throughputKbps: 10240,
        cpuSlowdownMultiplier: 1 } } },
      budgets: { fixture: { minimumScore: 50, maximumLcpMs: 5000, maximumCls: 0.25,
        maximumTbtMs: 1000 } },
    }, null, 2)}\n`,
    'browser-profiles.json': fs.readFileSync(path.join(FIXTURE_DIR, '.swarm/browser-profiles.json'), 'utf8'),
    'visual/baselines.json': fs.readFileSync(path.join(FIXTURE_DIR, '.swarm/visual/baselines.json'), 'utf8'),
    'playwright.config.ts': [
      "import { defineConfig } from '@playwright/test';",
      "export default defineConfig({ testDir: './e2e', retries: 1, use: { baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL, screenshot: 'only-on-failure', trace: 'retain-on-failure' }, projects: [{ name: 'chromium', use: { browserName: 'chromium' } }] });",
      '',
    ].join('\n'),
    'e2e/home.spec.ts': [
      "import { test, expect } from '@playwright/test';",
      "test('real deployment responds', async ({ page }) => { await page.goto('/'); await expect(page.locator('body')).toContainText('REAL_E2E_NGINX_OK'); });",
      '',
    ].join('\n'),
    ...Object.fromEntries(apiFailureSpecs.map((file) => [file.replace(/^\.swarm\//u, ''), `${JSON.stringify({
      schemaVersion: 'kubeclaw.api-flow.v1',
      steps: [{ id: 'intentional-failure', path: '/v2/', expect: { status: 599 } }],
    }, null, 2)}\n`])),
    'ARCHITECTURE.md': [
      '# Real Pipeline E2E Architecture',
      '',
      'This project verifies that the production pipeline can build, review, gate, approve, deploy, and summarize a simple nginx workload.',
      '',
      '## Pipeline contracts',
      '',
      'The module surface has explicit first-class contracts:',
      `- \`.swarm/contracts/deployable-artifact.json\` is the immutable deployment handoff from ${deployableHandoff} to Final Buster across modules ${moduleList}. Final Buster deploys only its exact image and checked manifest.`,
      `- \`.swarm/contracts/runtime-config.json\` is the application runtime and static serving boundary for modules ${moduleList}. Empty env/config/secret lists are valid for this static fixture, and URL-to-source mappings are explicit.`,
      `- \`.swarm/contracts/module-review.json\` binds Echo review ownership to modules ${moduleList} and their declared source, contract, and evidence surfaces.`,
      moduleOutputBoundary,
      packagingBoundary,
      '',
      'The nginx module manifest stays reusable with only Deployment, Service, and app-owned Secret resources; it must not hardcode run-scoped BusterNamespaceLease or Ingress objects.',
      'This fixture currently requires no app-owned Secret, so `.swarm/contracts/runtime-config.json` declares `secrets: []` and `credentials.requires_login: false`; that empty contract is the authority, not an implicit omission.',
      'The preview infrastructure boundary is explicit in `.swarm/contracts/preview-infrastructure.json`. The exposure fixture returns the public URL to the HTTP provider.',
      'The Kubernetes fixture waits for pod and Service readiness. The HTTP provider validates app content through the internal Service URL.',
      `The ${deployableHandoff} owns immutable image verification and the deployable artifact contract. Final Buster deploys that exact image and records its digest.`,
      '',
    ].join('\n'),
    'contracts/deployable-artifact.json': `${JSON.stringify(contracts.deployable_artifact, null, 2)}\n`,
    'contracts/runtime-config.json': `${JSON.stringify(contracts.runtime_config, null, 2)}\n`,
    'contracts/module-review.json': `${JSON.stringify(contracts.module_review, null, 2)}\n`,
    'contracts/preview-infrastructure.json': `${JSON.stringify(contracts.preview_infrastructure, null, 2)}\n`,
    'modules/01-nginx/FORGE.md': [
      '# Forge Instructions',
      '',
      'Keep the fixture minimal and production-shaped.',
      'If the owned files already satisfy this module contract, leave them unchanged and write the Forge completion artifact.',
      'The Forge completion artifact must name the inspected owned files, consulted contract files, and the rationale for leaving source unchanged or changing it.',
      'Own only `nginx/default.conf` as the reusable container runtime foundation.',
      ...(fullModuleGraph
        ? [
            'Do not edit `src/index.html`, `src/integration/module-map.json`, or `k8s/deployment.yaml`; module 04 owns the release assembly composition.',
            'Do not edit `Dockerfile`; module 04 owns image packaging and consumes this module through `.swarm/contracts/module-outputs/01-foundation.json`.',
          ]
        : [
            'Do not edit undeclared branch, join, or release-assembly surfaces; this scoped scenario owns only the module 01 fixture surface.',
          ]),
      'Own only the foundation source surface declared by `.swarm/contracts/module-outputs/01-foundation.json`.',
      `Preserve \`.swarm/contracts/deployable-artifact.json\` as the explicit ${fullModuleGraph ? 'release assembly -> Final Buster' : 'module -> Final Buster'} handoff contract.`,
      'Preserve `.swarm/contracts/runtime-config.json` as the explicit app runtime config boundary. Empty lists are valid when the app has no runtime inputs.',
      'Preserve `.swarm/contracts/module-review.json` and `.swarm/contracts/preview-infrastructure.json`; ownership boundaries are code-owned contracts, not prompt-only guidance.',
      'Preserve the literal `REAL_E2E_RUN_ID_PLACEHOLDER` in `src/index.html`; run identity is verified through pipeline, namespace, and preview evidence, not by mutating source HTML.',
      'Do not bypass module Buster validation. Kubernetes validation is final-Buster gate owned for this fixture.',
      '',
    ].join('\n'),
    'modules/01-nginx/BUSTER.md': [
      '# Buster Instructions',
      '',
      'Run the requested deterministic suites against the nginx fixture.',
      'Treat deterministic suite results as pre-test evidence only; this foundation module requires Buster agent judgment after suites pass.',
      fullModuleGraph
        ? 'Treat `.swarm/contracts/deployable-artifact.json` as the downstream immutable deployment reference for the release assembly and Final Buster.'
        : 'Treat `.swarm/contracts/deployable-artifact.json` as the immutable deployment reference for Final Buster.',
      'Treat `.swarm/contracts/runtime-config.json` as the runtime input authority. The static fixture has no required env/config/Secret inputs unless that contract says otherwise.',
      'Treat `.swarm/contracts/module-outputs/01-foundation.json` as this module output authority.',
      'Treat `.swarm/contracts/preview-infrastructure.json` as the ownership boundary that keeps run-scoped preview infrastructure out of reusable module source.',
      'The final verdict for this module must come from the Buster agent output after reviewing suite evidence, owned nginx runtime behavior, and declared contracts.',
      'Kubernetes and final-preview validation are final-Buster gate owned; do not require this module Buster phase to create preview infrastructure.',
      '',
    ].join('\n'),
    'echo-review/MODULE-REVIEW-INSTRUCTIONS.md': [
      '# Module Review',
      '',
      'Review the fixture for correctness, reproducibility, and contract adherence.',
      'The source HTML must keep `REAL_E2E_RUN_ID_PLACEHOLDER`; treating a concrete run id in source as valid is a failure.',
      'Use `.swarm/contracts/module-review.json` as the review ownership contract for the exact `module_ids` it declares; do not treat this as a floating global review gate.',
      `Require \`.swarm/contracts/deployable-artifact.json\` to be the explicit immutable deployment handoff from ${deployableHandoff} to Final Buster.`,
      'Require `.swarm/contracts/runtime-config.json` to be the explicit app-owned runtime and static serving boundary. Do not fail solely because env/config/Secret lists are empty for this static fixture.',
      fullModuleGraph
        ? 'Assess whether module Buster evidence proves each module-owned static surface and whether `04-nginx` has a composition-aware check before Final Buster.'
        : 'Assess whether module Buster evidence proves each module-owned static surface declared by `.swarm/contracts/module-review.json`.',
      'Do not require `.swarm/logs/echo-review/MODULE-REVIEW.json` as input evidence for this review; the pipeline publishes that canonical artifact only after your reviewer-scoped output is parsed.',
      'Before PASS, list every required contract in `checked_contracts`, every opened verdict/artifact in `opened_artifacts`, every non-zero evidence command in `failed_commands`, and every missing evidence item in `unverified_requirements`.',
      'A PASS is invalid if `failed_commands` or `unverified_requirements` is non-empty, or if required contracts/artifacts were not actually opened.',
      'Require `.swarm/contracts/preview-infrastructure.json` to keep BusterNamespaceLease, Tailscale exposure, preview URL, and cleanup policy under final-Buster gate ownership.',
      'Do not require static BusterNamespaceLease or Ingress manifests in module source. The Kubernetes fixture owns its run-scoped lease.',
      'Require the preview suite to use an explicit preview URL until its replacement migration is complete.',
      'Return a strict production review result.',
      '',
    ].join('\n'),
    'echo-review/MODULE-REVIEW-REJECT-INSTRUCTIONS.md': [
      '# Module Review Rejection Fixture',
      '',
      'This is the canonical retry-buster-pass-echo-rejects fixture: return status "FAIL" with at least one critical issue after confirming the module retry recovered and reached module review.',
      'Review the same production contract surfaces as the normal module review: `.swarm/contracts/module-review.json`, `.swarm/contracts/deployable-artifact.json`, `.swarm/contracts/runtime-config.json`, `.swarm/contracts/preview-infrastructure.json`, and every declared module output contract.',
      'Before failing, verify that module `01-nginx` has both a failed Buster attempt and a later passing Buster attempt, and review only the module ids declared by `.swarm/contracts/module-review.json`.',
      'Return a valid Echo review JSON object for gate `module-review` with `status` set to `FAIL`, at least one `critical_issues` entry explaining this intentional real E2E rejection, and no malformed JSON.',
      'Do not return PASS for this fixture. The purpose of this scenario is to prove the recovered retry path can still halt canonically at the following module-review gate.',
      '',
    ].join('\n'),
    'echo-review/FINAL-REVIEW-INSTRUCTIONS.md': [
      '# Final Review',
      '',
      'Review the pre-completion run artifacts, gates, final Buster result, deployment evidence, and summary readiness.',
      'During this final-review gate, do not require post-final-review v2 report artifacts; those are written only after final-review passes.',
      'Do require production evidence that all earlier gates completed, final Buster produced deployment and security evidence, and there is no missing pre-completion artifact needed to decide readiness.',
      `Require final Buster to deploy the exact ${deployableHandoff} artifact contract from \`.swarm/contracts/deployable-artifact.json\`. Do not accept a separate final-gate rebuild.`,
      'Require the Kubernetes fixture result to contain the exact immutable image reference, manifest digest, lease name, namespace, and creation time.',
      'Require runtime configuration evidence to come from `.swarm/contracts/runtime-config.json`; empty env/config/Secret lists are valid when the contract declares no app runtime inputs.',
      'Require module review evidence to map to the exact `.swarm/contracts/module-review.json` `module_ids`, and preview evidence to map to `.swarm/contracts/preview-infrastructure.json`.',
      'Before PASS, list every required contract in `checked_contracts`, every opened verdict/artifact in `opened_artifacts`, every non-zero evidence command in `failed_commands`, and every missing evidence item in `unverified_requirements`.',
      'A PASS is invalid if `failed_commands` or `unverified_requirements` is non-empty, or if required contracts/artifacts were not actually opened.',
      'Do not pass if any required production evidence is missing.',
      'Do not downgrade Buster suite findings. If a Buster finding is deferrable, that deferral must come from pipeline policy, not Echo judgment.',
      '',
    ].join('\n'),
    'buster-test/FINAL-BUSTER.md': [
      '# Final Buster',
      '',
      'Validate the checked Kubernetes deployment and Tailscale preview reachability. The provider plan performs HTTP checks before legacy consumer suites.',
      'Deploy the exact digest-pinned image and checked manifest from `.swarm/contracts/deployable-artifact.json`.',
      'Record the immutable image reference, manifest digest, lease name, namespace, and creation time from the fixture result.',
      'Validate app runtime inputs from `.swarm/contracts/runtime-config.json`; this fixture explicitly declares no required env/config/Secret inputs.',
      'Validate the static serving contract from `.swarm/contracts/runtime-config.json`: the app must serve the declared smoke paths and expected markers from the declared source surfaces.',
      'Validate preview ownership from `.swarm/contracts/preview-infrastructure.json`; preview leases, exposure, preview URL, and cleanup policy are final-Buster gate resources.',
      'The Kubernetes fixture creates a run-scoped BusterNamespaceLease and waits for the real workload and Service endpoints.',
      'The HTTP provider must validate the app through the internal Service URL.',
      'Do not ask Forge, Echo, or reusable module manifests to create final-preview lease or Ingress resources.',
      'Do not add Role or RoleBinding resources for `pods/portforward`. The provider path does not use port forwarding.',
      'Missing operator or namespace lease permissions are infrastructure failures and must block.',
      '',
    ].join('\n'),
    'pipeline-review/PIPELINE-REVIEW-INSTRUCTIONS.md': [
      '# Pipeline Review',
      '',
      'Summarize whether the real E2E run exercised Forge, Buster, Echo, approval, Kubernetes fixture, Tailscale, and cleanup contracts.',
      'Flag any missing production evidence.',
      'Assess test-depth quality, including whether module checks prove owned surfaces rather than only the integrated fixture.',
      'Flag missing expected artifacts, especially run-scoped summary, project summary, case-study base data, and publishable case study.',
      'Do not downgrade Buster findings; report the policy that made them blocking, warning, or deferrable.',
      'Do not report benign startup tool failures, transcript compaction notices, or accepted-output session-stop grace expiry unless lifecycle state, typed artifacts, or terminal evidence were affected.',
      '',
    ].join('\n'),
  };
  for (const [moduleId, contract] of Object.entries(contracts.module_outputs || {})) {
    files[moduleSurface(moduleId).output_contract.replace(/^\.swarm\//, '')] = `${JSON.stringify(contract, null, 2)}\n`;
  }
  return files;
}

function moduleInstructionFiles(progress) {
  const files = {};
  for (const [moduleId, mod] of Object.entries(progress?.modules || {})) {
    const dir = mod?.dir || moduleId;
    if (moduleId === '01-nginx') continue;
    files[`modules/${dir}/FORGE.md`] = [
      '# Forge Instructions',
      '',
      `Keep module ${moduleId} coherent with the shared nginx fixture and its dependency contract.`,
      'If the owned files already satisfy this module contract, leave them unchanged and write the Forge completion artifact.',
      'The Forge completion artifact must name the inspected owned files, consulted contract files, and the rationale for leaving source unchanged or changing it.',
      `Own only these source paths: ${moduleSurface(moduleId).source_paths.map((entry) => `\`${entry}\``).join(', ')}.`,
      `Preserve this module output contract: \`${moduleSurface(moduleId).output_contract}\`.`,
      ...(moduleSurface(moduleId).consumes?.length ? [`Consume declared upstream module outputs only: ${moduleSurface(moduleId).consumes.map((entry) => `\`${entry}\``).join(', ')}.`] : []),
      ...(moduleSurface(moduleId).contract_boundaries?.length ? [`Keep contract boundaries separate: ${moduleSurface(moduleId).contract_boundaries.map((entry) => `\`${entry}\``).join(', ')}.`] : []),
      ...(moduleId !== '01-nginx' ? ['Consume the foundation through `.swarm/contracts/runtime-config.json` and declared module output contracts, not by treating module 01 packaging as an interface.'] : []),
      ...(moduleId === '04-nginx' ? ['Preserve the digest-pinned image in `k8s/deployment.yaml`; the fixture deploys the checked manifest without rewriting it.'] : []),
      'Preserve `.swarm/contracts/deployable-artifact.json`, `.swarm/contracts/runtime-config.json`, `.swarm/contracts/module-review.json`, and `.swarm/contracts/preview-infrastructure.json` as the code-owned contract authorities.',
      'Do not model run-scoped final-preview infrastructure as reusable module source.',
      'Do not bypass module Buster validation. Kubernetes validation is final-Buster gate owned for this fixture.',
      '',
    ].join('\n');
    files[`modules/${dir}/BUSTER.md`] = [
      '# Buster Instructions',
      '',
      `Run the requested deterministic suites for module ${moduleId}.`,
      'This module intentionally uses deterministic Buster mode; do not spawn a Buster judgment agent unless policy or suite failure asks for one.',
      'Preserve run_id, project, module_id, and attempt identity in all Buster evidence.',
      `Verify this module output contract remains coherent: \`${moduleSurface(moduleId).output_contract}\`.`,
      'Treat the shared deployable artifact, runtime config, module review, and preview infrastructure contracts as references, not duplicated module-local contract copies.',
      'Treat `.swarm/contracts/preview-infrastructure.json` as the ownership boundary that keeps BusterNamespaceLease, Tailscale exposure, preview URL, and cleanup policy under final-Buster gate ownership.',
      ...(moduleId === '04-nginx' ? ['Require `k8s/deployment.yaml` to use the immutable image declared by the deployable artifact contract.'] : []),
      'Kubernetes and final-preview validation are final-Buster gate owned; reusable module manifests must not define the preview lease or an Ingress.',
      '',
    ].join('\n');
  }
  return files;
}

export function writeRealE2ESwarmFiles(swarmDir, progress) {
  for (const [relativePath, contents] of Object.entries({ ...instructionFiles(progress), ...moduleInstructionFiles(progress) })) {
    writeText(path.join(swarmDir, relativePath), contents);
  }
}

async function execGit(args, options = {}) {
  return execFileAsync('git', args, {
    cwd: options.cwd || REPO_ROOT,
    encoding: 'utf8',
    timeout: options.timeout || 30000,
    maxBuffer: 4 * 1024 * 1024,
  });
}

async function rawOriginUrl(cwd) {
  return (await execGit(['config', '--get', 'remote.origin.url'], {
    cwd,
    timeout: 30000,
  })).stdout.trim();
}

async function configureWorkspaceOrigin(worktreePath, originPath) {
  await execGit(['remote', 'set-url', 'origin', originPath], { cwd: worktreePath, timeout: 30000 });
  await execGit(['remote', 'set-url', '--push', 'origin', originPath], { cwd: worktreePath, timeout: 30000 });
}

async function seedArchitectureBranch({ worktreePath, worktreeBranch, projectName, runId }) {
  const branchName = architectureBranchNameForProject(projectName);
  const activeBranch = await currentBranch(worktreePath);
  assertSafeArchitectureSeedBranches({
    worktreeBranch: activeBranch,
    expectedWorktreeBranch: worktreeBranch,
    architectureBranch: branchName,
  });
  await execGit(['add', 'Projects'], { cwd: worktreePath, timeout: 60000 });
  await execGit(['commit', '-m', `[real-e2e] Seed ${projectName} project contract`, '--', 'Projects'], {
    cwd: worktreePath,
    timeout: 60000,
  });
  await execGit(['branch', '-f', branchName, 'HEAD'], { cwd: worktreePath, timeout: 30000 });
  await execGit(['push', '--force', 'origin', `${branchName}:${branchName}`], {
    cwd: worktreePath,
    timeout: 60000,
  });
  return { branchName, runId };
}

async function publishRunBranchUpstream({ worktreePath, branchName }) {
  assertSafeRunBranchPublish({ branchName });
  await execGit(['push', '-u', 'origin', `HEAD:${branchName}`], { cwd: worktreePath, timeout: 60000 });
  return { branchName };
}

async function cloneRunScopedWorkspace({ artifactRoot, worktreePath, branchName }) {
  const originPath = path.join(artifactRoot, 'origin.git');
  const sourceOriginUrl = await rawOriginUrl(REPO_ROOT);
  await execGit(['init', '--bare', originPath], { timeout: 60000 });
  await execGit(['clone', '--no-local', REPO_ROOT, worktreePath], { timeout: 60000 });
  await configureWorkspaceOrigin(worktreePath, originPath);
  await execGit(['config', 'user.email', 'real-e2e@example.invalid'], { cwd: worktreePath, timeout: 30000 });
  await execGit(['config', 'user.name', 'Real E2E'], { cwd: worktreePath, timeout: 30000 });
  await execGit(['checkout', '-B', branchName, 'HEAD'], { cwd: worktreePath, timeout: 60000 });
  return { path: originPath, sourceOriginUrl };
}

async function configureGitMergeConflictFixture({ workspace, projectName }) {
  const conflictRemotePath = path.join(workspace.artifactRoot, 'git-conflict-origin.git');
  const conflictClonePath = path.join(workspace.artifactRoot, 'git-conflict-remote-worktree');
  const conflictFile = 'REAL_E2E_TRUE_MERGE_CONFLICT.txt';
  const sourceOriginUrl = workspace.sourceOriginUrl || await rawOriginUrl(workspace.worktreePath);

  await execGit(['init', '--bare', conflictRemotePath], { timeout: 60000 });
  await configureWorkspaceOrigin(workspace.worktreePath, conflictRemotePath);
  await execGit(['push', '-u', 'origin', `HEAD:${workspace.branchName}`], { cwd: workspace.worktreePath, timeout: 60000 });
  await execGit(['push', 'origin', `${workspace.architectureBranchName}:${workspace.architectureBranchName}`], {
    cwd: workspace.worktreePath,
    timeout: 60000,
  });

  writeText(
    path.join(workspace.worktreePath, conflictFile),
    [
      'real_e2e_git_merge_conflict=local',
      `project=${projectName}`,
      `branch=${workspace.branchName}`,
      '',
    ].join('\n'),
  );
  await execGit(['add', '--', conflictFile], { cwd: workspace.worktreePath, timeout: 30000 });
  await execGit(['commit', '-m', '[real-e2e] Local side of merge conflict', '--', conflictFile], {
    cwd: workspace.worktreePath,
    timeout: 60000,
  });

  await execGit(['clone', conflictRemotePath, conflictClonePath], { timeout: 60000 });
  await execGit(['checkout', workspace.branchName], { cwd: conflictClonePath, timeout: 30000 });
  await execGit(['config', 'user.email', 'real-e2e@example.invalid'], { cwd: conflictClonePath, timeout: 30000 });
  await execGit(['config', 'user.name', 'Real E2E'], { cwd: conflictClonePath, timeout: 30000 });
  writeText(
    path.join(conflictClonePath, conflictFile),
    [
      'real_e2e_git_merge_conflict=remote',
      `project=${projectName}`,
      `branch=${workspace.branchName}`,
      '',
    ].join('\n'),
  );
  await execGit(['add', '--', conflictFile], { cwd: conflictClonePath, timeout: 30000 });
  await execGit(['commit', '-m', '[real-e2e] Remote side of merge conflict', '--', conflictFile], {
    cwd: conflictClonePath,
    timeout: 60000,
  });
  await execGit(['push', 'origin', `HEAD:${workspace.branchName}`], { cwd: conflictClonePath, timeout: 60000 });
  fs.rmSync(conflictClonePath, { recursive: true, force: true });

  return {
    remote: conflictRemotePath,
    branch: workspace.branchName,
    file: conflictFile,
    original_origin_url: workspace.runOriginPath || null,
    source_origin_url: sourceOriginUrl,
  };
}

async function execKubectl(args, options = {}) {
  return execFileAsync('kubectl', args, {
    cwd: options.cwd || REPO_ROOT,
    encoding: 'utf8',
    timeout: options.timeout || 30000,
    maxBuffer: 8 * 1024 * 1024,
  });
}

async function setLeaseCleanupPolicyDelete(name, namespace) {
  await execKubectl([
    'patch',
    'busternamespacelease',
    name,
    '-n',
    namespace,
    '--type=merge',
    '-p',
    JSON.stringify({ spec: { cleanupPolicy: 'delete' } }),
  ], { timeout: 30000 });
}

async function waitForLeaseDeleted(name, namespace, timeoutMs = 180000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await execKubectl(['get', 'busternamespacelease', name, '-n', namespace], { timeout: 10000 });
    } catch (error) {
      if (/notfound|not found/i.test(error?.message || String(error))) return;
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error(`BusterNamespaceLease ${namespace}/${name} was not deleted before cleanup timeout`);
}

async function currentBranch(cwd = REPO_ROOT) {
  const result = await execGit(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd });
  return result.stdout.trim();
}

export function buildRunConfig({ runId, worktreePath, scenarioId = 'success' }) {
  const compactConfig = readJson(DEPLOYED_COMPACT_CONFIG_PATH);
  compactConfig._doc = 'Run-scoped real E2E swarm config generated from the deployed standard profile with repo-local test tool paths.';
  compactConfig.profile = 'standard';
  compactConfig.repo_root = worktreePath;
  compactConfig.run_id = runId;
  compactConfig.overrides = {
    ...(compactConfig.overrides || {}),
    agents: {
      ...((compactConfig.overrides || {}).agents || {}),
      forge: {
        ...(((compactConfig.overrides || {}).agents || {}).forge || {}),
        cwd: worktreePath,
      },
      echo: {
        ...(((compactConfig.overrides || {}).agents || {}).echo || {}),
        cwd: worktreePath,
      },
    },
  };
  let config = normalizeRealE2ERunConfigDefaults(expandSwarmConfig(compactConfig));
  if (config?.agents?.buster) {
    delete config.agents.buster.dispatch;
    delete config.agents.buster.redis_js_path;
  }
  if (config?.buster?.runtime) {
    delete config.buster.runtime.task_stream;
    delete config.buster.runtime.task_poll_interval_ms;
    delete config.buster.runtime.task_pending_reclaim_idle_ms;
    delete config.buster.runtime.task_stream_max_len;
    delete config.buster.runtime.completion_event_block_ms;
    delete config.buster.runtime.completion_recovery_scan_interval_ms;
  }
  config.run_id = runId;
  config.discord_webhook_url = withDiscordWebhookWait(process.env.DISCORD_WEBHOOK || config.discord_webhook_url || '');
  config.gateway.health.timeout_ms = Math.min(Number(config.gateway.health.timeout_ms || 120000), 120000);
  config = applyRealE2EConfigScenario(config, scenarioId);
  return config;
}

export async function createRealE2ERunWorkspace({ mode = 'full', scenarioId = 'success' } = {}) {
  const runId = `real-e2e-${Date.now()}-${process.pid}`;
  const model = e2eModel();
  const projectName = projectNameForRun(runId);
  const safeScenario = safeRunIdSegment(scenarioId || 'success');
  const branchName = `verification/e2e/${safeScenario}-${safeRunIdSegment(runId)}`;
  const artifactRoot = path.join(REPO_ROOT, '.swarm', 'real-e2e', runId);
  const worktreePath = path.join(artifactRoot, 'worktree');
  fs.mkdirSync(artifactRoot, { recursive: true });

  const sourceBranch = await currentBranch();
  const runOrigin = await cloneRunScopedWorkspace({ artifactRoot, worktreePath, branchName });

  const projectSrc = path.join(worktreePath, 'Projects', projectName, 'src');
  fs.mkdirSync(path.dirname(projectSrc), { recursive: true });
  fs.cpSync(FIXTURE_DIR, projectSrc, { recursive: true });

  const swarmDir = path.join(projectSrc, '.swarm');
  const progressModuleIds = realE2EScenarioModuleIds(scenarioId);
  const baseProgress = buildProgress({ projectName, mode, runId, moduleIds: progressModuleIds });
  applyRealE2EExecutionBoundary(baseProgress);
  const { progress, scenario } = applyRealE2EScenario(baseProgress, scenarioId);
  validateRealE2EContractAuthority(progress);
  const deploymentImage = progress.real_e2e?.kubernetes_fixture?.image?.reference;
  if (typeof deploymentImage !== 'string' || !/@sha256:[a-f0-9]{64}$/u.test(deploymentImage)) {
    throw new Error('real E2E workspace requires an immutable Kubernetes deployment image');
  }
  const deploymentManifestPath = path.join(projectSrc, 'k8s', 'deployment.yaml');
  fs.writeFileSync(deploymentManifestPath, fs.readFileSync(deploymentManifestPath, 'utf8')
    .replace('real-pipeline-e2e-nginx:verification', deploymentImage)
    .replace('        app.kubernetes.io/name: real-pipeline-e2e-nginx\n    spec:\n      containers:',
      '        app.kubernetes.io/name: real-pipeline-e2e-nginx\n        kubeclaw/e2e-target: "true"\n    spec:\n      containers:')
    .replace('      port: 80\n      targetPort: http', '      port: 18080\n      targetPort: http'));
  applyRealE2EWorkspaceScenario({ projectSrc, progress, scenarioId: scenario.id });
  writeJson(path.join(swarmDir, 'progress.json'), progress);
  writeRealE2ESwarmFiles(swarmDir, progress);
  if (scenario.id === 'git-dirty-worktree-preserved') {
    assertScenarioMutationChannel(scenario, 'workspace-file');
    writeText(
      path.join(worktreePath, 'REAL_E2E_DIRTY_WORKTREE_PRESERVE.txt'),
      `run_id=${runId}\nproject=${projectName}\n`,
    );
  }

  const architectureBranch = await seedArchitectureBranch({ worktreePath, worktreeBranch: branchName, projectName, runId });
  const runBranchUpstream = scenario.id === 'git-merge-conflict'
    ? null
    : await publishRunBranchUpstream({ worktreePath, branchName });

  const runConfigPath = path.join(artifactRoot, 'swarm.config.json');
  const runConfig = buildRunConfig({ runId, worktreePath, scenarioId: scenario.id });
  writeJson(runConfigPath, runConfig);
  validateRealE2EScenarioSetup({
    progress,
    config: runConfig,
    projectSrc,
    swarmDir,
    scenarioId: scenario.id,
  });
  const cleanupManifestPath = path.join(artifactRoot, 'cleanup-manifest.json');
  writeJson(cleanupManifestPath, {
    run_id: runId,
    mode,
    scenario: scenario.id,
    expected_pipeline_exit: scenario.expectedPipelineExit,
    expected_evidence: scenario.expectedEvidence,
    project: projectName,
    model,
    fallback_model: model,
    branch: branchName,
    architecture_branch: architectureBranch.branchName,
    run_branch_upstream: runBranchUpstream?.branchName || null,
    source_branch: sourceBranch,
    run_origin: runOrigin.path,
    worktree: worktreePath,
    swarm_config: runConfigPath,
    created_at: new Date().toISOString(),
  });

  const workspace = {
    runId,
    mode,
    scenario,
    projectName,
    branchName,
    architectureBranchName: architectureBranch.branchName,
    runBranchUpstreamName: runBranchUpstream?.branchName || null,
    sourceBranch,
    artifactRoot,
    runOriginPath: runOrigin.path,
    sourceOriginUrl: runOrigin.sourceOriginUrl,
    worktreePath,
    projectSrc,
    swarmDir,
    runConfigPath,
    cleanupManifestPath,
    cleanupBlockerWorktreePath: null,
    gitConflictFixture: null,
  };

  if (scenario.id === 'git-merge-conflict') {
    workspace.gitConflictFixture = await configureGitMergeConflictFixture({ workspace, projectName });
  }

  return workspace;
}

export async function createRealE2EGitCleanupBlocker(workspace) {
  if (!workspace?.artifactRoot || !workspace?.branchName) {
    throw new Error('workspace is required to create a Git cleanup blocker');
  }
  const blockerPath = path.join(workspace.artifactRoot, 'branch-delete-blocker');
  await execGit(['clone', '--no-local', workspace.worktreePath, blockerPath], { timeout: 60000 });
  await execGit(['checkout', workspace.branchName], { cwd: blockerPath, timeout: 30000 });
  workspace.cleanupBlockerWorktreePath = blockerPath;
  return blockerPath;
}

export async function cleanupRealE2ERunWorkspace(workspace, { keepArtifacts = false } = {}) {
  const cleanup = { ok: true, steps: [] };
  const record = (step, ok, detail = null) => cleanup.steps.push({ step, ok, detail });
  if (!workspace) return cleanup;
  const gitConflictOriginalOrigin = workspace.gitConflictFixture?.original_origin_url || null;

  try {
    const kubeclawNamespace = process.env.KUBECLAW_NAMESPACE || 'kubeclaw';
    const leases = [];
    const namespaceNames = new Set();
    const listFailures = [];
    try {
      const { stdout } = await execKubectl(['get', 'busternamespaceleases', '-n', kubeclawNamespace, '-o', 'json'], { timeout: 30000 });
      const parsed = JSON.parse(stdout || '{}');
      const items = Array.isArray(parsed.items) ? parsed.items : [];
      leases.push(...items.filter((item) => item?.spec?.runId === workspace.runId || item?.spec?.project === workspace.projectName));
    } catch (leaseListError) {
      listFailures.push({ resource: 'busternamespaceleases', error: leaseListError?.message || String(leaseListError) });
    }

    for (const lease of leases) {
      const namespaceName = lease?.status?.namespaceName || lease?.spec?.namespaceName;
      if (namespaceName && isSafeE2ENamespaceName(workspace, namespaceName)) namespaceNames.add(namespaceName);
    }

    const deletedLeases = [];
    const cleanupPolicyPatches = [];
    const leaseDeletionProofs = [];
    for (const lease of leases) {
      const name = lease?.metadata?.name;
      if (name) {
        await setLeaseCleanupPolicyDelete(name, kubeclawNamespace);
        cleanupPolicyPatches.push(name);
        await execKubectl(['delete', 'busternamespacelease', name, '-n', kubeclawNamespace, '--ignore-not-found=true', '--wait=false'], { timeout: 30000 });
        await waitForLeaseDeleted(name, kubeclawNamespace);
        deletedLeases.push(name);
        leaseDeletionProofs.push({ lease: name, proof: 'controller_finalizer_removed_after_delete_policy' });
      }
    }
    record('kubernetes_run_resources_delete', listFailures.length === 0, {
      leases: leases.map((item) => item?.metadata?.name).filter(Boolean),
      deleted_leases: deletedLeases,
      cleanup_policy_patches: cleanupPolicyPatches,
      namespaces: [...namespaceNames],
      namespace_authority: 'BusterNamespaceLease',
      namespace_cleanup: 'controller_owned',
      namespace_deletion_proof: 'BusterNamespaceLease deletion after cleanupPolicy=delete',
      lease_deletion_proofs: leaseDeletionProofs,
      list_failures: listFailures,
      namespace_discovery: 'busternamespacelease-only',
    });
    if (listFailures.length > 0) cleanup.ok = false;
  } catch (error) {
    cleanup.ok = false;
    record('kubernetes_run_resources_delete', false, error?.message || String(error));
  }

  try {
    const remoteBranches = [
      workspace.branchName,
      workspace.architectureBranchName,
    ].filter(Boolean).filter(isSafeE2ERemoteBranchName);
    for (const branchName of remoteBranches) {
      try {
        await execGit(['push', 'origin', '--delete', branchName], { cwd: workspace.worktreePath, timeout: 60000 });
        record('git_remote_branch_delete', true, branchName);
      } catch (error) {
        const message = error?.message || String(error);
        if (/remote ref does not exist|unable to delete/i.test(message)) {
          record('git_remote_branch_delete', true, { branch: branchName, already_absent: true });
        } else {
          cleanup.ok = false;
          record('git_remote_branch_delete', false, { branch: branchName, error: message });
        }
      }
    }
  } catch (error) {
    cleanup.ok = false;
    record('git_remote_branch_delete', false, error?.message || String(error));
  }

  if (gitConflictOriginalOrigin) {
    try {
      await configureWorkspaceOrigin(workspace.worktreePath, gitConflictOriginalOrigin);
      record('git_origin_restore', true, gitConflictOriginalOrigin);
    } catch (error) {
      cleanup.ok = false;
      record('git_origin_restore', false, error?.message || String(error));
    }

    if (workspace.architectureBranchName && isSafeE2ERemoteBranchName(workspace.architectureBranchName)) {
      try {
        await execGit(['push', 'origin', '--delete', workspace.architectureBranchName], {
          cwd: workspace.worktreePath,
          timeout: 60000,
        });
        record('git_original_remote_architecture_branch_delete', true, workspace.architectureBranchName);
      } catch (error) {
        const message = error?.message || String(error);
        if (/remote ref does not exist|unable to delete/i.test(message)) {
          record('git_original_remote_architecture_branch_delete', true, {
            branch: workspace.architectureBranchName,
            already_absent: true,
          });
        } else {
          cleanup.ok = false;
          record('git_original_remote_architecture_branch_delete', false, {
            branch: workspace.architectureBranchName,
            error: message,
          });
        }
      }
    }
  }

  try {
    fs.rmSync(workspace.worktreePath, { recursive: true, force: true });
    record('git_worktree_remove', true, { workspace_mode: 'clone' });
  } catch (error) {
    cleanup.ok = false;
    record('git_worktree_remove', false, error?.message || String(error));
  }

  if (workspace.cleanupBlockerWorktreePath) {
    cleanup.ok = false;
    record('git_branch_delete', false, {
      branch: workspace.branchName,
      workspace_mode: 'clone',
      error: 'branch is checked out by cleanup blocker',
    });
    try {
      fs.rmSync(workspace.cleanupBlockerWorktreePath, { recursive: true, force: true });
      record('git_cleanup_blocker_worktree_remove', true, workspace.cleanupBlockerWorktreePath);
    } catch (error) {
      record('git_cleanup_blocker_worktree_remove', false, error?.message || String(error));
    }
    record('git_branch_delete_after_blocker_cleanup', true, {
      branch: workspace.branchName,
      workspace_mode: 'clone',
      local_branch_removed_with_clone: true,
    });
  } else {
    record('git_branch_delete', true, {
      branch: workspace.branchName,
      workspace_mode: 'clone',
      local_branch_removed_with_clone: true,
    });
  }

  if (workspace.architectureBranchName) {
    record('git_architecture_branch_delete', true, {
      branch: workspace.architectureBranchName,
      workspace_mode: 'clone',
      local_branch_removed_with_clone: true,
    });
  }

  if (!keepArtifacts) {
    try {
      fs.rmSync(workspace.artifactRoot, { recursive: true, force: true });
      record('artifact_root_remove', true);
    } catch (error) {
      cleanup.ok = false;
      record('artifact_root_remove', false, error?.message || String(error));
    }
  } else {
    record('artifact_root_retained', true, workspace.artifactRoot);
  }

  return cleanup;
}

export function summarizeWorkspace(workspace) {
  return workspace ? {
    run_id: workspace.runId,
    mode: workspace.mode,
    scenario: workspace.scenario?.id || null,
    expected_pipeline_exit: workspace.scenario?.expectedPipelineExit || null,
    expected_evidence: workspace.scenario?.expectedEvidence || null,
    project: workspace.projectName,
    branch: workspace.branchName,
    architecture_branch: workspace.architectureBranchName,
    artifact_root: workspace.artifactRoot,
    run_origin: workspace.runOriginPath || null,
    worktree: workspace.worktreePath,
    swarm_config: workspace.runConfigPath,
    git_conflict_fixture: workspace.gitConflictFixture,
  } : null;
}
