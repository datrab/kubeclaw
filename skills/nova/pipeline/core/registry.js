import path from 'path';
import {
  PLUGIN_CONTRACT_VERSION,
  PLUGIN_KINDS,
  PLUGIN_ALLOWED_HOOK_FAMILIES,
  PLUGIN_HOOK_FAMILIES,
  PLUGIN_STAGE_IDS,
  PLUGIN_REQUIRED_CAPABILITIES,
  PLUGIN_OPTIONAL_CAPABILITIES,
  PLUGIN_FORBIDDEN_CAPABILITIES,
  PLUGIN_REJECTION_CODES,
  PLUGIN_CAPABILITY_REJECTION_CODES,
  PLUGIN_TRUST_TIERS,
  PLUGIN_SOURCE_TYPES,
} from './constants.js';
import { validateSafePath } from './paths.js';
import { isPlainObject } from '../services/validation.js';
import {
  coerceModuleForgeWorkerControlResult,
  coerceModuleBusterWorkerControlResult,
} from '../agents/orchestration.js';
import { getRuntimeConfigFromPluginContext, getRuntimeProgressFromPluginContext } from './context.js';
import { runBusterGateStage } from '../runners/buster-gate-runner.js';
import { runReviewGateStage } from '../runners/review-gate-runner.js';
import { runApprovalGateStage } from '../runners/approval-gate-runner.js';
import { runArchitectureValidatorStage } from '../services/arch-validator.js';
import { generateProjectSummary, generatePipelineReview } from '../services/summary.js';
import { generateCaseStudy } from '../services/case-study.js';
import { getBuiltinNotificationPluginDefinitions } from '../services/notification-contract.js';

const PLUGIN_METHOD_BY_KIND = Object.freeze({
  worker: 'execute',
  gate: 'execute',
  validator: 'run',
  generator: 'run',
  notification: 'observe',
});

const CONFIG_SCHEMA_ANY_OBJECT = Object.freeze({
  type: 'object',
  additionalProperties: true,
});

async function readPluginConfig(ctx = {}) {
  const runtimeConfig = getRuntimeConfigFromPluginContext(ctx);
  if (runtimeConfig) return runtimeConfig;
  if (typeof ctx?.read?.config === 'function') return ctx.read.config();
  return ctx?.config || null;
}

async function readPluginProgress(ctx = {}) {
  const runtimeProgress = getRuntimeProgressFromPluginContext(ctx);
  if (runtimeProgress) return runtimeProgress;
  if (typeof ctx?.read?.progress === 'function') return ctx.read.progress();
  return ctx?.progress || null;
}

async function emitBuiltinBridgeTrace(ctx = {}, eventType, message, payload = {}) {
  if (typeof ctx?.stream?.emit === 'function') {
    await ctx.stream.emit({ eventType, level: 'DEBUG', message, payload });
  }
  if (typeof ctx?.telemetry?.emit === 'function') {
    await ctx.telemetry.emit({ eventType, payload });
  }
}

