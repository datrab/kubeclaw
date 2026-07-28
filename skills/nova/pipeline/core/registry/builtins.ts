import {
  PLUGIN_CONTRACT_VERSION,
  PLUGIN_CONFIG_SCHEMA_ANY_OBJECT,
} from '../constants.ts';
import { getBusterGateControlAdapter, runBusterGateStage } from '../../runners/buster-gate-runner.ts';
import { getReviewGateControlAdapter, runReviewGateStage } from '../../runners/review-gate-runner.ts';
import { getApprovalGateControlAdapter, runApprovalGateStage } from '../../runners/approval-gate-runner.ts';
import { runArchitectureValidatorStage } from '../../services/arch-validator.ts';
import {
  runPreCheckValidatorStage,
  runFullLintValidatorStage,
} from '../../services/module-lint-validators.ts';
import { generateProjectSummary, generatePipelineReview } from '../../services/summary.ts';
import { getBuiltinNotificationPluginDefinitions } from '../../services/notification-contract.ts';
import { getBuiltinTelemetrySinkPluginDefinitions } from '../../services/telemetry-sink-contract.ts';
import { emitBuiltinBridgeTrace, readPluginConfig, readPluginDeps, readPluginProgress } from './builtin-bridge.ts';
import { getBuiltinWorkerPluginDefinitions } from './builtin-workers.ts';
import { getBuiltinCaseStudyPluginDefinition } from './builtin-case-study.ts';

import { selectDefinedValue, selectTruthyValue } from '../../optional-absence.ts';
type AnyRecord = Record<string, any>;

export const BUILTIN_PLUGIN_DEFINITIONS = Object.freeze([
  ...getBuiltinWorkerPluginDefinitions(),
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
    sourceRef: 'builtin:services/module-lint-validators.ts',
    implementationRef: 'services/module-lint-validators.ts#runPreCheckValidatorStage',
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
    sourceRef: 'builtin:services/module-lint-validators.ts',
    implementationRef: 'services/module-lint-validators.ts#runFullLintValidatorStage',
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
  getBuiltinCaseStudyPluginDefinition(),
  ...getBuiltinNotificationPluginDefinitions(),
  ...getBuiltinTelemetrySinkPluginDefinitions(),
]);
