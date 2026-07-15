import {
  PLUGIN_CONTRACT_VERSION,
  PLUGIN_CONFIG_SCHEMA_ANY_OBJECT,
} from '../constants.ts';
import { getBusterGateControlAdapter, runBusterGateStage } from '../../runners/buster-gate-runner.ts';
import { getReviewGateControlAdapter, runReviewGateStage } from '../../runners/review-gate-runner.ts';
import { getApprovalGateControlAdapter, runApprovalGateStage } from '../../runners/approval-gate-runner.ts';
import { runArchitectureValidatorStage } from '../../services/arch-validator.ts';
import {
  runDeliveryLintValidatorStage,
  runPreCheckValidatorStage,
  runFullLintValidatorStage,
} from '../../services/module-validators.ts';
import { generateProjectSummary, generatePipelineReview } from '../../services/summary.ts';
import { generateCaseStudy } from '../../services/case-study.ts';
import { getBuiltinNotificationPluginDefinitions } from '../../services/notification-contract.ts';
import { getBuiltinTelemetrySinkPluginDefinitions } from '../../services/telemetry-sink-contract.ts';

import { selectDefinedValue, selectTruthyValue } from '../../optional-absence.ts';
type AnyRecord = Record<string, any>;

async function readPluginConfig(ctx: AnyRecord = {}) {
  if (typeof ctx?.coreRuntime?.readConfig === 'function') return ctx.coreRuntime.readConfig();
  throw new Error('Built-in plugin bridge requires explicit coreRuntime config; public PluginContextV1 does not expose read.config()');
}

async function readPluginProgress(ctx: AnyRecord = {}) {
  if (typeof ctx?.coreRuntime?.readProgress === 'function') return ctx.coreRuntime.readProgress();
  throw new Error('Built-in plugin bridge requires explicit coreRuntime progress; public PluginContextV1 does not expose read.progress()');
}

function readPluginDeps(ctx: AnyRecord = {}) {
  return typeof ctx?.coreRuntime?.readDeps === 'function' ? ctx.coreRuntime.readDeps() : null;
}

async function emitBuiltinBridgeTrace(ctx: AnyRecord = {}, eventType: string, message: string, payload: AnyRecord = {}) {
  const pluginId = eventType.startsWith('plugin.') && eventType.endsWith('.bridge_invoked')
    ? `builtin.${eventType.slice('plugin.'.length, -'.bridge_invoked'.length)}`
    : 'builtin.missing';
  const canonicalPayload = {
    plugin_id: pluginId,
    plugin_event: 'bridge_invoked',
    module_id: selectTruthyValue(() => (payload.moduleId), () => (null)),
    gate_id: selectTruthyValue(() => (payload.gateId), () => (null)),
    gate_type: selectTruthyValue(() => (payload.gateType), () => (null)),
    attempt: selectDefinedValue(() => (payload.attempt), () => (null)),
    dispatch_id: selectTruthyValue(() => (payload.dispatchId), () => (null)),
    details: {
      bridge_event_type: eventType,
      message,
      ...payload,
    },
  };
  if (typeof ctx?.telemetry?.emit === 'function') {
    await ctx.telemetry.emit({ eventType: 'plugin.event', payload: canonicalPayload });
  }
}