const BUILTIN_PLUGIN_DEFINITIONS = Object.freeze([
  {
    manifest: {
      moduleId: 'builtin.worker.module_forge',
      contractVersion: PLUGIN_CONTRACT_VERSION,
      kind: 'worker',
      hookFamily: 'worker.execute',
      stageIds: ['worker:module_forge'],
      capabilities: ['read.state', 'read.artifacts', 'emit.stream', 'emit.telemetry', 'write.artifacts', 'dispatch.worker_backend', 'notify.operator'],
      configSchema: CONFIG_SCHEMA_ANY_OBJECT,
      sourceType: 'builtin',
      trustTier: 'trusted',
      displayName: 'Built-in module Forge worker',
      description: 'Current module Forge worker execution wired through the startup registry seam.',
      defaultEnabled: true,
    },
    implementation: {
      execute: async (input = {}, ctx = {}) => {
        const config = await readPluginConfig(ctx);
        await emitBuiltinBridgeTrace(ctx, 'plugin.worker.module_forge.bridge_invoked', 'Invoking built-in module Forge worker through PluginContextV1', {
          stageId: 'worker:module_forge',
          moduleId: input?.ids?.moduleId || null,
          attempt: input?.ids?.attempt ?? null,
        });
        const legacyResult = await ctx.workerBackend.dispatch({
          workerType: 'module_forge',
          moduleId: input?.ids?.moduleId || null,
          attempt: input?.ids?.attempt ?? null,
        });
        return coerceModuleForgeWorkerControlResult(config, input, legacyResult, { stageId: 'worker:module_forge' });
      },
    },
    sourceRef: 'builtin:agents/orchestration.js',
    implementationRef: 'agents/orchestration.js#runModuleForgeWorker',
  },
  {
    manifest: {
      moduleId: 'builtin.worker.module_buster',
      contractVersion: PLUGIN_CONTRACT_VERSION,
      kind: 'worker',
      hookFamily: 'worker.execute',
      stageIds: ['worker:module_buster'],
      capabilities: ['read.state', 'read.artifacts', 'emit.stream', 'emit.telemetry', 'write.artifacts', 'dispatch.worker_backend', 'notify.operator'],
      configSchema: CONFIG_SCHEMA_ANY_OBJECT,
      sourceType: 'builtin',
      trustTier: 'trusted',
      displayName: 'Built-in module Buster worker',
      description: 'Current module Buster worker execution wired through the startup registry seam.',
      defaultEnabled: true,
    },
    implementation: {
      execute: async (input = {}, ctx = {}) => {
        const config = await readPluginConfig(ctx);
        await emitBuiltinBridgeTrace(ctx, 'plugin.worker.module_buster.bridge_invoked', 'Invoking built-in module Buster worker through PluginContextV1', {
          stageId: 'worker:module_buster',
          moduleId: input?.ids?.moduleId || null,
          attempt: input?.ids?.attempt ?? null,
          dispatchId: input?.ids?.dispatchId || null,
        });
        const legacyResult = await ctx.workerBackend.dispatch({
          workerType: 'module_buster',
          moduleId: input?.ids?.moduleId || null,
          attempt: input?.ids?.attempt ?? null,
          dispatchId: input?.ids?.dispatchId || null,
        });
        return coerceModuleBusterWorkerControlResult(config, input, legacyResult, { stageId: 'worker:module_buster' });
      },
    },
    sourceRef: 'builtin:agents/orchestration.js',
    implementationRef: 'agents/orchestration.js#runModuleBusterWorker',
  },
  {
    manifest: {
      moduleId: 'builtin.gate.review',
      contractVersion: PLUGIN_CONTRACT_VERSION,
      kind: 'gate',
      hookFamily: 'gate.execute',
      stageIds: ['gate:review'],
      capabilities: ['read.state', 'read.artifacts', 'emit.stream', 'emit.telemetry', 'write.artifacts', 'notify.operator'],
      configSchema: CONFIG_SCHEMA_ANY_OBJECT,
      sourceType: 'builtin',
      trustTier: 'trusted',
      displayName: 'Built-in review gate',
      description: 'Current review gate implementation wired through the startup registry seam.',
      defaultEnabled: true,
    },
    implementation: {
      execute: async (input = {}, ctx = {}) => {
        const [config, progress] = await Promise.all([readPluginConfig(ctx), readPluginProgress(ctx)]);
        await emitBuiltinBridgeTrace(ctx, 'plugin.gate.review.bridge_invoked', 'Invoking built-in review gate through PluginContextV1', {
          stageId: 'gate:review',
          gateId: input?.ids?.gateId || null,
          attempt: input?.ids?.attempt ?? null,
        });
        return runReviewGateStage(config, progress, input?.ids?.gateId, {
          input,
          novaPrompt: input?.executionContext?.novaPrompt || null,
        });
      },
    },
    sourceRef: 'builtin:runners/review-gate-runner.js',
    implementationRef: 'runners/review-gate-runner.js#runReviewGateStage',
  },
  {
    manifest: {
      moduleId: 'builtin.gate.approval',
      contractVersion: PLUGIN_CONTRACT_VERSION,
      kind: 'gate',
      hookFamily: 'gate.execute',
      stageIds: ['gate:approval'],
      capabilities: ['read.state', 'read.artifacts', 'emit.stream', 'emit.telemetry', 'write.artifacts', 'notify.operator', 'request.wait', 'request.signal'],
      configSchema: CONFIG_SCHEMA_ANY_OBJECT,
      sourceType: 'builtin',
      trustTier: 'trusted',
      displayName: 'Built-in approval gate',
      description: 'Current approval gate implementation wired through the startup registry seam.',
      defaultEnabled: true,
    },
    implementation: {
      execute: async (input = {}, ctx = {}) => {
        const [config, progress] = await Promise.all([readPluginConfig(ctx), readPluginProgress(ctx)]);
        await emitBuiltinBridgeTrace(ctx, 'plugin.gate.approval.bridge_invoked', 'Invoking built-in approval gate through PluginContextV1', {
          stageId: 'gate:approval',
          gateId: input?.ids?.gateId || null,
          attempt: input?.ids?.attempt ?? null,
        });
        return runApprovalGateStage(config, progress, input?.ids?.gateId, { input });
      },
    },
    sourceRef: 'builtin:runners/approval-gate-runner.js',
    implementationRef: 'runners/approval-gate-runner.js#runApprovalGateStage',
  },
  {
    manifest: {
      moduleId: 'builtin.gate.buster',
      contractVersion: PLUGIN_CONTRACT_VERSION,
      kind: 'gate',
      hookFamily: 'gate.execute',
      stageIds: ['gate:buster'],
      capabilities: ['read.state', 'read.artifacts', 'emit.stream', 'emit.telemetry', 'write.artifacts', 'notify.operator'],
      configSchema: CONFIG_SCHEMA_ANY_OBJECT,
      sourceType: 'builtin',
      trustTier: 'trusted',
      displayName: 'Built-in Buster gate',
      description: 'Current Buster gate implementation wired through the startup registry seam.',
      defaultEnabled: true,
    },
    implementation: {
      execute: async (input = {}, ctx = {}) => {
        const [config, progress] = await Promise.all([readPluginConfig(ctx), readPluginProgress(ctx)]);
        await emitBuiltinBridgeTrace(ctx, 'plugin.gate.buster.bridge_invoked', 'Invoking built-in Buster gate through PluginContextV1', {
          stageId: 'gate:buster',
          gateId: input?.ids?.gateId || null,
          attempt: input?.ids?.attempt ?? null,
        });
        return runBusterGateStage(config, progress, input?.ids?.gateId, { input });
      },
    },
    sourceRef: 'builtin:runners/buster-gate-runner.js',
    implementationRef: 'runners/buster-gate-runner.js#runBusterGateStage',
  },
  {
    manifest: {
      moduleId: 'builtin.validator.architecture',
      contractVersion: PLUGIN_CONTRACT_VERSION,
      kind: 'validator',
      hookFamily: 'validator.run',
      stageIds: ['validator:architecture'],
      capabilities: ['read.state', 'read.artifacts', 'emit.stream', 'emit.telemetry', 'write.artifacts'],
      configSchema: CONFIG_SCHEMA_ANY_OBJECT,
      sourceType: 'builtin',
      trustTier: 'trusted',
      displayName: 'Built-in architecture validator',
      description: 'Current architecture validator implementation wired through the startup registry seam.',
      defaultEnabled: true,
    },
    implementation: {
      run: async (input = {}, ctx = {}) => {
        const [config, progress] = await Promise.all([readPluginConfig(ctx), readPluginProgress(ctx)]);
        await emitBuiltinBridgeTrace(ctx, 'plugin.validator.architecture.bridge_invoked', 'Invoking built-in architecture validator through PluginContextV1', {
          stageId: 'validator:architecture',
        });
        return runArchitectureValidatorStage(config, progress, { input });
      },
    },
    sourceRef: 'builtin:services/arch-validator.js',
    implementationRef: 'services/arch-validator.js#runArchitectureValidatorStage',
  },
  {
    manifest: {
      moduleId: 'builtin.generator.project_summary',
      contractVersion: PLUGIN_CONTRACT_VERSION,
      kind: 'generator',
      hookFamily: 'generator.run',
      stageIds: ['generator:project_summary'],
      capabilities: ['read.state', 'read.artifacts', 'emit.stream', 'write.artifacts', 'emit.telemetry', 'notify.operator'],
      configSchema: CONFIG_SCHEMA_ANY_OBJECT,
      sourceType: 'builtin',
      trustTier: 'trusted',
      displayName: 'Built-in project summary generator',
      description: 'Current project-summary generator wired through the startup registry seam.',
      defaultEnabled: true,
    },
    implementation: {
      run: async (_input = {}, ctx = {}) => {
        const config = await readPluginConfig(ctx);
        await emitBuiltinBridgeTrace(ctx, 'plugin.generator.project_summary.bridge_invoked', 'Invoking built-in project summary generator through PluginContextV1', {
          stageId: 'generator:project_summary',
        });
        return generateProjectSummary(config);
      },
    },
    sourceRef: 'builtin:services/summary.js',
    implementationRef: 'services/summary.js#generateProjectSummary',
  },
  {
    manifest: {
      moduleId: 'builtin.generator.pipeline_review',
      contractVersion: PLUGIN_CONTRACT_VERSION,
      kind: 'generator',
      hookFamily: 'generator.run',
      stageIds: ['generator:pipeline_review'],
      capabilities: ['read.state', 'read.artifacts', 'emit.stream', 'write.artifacts', 'emit.telemetry', 'notify.operator'],
      configSchema: CONFIG_SCHEMA_ANY_OBJECT,
      sourceType: 'builtin',
      trustTier: 'trusted',
      displayName: 'Built-in pipeline review generator',
      description: 'Current pipeline-review generator wired through the startup registry seam.',
      defaultEnabled: true,
    },
    implementation: {
      run: async (_input = {}, ctx = {}) => {
        const [config, progress] = await Promise.all([readPluginConfig(ctx), readPluginProgress(ctx)]);
        await emitBuiltinBridgeTrace(ctx, 'plugin.generator.pipeline_review.bridge_invoked', 'Invoking built-in pipeline review generator through PluginContextV1', {
          stageId: 'generator:pipeline_review',
        });
        return generatePipelineReview(config, progress);
      },
    },
    sourceRef: 'builtin:services/summary.js',
    implementationRef: 'services/summary.js#generatePipelineReview',
  },
  {
    manifest: {
      moduleId: 'builtin.generator.case_study',
      contractVersion: PLUGIN_CONTRACT_VERSION,
      kind: 'generator',
      hookFamily: 'generator.run',
      stageIds: ['generator:case_study'],
      capabilities: ['read.state', 'read.artifacts', 'emit.stream', 'write.artifacts', 'emit.telemetry', 'notify.operator'],
      configSchema: CONFIG_SCHEMA_ANY_OBJECT,
      sourceType: 'builtin',
      trustTier: 'trusted',
      displayName: 'Built-in case study generator',
      description: 'Current case-study generator wired through the startup registry seam.',
      defaultEnabled: true,
    },
    implementation: {
      run: async (_input = {}, ctx = {}) => {
        const [config, progress] = await Promise.all([readPluginConfig(ctx), readPluginProgress(ctx)]);
        await emitBuiltinBridgeTrace(ctx, 'plugin.generator.case_study.bridge_invoked', 'Invoking built-in case study generator through PluginContextV1', {
          stageId: 'generator:case_study',
        });
        return generateCaseStudy(config, progress);
      },
    },
    sourceRef: 'builtin:services/case-study.js',
    implementationRef: 'services/case-study.js#generateCaseStudy',
  },
  ...getBuiltinNotificationPluginDefinitions(),
]);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function cloneManifest(manifest) {
  return {
    ...manifest,
    stageIds: [...manifest.stageIds],
    capabilities: [...manifest.capabilities],
    configSchema: isPlainObject(manifest.configSchema)
      ? { ...manifest.configSchema }
      : manifest.configSchema,
  };
}

function createError(code, message, details = {}) {
  return { code, message, ...details };
}

function pushError(errors, code, message, details = {}) {
  errors.push(createError(code, message, details));
}

function formatErrorList(errors) {
  return errors.map((error) => `  - [${error.code}] ${error.message}`).join('\n');
}

function assertBoolean(value, label, errors, code = PLUGIN_REJECTION_CODES.REGISTRY_MODULE_CONFIG_INVALID) {
  if (typeof value !== 'boolean') {
    pushError(errors, code, `${label} must be a boolean`);
    return false;
  }
  return true;
}

function normalizeModuleOverrides(modulesInput, errors) {
  if (modulesInput === undefined) return {};
  if (!isPlainObject(modulesInput)) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MODULE_CONFIG_INVALID, 'config.plugins.modules must be an object keyed by moduleId');
    return {};
  }

  const normalized = {};
  for (const [moduleId, rawOverride] of Object.entries(modulesInput)) {
    if (!isPlainObject(rawOverride)) {
      pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MODULE_CONFIG_INVALID, `config.plugins.modules.${moduleId} must be an object`);
      continue;
    }

    const moduleOverride = {};
    if (rawOverride.enabled !== undefined) {
      if (assertBoolean(rawOverride.enabled, `config.plugins.modules.${moduleId}.enabled`, errors)) {
        moduleOverride.enabled = rawOverride.enabled;
      }
    }

    if (rawOverride.config !== undefined) {
      if (!isPlainObject(rawOverride.config)) {
        pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MODULE_CONFIG_INVALID, `config.plugins.modules.${moduleId}.config must be an object`);
      } else {
        moduleOverride.config = { ...rawOverride.config };
      }
    }

    if (rawOverride.trustOverride !== undefined) {
      if (!PLUGIN_TRUST_TIERS.has(rawOverride.trustOverride)) {
        pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_TRUST_OVERRIDE_INVALID, `config.plugins.modules.${moduleId}.trustOverride must be 'trusted' or 'restricted'`);
      } else {
        moduleOverride.trustOverride = rawOverride.trustOverride;
      }
    }

    normalized[moduleId] = moduleOverride;
  }

  return normalized;
}