export const BUILTIN_PLUGIN_DEFINITIONS = Object.freeze([
  {
    manifest: {
      moduleId: 'builtin.worker.module_forge',
      contractVersion: PLUGIN_CONTRACT_VERSION,
      kind: 'worker',
      hookFamily: 'worker.execute',
      stageIds: ['worker:module_forge'],
      capabilities: ['read.state', 'read.artifacts', 'emit.stream', 'emit.telemetry', 'write.artifacts', 'dispatch.worker_runtime', 'notify.operator'],
      configSchema: PLUGIN_CONFIG_SCHEMA_ANY_OBJECT,
      sourceType: 'builtin',
      trustTier: 'trusted',
      displayName: 'Built-in module Forge worker',
      description: 'Current module Forge worker execution wired through the startup registry seam.',
      defaultEnabled: true,
    },
    implementation: {
      execute: async (input: AnyRecord = {}, ctx: AnyRecord = {}) => {
        const config = await readPluginConfig(ctx);
        await emitBuiltinBridgeTrace(ctx, 'plugin.worker.module_forge.bridge_invoked', 'Invoking built-in module Forge worker through PluginContextV1', {
          stageId: 'worker:module_forge',
          moduleId: selectTruthyValue(() => (input?.ids?.moduleId), () => (null)),
          attempt: selectDefinedValue(() => (input?.ids?.attempt), () => (null)),
        });
        return ctx.workerRuntime.dispatch({
          workerType: 'module_forge',
          moduleId: selectTruthyValue(() => (input?.ids?.moduleId), () => (null)),
          attempt: selectDefinedValue(() => (input?.ids?.attempt), () => (null)),
        });
      },
    },
    sourceRef: 'builtin:agents/orchestration.ts',
    implementationRef: 'agents/orchestration.ts#runModuleForgeWorker',
  },
  {
    manifest: {
      moduleId: 'builtin.worker.module_buster',
      contractVersion: PLUGIN_CONTRACT_VERSION,
      kind: 'worker',
      hookFamily: 'worker.execute',
      stageIds: ['worker:module_buster'],
      capabilities: ['read.state', 'read.artifacts', 'emit.stream', 'emit.telemetry', 'write.artifacts', 'dispatch.worker_runtime', 'notify.operator'],
      configSchema: PLUGIN_CONFIG_SCHEMA_ANY_OBJECT,
      sourceType: 'builtin',
      trustTier: 'trusted',
      displayName: 'Built-in module Buster worker',
      description: 'Current module Buster worker execution wired through the startup registry seam.',
      defaultEnabled: true,
    },
    implementation: {
      execute: async (input: AnyRecord = {}, ctx: AnyRecord = {}) => {
        const config = await readPluginConfig(ctx);
        await emitBuiltinBridgeTrace(ctx, 'plugin.worker.module_buster.bridge_invoked', 'Invoking built-in module Buster worker through PluginContextV1', {
          stageId: 'worker:module_buster',
          moduleId: selectTruthyValue(() => (input?.ids?.moduleId), () => (null)),
          attempt: selectDefinedValue(() => (input?.ids?.attempt), () => (null)),
          dispatchId: selectTruthyValue(() => (input?.ids?.dispatchId), () => (null)),
        });
        return ctx.workerRuntime.dispatch({
          workerType: 'module_buster',
          moduleId: selectTruthyValue(() => (input?.ids?.moduleId), () => (null)),
          attempt: selectDefinedValue(() => (input?.ids?.attempt), () => (null)),
          dispatchId: selectTruthyValue(() => (input?.ids?.dispatchId), () => (null)),
        });
      },
    },
    sourceRef: 'builtin:agents/orchestration.ts',
    implementationRef: 'agents/orchestration.ts#runModuleBusterWorker',
  },
  {
    manifest: {
      moduleId: 'builtin.gate.review',
      contractVersion: PLUGIN_CONTRACT_VERSION,
      kind: 'gate',
      hookFamily: 'gate.execute',
      gateTypes: ['review'],
      stageIds: ['gate:review'],
      capabilities: ['read.state', 'read.artifacts', 'emit.stream', 'emit.telemetry', 'write.artifacts', 'notify.operator'],
      configSchema: PLUGIN_CONFIG_SCHEMA_ANY_OBJECT,
      sourceType: 'builtin',
      trustTier: 'trusted',
      displayName: 'Built-in review gate',
      description: 'Current review gate implementation wired through the startup registry seam.',
      defaultEnabled: true,
    },
    implementation: {
      execute: async (input: AnyRecord = {}, ctx: AnyRecord = {}) => {
        const [config, progress] = await Promise.all([readPluginConfig(ctx), readPluginProgress(ctx)]);
        await emitBuiltinBridgeTrace(ctx, 'plugin.gate.review.bridge_invoked', 'Invoking built-in review gate through PluginContextV1', {
          stageId: 'gate:review',
          gateId: selectTruthyValue(() => (input?.ids?.gateId), () => (null)),
          attempt: selectDefinedValue(() => (input?.ids?.attempt), () => (null)),
        });
        return runReviewGateStage(config, progress, input?.ids?.gateId, {
          input,
          novaPrompt: selectTruthyValue(() => (input?.executionContext?.novaPrompt), () => (null)),
          deps: readPluginDeps(ctx),
        });
      },
      gateControl: getReviewGateControlAdapter(),
    },
    sourceRef: 'builtin:runners/review-gate-runner.ts',
    implementationRef: 'runners/review-gate-runner.ts#runReviewGateStage',
  },
  {
    manifest: {
      moduleId: 'builtin.gate.approval',
      contractVersion: PLUGIN_CONTRACT_VERSION,
      kind: 'gate',
      hookFamily: 'gate.execute',
      gateTypes: ['approval'],
      stageIds: ['gate:approval'],
      capabilities: ['read.state', 'read.artifacts', 'emit.stream', 'emit.telemetry', 'write.artifacts', 'notify.operator', 'request.wait', 'request.signal'],
      configSchema: PLUGIN_CONFIG_SCHEMA_ANY_OBJECT,
      sourceType: 'builtin',
      trustTier: 'trusted',
      displayName: 'Built-in approval gate',
      description: 'Current approval gate implementation wired through the startup registry seam.',
      defaultEnabled: true,
    },
    implementation: {
      execute: async (input: AnyRecord = {}, ctx: AnyRecord = {}) => {
        const [config, progress] = await Promise.all([readPluginConfig(ctx), readPluginProgress(ctx)]);
        await emitBuiltinBridgeTrace(ctx, 'plugin.gate.approval.bridge_invoked', 'Invoking built-in approval gate through PluginContextV1', {
          stageId: 'gate:approval',
          gateId: selectTruthyValue(() => (input?.ids?.gateId), () => (null)),
          attempt: selectDefinedValue(() => (input?.ids?.attempt), () => (null)),
        });
        return runApprovalGateStage(config, progress, input?.ids?.gateId, { input, deps: readPluginDeps(ctx) });
      },
      gateControl: getApprovalGateControlAdapter(),
    },
    sourceRef: 'builtin:runners/approval-gate-runner.ts',
    implementationRef: 'runners/approval-gate-runner.ts#runApprovalGateStage',
  },
  {
    manifest: {
      moduleId: 'builtin.gate.buster',
      contractVersion: PLUGIN_CONTRACT_VERSION,
      kind: 'gate',
      hookFamily: 'gate.execute',
      gateTypes: ['buster'],
      stageIds: ['gate:buster'],
      capabilities: ['read.state', 'read.artifacts', 'emit.stream', 'emit.telemetry', 'write.artifacts', 'notify.operator'],
      configSchema: PLUGIN_CONFIG_SCHEMA_ANY_OBJECT,
      sourceType: 'builtin',
      trustTier: 'trusted',
      displayName: 'Built-in Buster gate',
      description: 'Current Buster gate implementation wired through the startup registry seam.',
      defaultEnabled: true,
    },
    implementation: {
      execute: async (input: AnyRecord = {}, ctx: AnyRecord = {}) => {
        const [config, progress] = await Promise.all([readPluginConfig(ctx), readPluginProgress(ctx)]);
        await emitBuiltinBridgeTrace(ctx, 'plugin.gate.buster.bridge_invoked', 'Invoking built-in Buster gate through PluginContextV1', {
          stageId: 'gate:buster',
          gateId: selectTruthyValue(() => (input?.ids?.gateId), () => (null)),
          attempt: selectDefinedValue(() => (input?.ids?.attempt), () => (null)),
        });
        return runBusterGateStage(config, progress, input?.ids?.gateId, { input, deps: readPluginDeps(ctx) });
      },
      gateControl: getBusterGateControlAdapter(),
    },
    sourceRef: 'builtin:runners/buster-gate-runner.ts',
    implementationRef: 'runners/buster-gate-runner.ts#runBusterGateStage',
  },
  {
    manifest: {
      moduleId: 'builtin.validator.architecture',
      contractVersion: PLUGIN_CONTRACT_VERSION,
      kind: 'validator',
      hookFamily: 'validator.run',
      stageIds: ['validator:architecture'],
      capabilities: ['read.state', 'read.artifacts', 'emit.stream', 'emit.telemetry', 'write.artifacts'],
      configSchema: PLUGIN_CONFIG_SCHEMA_ANY_OBJECT,
      sourceType: 'builtin',
      trustTier: 'trusted',
      displayName: 'Built-in architecture validator',
      description: 'Current architecture validator implementation wired through the startup registry seam.',
      defaultEnabled: true,
    },
    implementation: {
      run: async (input: AnyRecord = {}, ctx: AnyRecord = {}) => {
        const [config, progress] = await Promise.all([readPluginConfig(ctx), readPluginProgress(ctx)]);
        await emitBuiltinBridgeTrace(ctx, 'plugin.validator.architecture.bridge_invoked', 'Invoking built-in architecture validator through PluginContextV1', {
          stageId: 'validator:architecture',
        });
        return runArchitectureValidatorStage(config, progress, { input });
      },
    },
    sourceRef: 'builtin:services/arch-validator.ts',
    implementationRef: 'services/arch-validator.ts#runArchitectureValidatorStage',
  },
  {
    manifest: {
      moduleId: 'builtin.validator.delivery_lint',
      contractVersion: PLUGIN_CONTRACT_VERSION,
      kind: 'validator',
      hookFamily: 'validator.run',
      stageIds: ['validator:delivery_lint'],
      capabilities: ['read.state', 'read.artifacts', 'emit.stream', 'emit.telemetry', 'write.artifacts'],
      configSchema: PLUGIN_CONFIG_SCHEMA_ANY_OBJECT,
      sourceType: 'builtin',
      trustTier: 'trusted',
      displayName: 'Built-in delivery lint validator',
      description: 'Core-owned delivery-lint policy executed through the validator registry seam.',
      defaultEnabled: true,
    },
    implementation: {
      run: async (input: AnyRecord = {}, ctx: AnyRecord = {}) => {
        const [config, progress] = await Promise.all([readPluginConfig(ctx), readPluginProgress(ctx)]);
        await emitBuiltinBridgeTrace(ctx, 'plugin.validator.delivery_lint.bridge_invoked', 'Invoking built-in delivery lint validator through PluginContextV1', {
          stageId: 'validator:delivery_lint',
          moduleId: selectTruthyValue(() => (input?.ids?.moduleId), () => (null)),
        });
        return runDeliveryLintValidatorStage(config, progress, input, { stageId: 'validator:delivery_lint', producerType: 'delivery_lint' });
      },
    },
    sourceRef: 'builtin:services/module-validators.ts',
    implementationRef: 'services/module-validators.ts#runDeliveryLintValidatorStage',
  },
  {
    manifest: {
      moduleId: 'builtin.validator.pre_check',
      contractVersion: PLUGIN_CONTRACT_VERSION,
      kind: 'validator',
      hookFamily: 'validator.run',
      stageIds: ['validator:pre_check'],
      capabilities: ['read.state', 'read.artifacts', 'emit.stream', 'emit.telemetry', 'write.artifacts'],
      configSchema: PLUGIN_CONFIG_SCHEMA_ANY_OBJECT,
      sourceType: 'builtin',
      trustTier: 'trusted',
      displayName: 'Built-in pre-check validator',
      description: 'Core-owned pre-Buster lint policy executed through the validator registry seam.',
      defaultEnabled: true,
    },
    implementation: {
      run: async (input: AnyRecord = {}, ctx: AnyRecord = {}) => {
        const [config, progress] = await Promise.all([readPluginConfig(ctx), readPluginProgress(ctx)]);
        await emitBuiltinBridgeTrace(ctx, 'plugin.validator.pre_check.bridge_invoked', 'Invoking built-in pre-check validator through PluginContextV1', {
          stageId: 'validator:pre_check',
          moduleId: selectTruthyValue(() => (input?.ids?.moduleId), () => (null)),
        });
        return runPreCheckValidatorStage(config, progress, input, { stageId: 'validator:pre_check', producerType: 'pre_check' });
      },
    },
    sourceRef: 'builtin:services/module-validators.ts',
    implementationRef: 'services/module-validators.ts#runPreCheckValidatorStage',
  },
  {
    manifest: {
      moduleId: 'builtin.validator.full_lint',
      contractVersion: PLUGIN_CONTRACT_VERSION,
      kind: 'validator',
      hookFamily: 'validator.run',
      stageIds: ['validator:full_lint'],
      capabilities: ['read.state', 'read.artifacts', 'emit.stream', 'emit.telemetry', 'write.artifacts'],
      configSchema: PLUGIN_CONFIG_SCHEMA_ANY_OBJECT,
      sourceType: 'builtin',
      trustTier: 'trusted',
      displayName: 'Built-in full lint validator',
      description: 'Core-owned full lint policy executed through the validator registry seam.',
      defaultEnabled: true,
    },
    implementation: {
      run: async (input: AnyRecord = {}, ctx: AnyRecord = {}) => {
        const [config, progress] = await Promise.all([readPluginConfig(ctx), readPluginProgress(ctx)]);
        await emitBuiltinBridgeTrace(ctx, 'plugin.validator.full_lint.bridge_invoked', 'Invoking built-in full lint validator through PluginContextV1', {
          stageId: 'validator:full_lint',
          moduleId: selectTruthyValue(() => (input?.ids?.moduleId), () => (null)),
        });
        return runFullLintValidatorStage(config, progress, input, { stageId: 'validator:full_lint', producerType: 'full_lint' });
      },
    },
    sourceRef: 'builtin:services/module-validators.ts',
    implementationRef: 'services/module-validators.ts#runFullLintValidatorStage',
  },
  {
    manifest: {
      moduleId: 'builtin.generator.project_summary',
      contractVersion: PLUGIN_CONTRACT_VERSION,
      kind: 'generator',
      hookFamily: 'generator.run',
      stageIds: ['generator:project_summary'],
      capabilities: ['read.state', 'read.artifacts', 'emit.stream', 'write.artifacts', 'emit.telemetry', 'notify.operator'],
      configSchema: PLUGIN_CONFIG_SCHEMA_ANY_OBJECT,
      sourceType: 'builtin',
      trustTier: 'trusted',
      displayName: 'Built-in project summary generator',
      description: 'Current project-summary generator wired through the startup registry seam.',
      defaultEnabled: true,
    },
    implementation: {
      run: async (_input: AnyRecord = {}, ctx: AnyRecord = {}) => {
        const config = await readPluginConfig(ctx);
        await emitBuiltinBridgeTrace(ctx, 'plugin.generator.project_summary.bridge_invoked', 'Invoking built-in project summary generator through PluginContextV1', {
          stageId: 'generator:project_summary',
        });
        return generateProjectSummary(config, { deps: readPluginDeps(ctx) });
      },
    },
    sourceRef: 'builtin:services/summary.ts',
    implementationRef: 'services/summary.ts#generateProjectSummary',
  },
  {
    manifest: {
      moduleId: 'builtin.generator.pipeline_review',
      contractVersion: PLUGIN_CONTRACT_VERSION,
      kind: 'generator',
      hookFamily: 'generator.run',
      stageIds: ['generator:pipeline_review'],
      capabilities: ['read.state', 'read.artifacts', 'emit.stream', 'write.artifacts', 'emit.telemetry', 'notify.operator'],
      configSchema: PLUGIN_CONFIG_SCHEMA_ANY_OBJECT,
      sourceType: 'builtin',
      trustTier: 'trusted',
      displayName: 'Built-in pipeline review generator',
      description: 'Current pipeline-review generator wired through the startup registry seam.',
      defaultEnabled: true,
    },
    implementation: {
      run: async (_input: AnyRecord = {}, ctx: AnyRecord = {}) => {
        const [config, progress] = await Promise.all([readPluginConfig(ctx), readPluginProgress(ctx)]);
        await emitBuiltinBridgeTrace(ctx, 'plugin.generator.pipeline_review.bridge_invoked', 'Invoking built-in pipeline review generator through PluginContextV1', {
          stageId: 'generator:pipeline_review',
        });
        return generatePipelineReview(config, progress, { deps: readPluginDeps(ctx) });
      },
    },
    sourceRef: 'builtin:services/summary.ts',
    implementationRef: 'services/summary.ts#generatePipelineReview',
  },
  {
    manifest: {
      moduleId: 'builtin.generator.case_study',
      contractVersion: PLUGIN_CONTRACT_VERSION,
      kind: 'generator',
      hookFamily: 'generator.run',
      stageIds: ['generator:case_study'],
      capabilities: ['read.state', 'read.artifacts', 'emit.stream', 'write.artifacts', 'emit.telemetry', 'notify.operator'],
      configSchema: PLUGIN_CONFIG_SCHEMA_ANY_OBJECT,
      sourceType: 'builtin',
      trustTier: 'trusted',
      displayName: 'Built-in case study generator',
      description: 'Current case-study generator wired through the startup registry seam.',
      defaultEnabled: true,
    },
    implementation: {
      run: async (_input: AnyRecord = {}, ctx: AnyRecord = {}) => {
        const [config, progress] = await Promise.all([readPluginConfig(ctx), readPluginProgress(ctx)]);
        await emitBuiltinBridgeTrace(ctx, 'plugin.generator.case_study.bridge_invoked', 'Invoking built-in case study generator through PluginContextV1', {
          stageId: 'generator:case_study',
        });
        return generateCaseStudy(config, progress, { deps: readPluginDeps(ctx) });
      },
    },
    sourceRef: 'builtin:services/case-study.ts',
    implementationRef: 'services/case-study.ts#generateCaseStudy',
  },
  ...getBuiltinNotificationPluginDefinitions(),
  ...getBuiltinTelemetrySinkPluginDefinitions(),
]);