function normalizeStageOwners(stageOwnersInput, errors) {
  if (stageOwnersInput === undefined) return {};
  if (!isPlainObject(stageOwnersInput)) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MODULE_CONFIG_INVALID, 'config.plugins.stageOwners must be an object keyed by stageId');
    return {};
  }

  const normalized = {};
  for (const [stageId, moduleId] of Object.entries(stageOwnersInput)) {
    if (typeof moduleId !== 'string' || !moduleId.trim()) {
      pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MODULE_CONFIG_INVALID, `config.plugins.stageOwners.${stageId} must be a non-empty moduleId string`);
      continue;
    }
    normalized[stageId] = moduleId.trim();
  }
  return normalized;
}

function normalizeCapabilityAllowlist(input, errors) {
  if (input === undefined) return {};
  if (!isPlainObject(input)) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MODULE_CONFIG_INVALID, 'config.plugins.restrictedCapabilityAllowlist must be an object keyed by moduleId');
    return {};
  }

  const normalized = {};
  for (const [moduleId, capabilities] of Object.entries(input)) {
    if (!Array.isArray(capabilities)) {
      pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MODULE_CONFIG_INVALID, `config.plugins.restrictedCapabilityAllowlist.${moduleId} must be an array of capability strings`);
      continue;
    }
    const seen = new Set();
    normalized[moduleId] = [];
    for (const capability of capabilities) {
      if (typeof capability !== 'string' || !capability.trim()) {
        pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MODULE_CONFIG_INVALID, `config.plugins.restrictedCapabilityAllowlist.${moduleId} must contain only non-empty capability strings`);
        continue;
      }
      const trimmed = capability.trim();
      if (seen.has(trimmed)) {
        pushError(errors, PLUGIN_CAPABILITY_REJECTION_CODES.CAPABILITY_UNKNOWN, `config.plugins.restrictedCapabilityAllowlist.${moduleId} contains duplicate capability '${trimmed}'`);
        continue;
      }
      if (!allKnownCapabilities().has(trimmed)) {
        pushError(errors, PLUGIN_CAPABILITY_REJECTION_CODES.CAPABILITY_UNKNOWN, `config.plugins.restrictedCapabilityAllowlist.${moduleId} references unknown capability '${trimmed}'`);
        continue;
      }
      seen.add(trimmed);
      normalized[moduleId].push(trimmed);
    }
  }
  return normalized;
}

function normalizeExtraModulePaths(extraModulePathsInput, errors) {
  if (extraModulePathsInput === undefined) return [];
  if (!Array.isArray(extraModulePathsInput)) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_DISCOVERY_PATH_FORBIDDEN, 'config.plugins.extraModulePaths must be an array of explicit absolute paths');
    return [];
  }

  const normalized = [];
  for (const [index, rawPath] of extraModulePathsInput.entries()) {
    if (typeof rawPath !== 'string' || !rawPath.trim()) {
      pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_DISCOVERY_PATH_FORBIDDEN, `config.plugins.extraModulePaths[${index}] must be a non-empty string`);
      continue;
    }
    const trimmed = rawPath.trim();
    if (!path.isAbsolute(trimmed)) {
      pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_DISCOVERY_PATH_FORBIDDEN, `config.plugins.extraModulePaths[${index}] must be an absolute path`);
      continue;
    }
    try {
      normalized.push(validateSafePath(trimmed, `config.plugins.extraModulePaths[${index}]`));
    } catch (error) {
      pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_DISCOVERY_PATH_FORBIDDEN, error.message);
    }
  }
  return normalized;
}

function normalizePluginConfig(pluginConfigInput, errors) {
  if (pluginConfigInput === undefined || pluginConfigInput === null) {
    return {
      enabled: true,
      allowCustomModules: false,
      extraModulePaths: [],
      modules: {},
      stageOwners: {},
      restrictedCapabilityAllowlist: {},
    };
  }

  if (!isPlainObject(pluginConfigInput)) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MODULE_CONFIG_INVALID, 'config.plugins must be an object');
    return {
      enabled: true,
      allowCustomModules: false,
      extraModulePaths: [],
      modules: {},
      stageOwners: {},
      restrictedCapabilityAllowlist: {},
    };
  }

  const normalized = {
    enabled: typeof pluginConfigInput.enabled === 'boolean' ? pluginConfigInput.enabled : true,
    allowCustomModules: typeof pluginConfigInput.allowCustomModules === 'boolean' ? pluginConfigInput.allowCustomModules : false,
    extraModulePaths: normalizeExtraModulePaths(pluginConfigInput.extraModulePaths, errors),
    modules: normalizeModuleOverrides(pluginConfigInput.modules, errors),
    stageOwners: normalizeStageOwners(pluginConfigInput.stageOwners, errors),
    restrictedCapabilityAllowlist: normalizeCapabilityAllowlist(pluginConfigInput.restrictedCapabilityAllowlist, errors),
  };

  if (pluginConfigInput.enabled !== undefined) {
    assertBoolean(pluginConfigInput.enabled, 'config.plugins.enabled', errors);
  }
  if (pluginConfigInput.allowCustomModules !== undefined) {
    assertBoolean(pluginConfigInput.allowCustomModules, 'config.plugins.allowCustomModules', errors);
  }

  if (normalized.extraModulePaths.length > 0 && normalized.allowCustomModules !== true) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_DISCOVERY_PATH_FORBIDDEN, 'config.plugins.extraModulePaths requires config.plugins.allowCustomModules=true');
  }
  if (normalized.extraModulePaths.length > 0) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_DISCOVERY_PATH_FORBIDDEN, 'Custom plugin-module discovery paths are reserved but not implemented yet');
  }

  return normalized;
}

function allKnownCapabilities() {
  return new Set([
    ...PLUGIN_REQUIRED_CAPABILITIES.worker,
    ...PLUGIN_REQUIRED_CAPABILITIES.gate,
    ...PLUGIN_REQUIRED_CAPABILITIES.validator,
    ...PLUGIN_REQUIRED_CAPABILITIES.generator,
    ...PLUGIN_REQUIRED_CAPABILITIES.notification,
    ...PLUGIN_OPTIONAL_CAPABILITIES.worker,
    ...PLUGIN_OPTIONAL_CAPABILITIES.gate,
    ...PLUGIN_OPTIONAL_CAPABILITIES.validator,
    ...PLUGIN_OPTIONAL_CAPABILITIES.generator,
    ...PLUGIN_OPTIONAL_CAPABILITIES.notification,
  ]);
}

function validateManifestConfigSchema(manifest, errors) {
  if (!isPlainObject(manifest.configSchema)) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_CONFIG_SCHEMA_INVALID, `Module '${manifest.moduleId}' must declare an object configSchema envelope`);
    return;
  }
  if (manifest.configSchema.type !== 'object') {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_CONFIG_SCHEMA_INVALID, `Module '${manifest.moduleId}' configSchema.type must be 'object'`);
  }
}

function validateCapabilities(manifest, resolvedTrustTier, capabilityAllowlist, errors) {
  if (!Array.isArray(manifest.capabilities) || manifest.capabilities.length === 0) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_CAPABILITY_DECLARATION_INVALID, `Module '${manifest.moduleId}' must declare at least one capability`);
    return;
  }

  const seen = new Set();
  const knownCapabilities = allKnownCapabilities();
  for (const capability of manifest.capabilities) {
    if (typeof capability !== 'string' || !capability.trim()) {
      pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_CAPABILITY_DECLARATION_INVALID, `Module '${manifest.moduleId}' declared an empty capability`);
      continue;
    }
    if (seen.has(capability)) {
      pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_CAPABILITY_DECLARATION_INVALID, `Module '${manifest.moduleId}' declared duplicate capability '${capability}'`);
      continue;
    }
    seen.add(capability);
    if (!knownCapabilities.has(capability)) {
      pushError(errors, PLUGIN_CAPABILITY_REJECTION_CODES.CAPABILITY_UNKNOWN, `Module '${manifest.moduleId}' declared unknown capability '${capability}'`);
      continue;
    }
    if (PLUGIN_FORBIDDEN_CAPABILITIES[manifest.kind].includes(capability)) {
      pushError(errors, PLUGIN_CAPABILITY_REJECTION_CODES.CAPABILITY_FORBIDDEN_FOR_KIND, `Module '${manifest.moduleId}' kind '${manifest.kind}' cannot declare '${capability}'`);
      continue;
    }
  }

  for (const required of PLUGIN_REQUIRED_CAPABILITIES[manifest.kind]) {
    if (!seen.has(required)) {
      pushError(errors, PLUGIN_CAPABILITY_REJECTION_CODES.CAPABILITY_REQUIRED_MISSING, `Module '${manifest.moduleId}' must declare required capability '${required}'`);
    }
  }

  if (resolvedTrustTier === 'restricted') {
    const allowlisted = new Set(capabilityAllowlist[manifest.moduleId] || []);
    for (const gated of PLUGIN_OPTIONAL_CAPABILITIES[manifest.kind]) {
      if (!seen.has(gated)) continue;
      if (!allowlisted.has(gated)) {
        pushError(errors, PLUGIN_CAPABILITY_REJECTION_CODES.CAPABILITY_RESTRICTED_NOT_ALLOWLISTED, `Restricted module '${manifest.moduleId}' requested gated capability '${gated}' without allowlist approval`);
      }
    }
    if (seen.has('dispatch.worker_backend')) {
      pushError(errors, PLUGIN_CAPABILITY_REJECTION_CODES.CAPABILITY_FORBIDDEN_FOR_TRUST_TIER, `Restricted module '${manifest.moduleId}' cannot declare 'dispatch.worker_backend'`);
    }
  }
}

function validateManifest(definition, errors) {
  const manifest = definition?.manifest;
  if (!isPlainObject(manifest)) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MANIFEST_INVALID, 'Discovered plugin definition is missing a manifest object');
    return false;
  }

  if (typeof manifest.moduleId !== 'string' || !manifest.moduleId.trim()) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MANIFEST_INVALID, 'Discovered plugin definition is missing a non-empty moduleId');
  }
  if (manifest.contractVersion !== PLUGIN_CONTRACT_VERSION) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_CONTRACT_VERSION_UNSUPPORTED, `Module '${manifest.moduleId || '<unknown>'}' must declare contractVersion '${PLUGIN_CONTRACT_VERSION}'`);
  }
  if (!PLUGIN_KINDS.has(manifest.kind)) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MANIFEST_INVALID, `Module '${manifest.moduleId || '<unknown>'}' declared unknown kind '${manifest.kind}'`);
  }
  if (!PLUGIN_HOOK_FAMILIES.has(manifest.hookFamily)) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MANIFEST_INVALID, `Module '${manifest.moduleId || '<unknown>'}' declared unknown hookFamily '${manifest.hookFamily}'`);
  }
  if (PLUGIN_KINDS.has(manifest.kind) && !PLUGIN_ALLOWED_HOOK_FAMILIES[manifest.kind]?.has(manifest.hookFamily)) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_KIND_HOOK_MISMATCH, `Module '${manifest.moduleId || '<unknown>'}' kind '${manifest.kind}' cannot use hookFamily '${manifest.hookFamily}'`);
  }
  if (!Array.isArray(manifest.stageIds) || manifest.stageIds.length === 0) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_STAGE_ID_INVALID, `Module '${manifest.moduleId || '<unknown>'}' must declare at least one stageId`);
  } else {
    const seenStageIds = new Set();
    for (const stageId of manifest.stageIds) {
      if (typeof stageId !== 'string' || !stageId.trim()) {
        pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_STAGE_ID_INVALID, `Module '${manifest.moduleId || '<unknown>'}' declared an empty stageId`);
        continue;
      }
      if (seenStageIds.has(stageId)) {
        pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_STAGE_ID_INVALID, `Module '${manifest.moduleId || '<unknown>'}' declared duplicate stageId '${stageId}'`);
        continue;
      }
      seenStageIds.add(stageId);
      if (!PLUGIN_STAGE_IDS[manifest.kind]?.has(stageId)) {
        pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_STAGE_ID_INVALID, `Module '${manifest.moduleId || '<unknown>'}' kind '${manifest.kind}' cannot claim stageId '${stageId}'`);
      }
    }
  }
  if (!PLUGIN_SOURCE_TYPES.has(manifest.sourceType)) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MANIFEST_INVALID, `Module '${manifest.moduleId || '<unknown>'}' declared unknown sourceType '${manifest.sourceType}'`);
  }
  if (!PLUGIN_TRUST_TIERS.has(manifest.trustTier)) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MANIFEST_INVALID, `Module '${manifest.moduleId || '<unknown>'}' declared unknown trustTier '${manifest.trustTier}'`);
  }
  if (manifest.displayName !== undefined && typeof manifest.displayName !== 'string') {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MANIFEST_INVALID, `Module '${manifest.moduleId || '<unknown>'}' displayName must be a string`);
  }
  if (manifest.description !== undefined && typeof manifest.description !== 'string') {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MANIFEST_INVALID, `Module '${manifest.moduleId || '<unknown>'}' description must be a string`);
  }
  if (manifest.defaultEnabled !== undefined && typeof manifest.defaultEnabled !== 'boolean') {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MANIFEST_INVALID, `Module '${manifest.moduleId || '<unknown>'}' defaultEnabled must be a boolean`);
  }
  if (manifest.priority !== undefined && typeof manifest.priority !== 'number') {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MANIFEST_INVALID, `Module '${manifest.moduleId || '<unknown>'}' priority must be a number`);
  }

  validateManifestConfigSchema(manifest, errors);
  return true;
}

function validateImplementation(definition, errors) {
  const manifest = definition.manifest;
  const requiredMethod = PLUGIN_METHOD_BY_KIND[manifest.kind];
  if (!requiredMethod) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_IMPLEMENTATION_MISSING, `Module '${manifest.moduleId}' kind '${manifest.kind}' has no registered implementation method mapping`);
    return;
  }
  if (!isPlainObject(definition.implementation) || typeof definition.implementation[requiredMethod] !== 'function') {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_IMPLEMENTATION_MISSING, `Module '${manifest.moduleId}' must implement '${requiredMethod}(input, ctx)'`);
  }
}

function validateModuleConfigOverride(moduleId, moduleConfig, manifest, errors) {
  if (!moduleConfig || Object.keys(moduleConfig).length === 0) return;
  if (!isPlainObject(moduleConfig)) {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MODULE_CONFIG_INVALID, `config.plugins.modules.${moduleId}.config must be an object`);
    return;
  }
  if (!isPlainObject(manifest.configSchema) || manifest.configSchema.type !== 'object') {
    pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MODULE_CONFIG_INVALID, `Module '${moduleId}' cannot validate config because its configSchema is invalid`);
  }
}

function buildStageOwnerIndex(normalizedConfig, resolvedRecords, errors) {
  if (normalizedConfig.enabled === false) return {};

  const candidatesByStage = {};
  const decisionStages = [];

  for (const record of Object.values(resolvedRecords)) {
    if (!record.enabled) continue;
    for (const stageId of record.resolvedStageIds) {
      const hookFamily = record.manifest.hookFamily;
      candidatesByStage[hookFamily] ??= {};
      candidatesByStage[hookFamily][stageId] ??= [];
      candidatesByStage[hookFamily][stageId].push(record);
      if (record.manifest.kind !== 'notification') decisionStages.push({ hookFamily, stageId });
    }
  }

  const stageOwners = {};
  const explicitSelections = normalizedConfig.stageOwners;
  for (const [stageId, moduleId] of Object.entries(explicitSelections)) {
    const ownerRecord = resolvedRecords[moduleId];
    if (!ownerRecord) {
      pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_STAGE_OWNER_UNKNOWN, `config.plugins.stageOwners.${stageId} references unknown module '${moduleId}'`);
      continue;
    }
    if (!ownerRecord.enabled) {
      pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_STAGE_OWNER_DISABLED, `config.plugins.stageOwners.${stageId} references disabled module '${moduleId}'`);
      continue;
    }
    if (!ownerRecord.resolvedStageIds.includes(stageId)) {
      pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_STAGE_OWNER_UNKNOWN, `config.plugins.stageOwners.${stageId} cannot select module '${moduleId}' because it does not claim that stage`);
      continue;
    }
    const hookFamily = ownerRecord.manifest.hookFamily;
    if (!PLUGIN_STAGE_IDS[ownerRecord.manifest.kind]?.has(stageId)) {
      pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_STAGE_ID_INVALID, `config.plugins.stageOwners.${stageId} is not a valid stage id for kind '${ownerRecord.manifest.kind}'`);
      continue;
    }
    stageOwners[hookFamily] ??= {};
    stageOwners[hookFamily][stageId] = ownerRecord;
  }

  for (const [hookFamily, stageMap] of Object.entries(candidatesByStage)) {
    stageOwners[hookFamily] ??= {};
    for (const [stageId, candidates] of Object.entries(stageMap)) {
      if (candidates.every((candidate) => candidate?.manifest?.kind === 'notification')) {
        continue;
      }
      if (stageOwners[hookFamily][stageId]) continue;
      if (candidates.length === 1) {
        stageOwners[hookFamily][stageId] = candidates[0];
        continue;
      }
      if (candidates.length > 1) {
        pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_STAGE_OWNER_CONFLICT, `Stage '${stageId}' in hookFamily '${hookFamily}' has ${candidates.length} enabled owners but no explicit config.plugins.stageOwners selection`);
      }
    }
  }

  for (const { hookFamily, stageId } of decisionStages) {
    if (!stageOwners[hookFamily]?.[stageId]) {
      pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_STAGE_OWNER_MISSING, `Stage '${stageId}' in hookFamily '${hookFamily}' ended startup with no enabled owner`);
    }
  }

  return stageOwners;
}

function buildHookIndex(resolvedRecords) {
  const hookIndex = {};
  for (const record of Object.values(resolvedRecords)) {
    hookIndex[record.manifest.hookFamily] ??= {};
    for (const stageId of record.resolvedStageIds) {
      hookIndex[record.manifest.hookFamily][stageId] ??= [];
      hookIndex[record.manifest.hookFamily][stageId].push(record);
    }
  }
  return hookIndex;
}

export function getBuiltinPluginDefinitions() {
  return BUILTIN_PLUGIN_DEFINITIONS.map((definition) => ({
    ...definition,
    manifest: cloneManifest(definition.manifest),
    implementation: { ...definition.implementation },
  }));
}

export function formatPluginRegistryErrors(errors = []) {
  if (!errors.length) return '';
  return `Plugin registry validation failed with ${errors.length} error(s):\n${formatErrorList(errors)}`;
}

export function buildPluginRegistry(pluginConfigInput = {}, opts = {}) {
  const errors = [];
  const normalizedConfig = normalizePluginConfig(pluginConfigInput, errors);
  const builtinModules = Array.isArray(opts.builtinModules) ? opts.builtinModules : getBuiltinPluginDefinitions();
  const discoveredDefinitions = [];
  const discoveredModuleIds = new Set();

  for (const definition of builtinModules) {
    validateManifest(definition, errors);
    if (!definition?.manifest?.moduleId) continue;
    if (discoveredModuleIds.has(definition.manifest.moduleId)) {
      pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MANIFEST_INVALID, `Duplicate moduleId '${definition.manifest.moduleId}' discovered during registry assembly`);
      continue;
    }
    discoveredModuleIds.add(definition.manifest.moduleId);
    discoveredDefinitions.push(definition);
  }

  for (const moduleId of Object.keys(normalizedConfig.modules)) {
    if (!discoveredModuleIds.has(moduleId)) {
      pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MODULE_CONFIG_INVALID, `config.plugins.modules.${moduleId} references a module that was not discovered at startup`);
    }
  }

  for (const moduleId of Object.keys(normalizedConfig.restrictedCapabilityAllowlist)) {
    if (!discoveredModuleIds.has(moduleId)) {
      pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_MODULE_CONFIG_INVALID, `config.plugins.restrictedCapabilityAllowlist.${moduleId} references a module that was not discovered at startup`);
    }
  }

  const records = {};
  for (const definition of discoveredDefinitions) {
    const manifest = cloneManifest(definition.manifest);
    validateImplementation(definition, errors);

    const override = normalizedConfig.modules[manifest.moduleId] || {};
    const resolvedTrustTier = override.trustOverride || manifest.trustTier;
    if (override.trustOverride && !discoveredModuleIds.has(manifest.moduleId)) {
      pushError(errors, PLUGIN_REJECTION_CODES.REGISTRY_TRUST_OVERRIDE_INVALID, `config.plugins.modules.${manifest.moduleId}.trustOverride cannot target an undiscovered module`);
    }
    validateModuleConfigOverride(manifest.moduleId, override.config || {}, manifest, errors);
    validateCapabilities(manifest, resolvedTrustTier, normalizedConfig.restrictedCapabilityAllowlist, errors);

    records[manifest.moduleId] = deepFreeze({
      manifest: deepFreeze(manifest),
      enabled: override.enabled ?? manifest.defaultEnabled ?? true,
      resolvedTrustTier,
      resolvedStageIds: deepFreeze([...manifest.stageIds]),
      sourceRef: definition.sourceRef || `builtin:${manifest.moduleId}`,
      implementationRef: definition.implementationRef || manifest.moduleId,
      implementation: deepFreeze({ ...definition.implementation }),
      config: deepFreeze({ ...(override.config || {}) }),
    });
  }

  const stageOwners = buildStageOwnerIndex(normalizedConfig, records, errors);
  const hookIndex = buildHookIndex(records);

  const registry = deepFreeze({
    contractVersion: PLUGIN_CONTRACT_VERSION,
    enabled: normalizedConfig.enabled,
    config: deepFreeze({ ...normalizedConfig }),
    records: deepFreeze({ ...records }),
    hookIndex: deepFreeze(hookIndex),
    stageOwners: deepFreeze(stageOwners),
    summary: deepFreeze({
      discoveredModules: Object.keys(records).length,
      enabledModules: Object.values(records).filter((record) => record.enabled).length,
      stageOwnerCount: Object.values(stageOwners).reduce((total, stageMap) => total + Object.keys(stageMap).length, 0),
    }),
  });

  if (opts.throwOnError !== false && errors.length > 0) {
    throw new Error(formatPluginRegistryErrors(errors));
  }

  return { normalizedConfig, registry, errors };
}

export function getPluginRegistry(config) {
  return config?._pluginRegistry || null;
}

function resolveRegistryObject(configOrRegistry) {
  return configOrRegistry?.stageOwners ? configOrRegistry : getPluginRegistry(configOrRegistry);
}

export function requirePluginRegistry(configOrRegistry) {
  const registry = resolveRegistryObject(configOrRegistry);
  if (!registry) {
    throw new Error('Pipeline plugin registry is missing. loadConfig() must assemble and freeze the startup registry before execution.');
  }
  if (registry.enabled === false) {
    throw new Error('Pipeline plugin registry is disabled. Decision-bearing stages cannot execute without the startup registry.');
  }
  return registry;
}

export function resolveStageOwner(configOrRegistry, hookFamily, stageId) {
  const registry = resolveRegistryObject(configOrRegistry);
  if (!registry) return null;
  if (registry.enabled === false) return null;
  return registry.stageOwners?.[hookFamily]?.[stageId] || null;
}

export function requireStageOwner(configOrRegistry, hookFamily, stageId) {
  const registry = requirePluginRegistry(configOrRegistry);
  const record = registry.stageOwners?.[hookFamily]?.[stageId] || null;
  if (!record) {
    throw new Error(`No registered plugin owner found for hookFamily '${hookFamily}' stage '${stageId}' in the startup-frozen registry.`);
  }
  return record;
}

export function resolveStageHandler(configOrRegistry, hookFamily, stageId, methodName = null) {
  const record = resolveStageOwner(configOrRegistry, hookFamily, stageId);
  if (!record) return null;
  const resolvedMethodName = methodName || PLUGIN_METHOD_BY_KIND[record.manifest.kind] || null;
  if (!resolvedMethodName) return null;
  return record.implementation?.[resolvedMethodName] || null;
}

export function requireStageHandler(configOrRegistry, hookFamily, stageId, methodName = null) {
  const record = requireStageOwner(configOrRegistry, hookFamily, stageId);
  const resolvedMethodName = methodName || PLUGIN_METHOD_BY_KIND[record.manifest.kind] || null;
  if (!resolvedMethodName) {
    throw new Error(`No registry method mapping found for module '${record.manifest.moduleId}' at hookFamily '${hookFamily}' stage '${stageId}'.`);
  }
  const handler = record.implementation?.[resolvedMethodName] || null;
  if (typeof handler !== 'function') {
    throw new Error(`Registered module '${record.manifest.moduleId}' does not implement '${resolvedMethodName}' for hookFamily '${hookFamily}' stage '${stageId}'.`);
  }
  return { record, handler, methodName: resolvedMethodName };
}

export function resolveHookListeners(configOrRegistry, hookFamily, stageId = hookFamily) {
  const registry = configOrRegistry?.hookIndex ? configOrRegistry : getPluginRegistry(configOrRegistry);
  if (!registry) return [];
  if (registry.enabled === false) return [];
  const records = registry.hookIndex?.[hookFamily]?.[stageId] || [];
  return [...records]
    .filter((record) => record?.enabled)
    .sort((left, right) => {
      const leftPriority = Number(left?.manifest?.priority ?? 0);
      const rightPriority = Number(right?.manifest?.priority ?? 0);
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      return String(left?.manifest?.moduleId || '').localeCompare(String(right?.manifest?.moduleId || ''));
    });
}
