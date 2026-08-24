import { PLUGIN_API_VERSION } from '@kubeclaw/plugin-sdk';

export { activateRegistry } from '@kubeclaw/plugin-foundation/registry/activation';
export { buildRegistry } from '@kubeclaw/plugin-foundation/registry/build';
export { CAPABILITY_IDS, resolveCapabilityGrants } from '@kubeclaw/plugin-foundation/registry/capabilities';
export {
  CAPABILITY_DEFINITIONS,
  validateCapabilityConstraints,
  validateCapabilityInvocationContract,
} from '@kubeclaw/plugin-foundation/registry/capability-vocabulary';
export { discoverPackages } from '@kubeclaw/plugin-foundation/registry/discovery';
export {
  resolveTestProviderConfiguration,
  validateRuntimeRegistrationConfiguration,
  validateTestProviderConfiguration,
} from '@kubeclaw/plugin-foundation/registry/configuration';
export { RegistryError } from '@kubeclaw/plugin-foundation/registry/errors';
export { validateContractValue } from '@kubeclaw/plugin-foundation/registry/schema';
export { createPluginInvocationContext } from '../execution/context.ts';
export { loadPlatformConfig } from '@kubeclaw/plugin-foundation/config/platform';
export type { PlatformConfig } from '@kubeclaw/plugin-foundation/config/platform';
export {
  loadPipelineDefinition,
  recoverPipelineV2,
  reopenBlockedPipelineV2,
  resumePipelineV2,
  runPipelineV2,
  validatePipelineRuntimeV2,
} from '../execution/engine.ts';
export type {
  AdministrativeDecisionAuthenticator,
  AuthenticatedAdministrativePrincipal,
} from '../execution/engine.ts';
export { AdapterRuntime } from '../execution/adapters.ts';
export { RevocableLease } from '../execution/lease.ts';
export { EffectCoordinator, MemoryResourceLockManager } from '../effects/coordinator.ts';
export { FileEffectJournal, MemoryEffectJournal } from '../effects/journal.ts';
export { FileResourceLockManager } from '../effects/locks.ts';
export { ExecutionGraph } from '../execution/graph.ts';
export type { ExecutionGraphSnapshot } from '../execution/graph.ts';
export { PipelineRunner, validatePipelineDefinitionAgainstRegistry } from '../execution/runner.ts';
export type { PipelineRunIdentity, PipelineRunnerOptions, PipelineRunResult } from '../execution/runner.ts';
export { applyStageResult } from '../lifecycle/reducer.ts';
export { recoverStageStates } from '../lifecycle/recovery.ts';
export { ObserverRuntime } from '../telemetry/observers.ts';
export type {
  ObserverDrainResult,
  ObserverDeliveryRecord,
  ObserverFailure,
  ObserverRuntimeOptions,
} from '../telemetry/observers.ts';
export { PluginStateJournal } from '../state/plugins.ts';
export type { PluginStateAppend } from '../state/plugins.ts';
export { installExternalPackage, removeInstalledPackage } from '@kubeclaw/plugin-foundation/packages/install';
export { loadPipelineLintDeclaration, loadPipelineTestScope } from '../test-gates/pipeline.ts';
export { resolveTestPlan, TestPlanResolutionError } from '../test-gates/resolver.ts';
export {
  createRemotePlanJob,
  FileNovaRemotePlanStore,
  HttpRemotePlanTransport,
  NovaRemotePlanDispatcher,
  RemotePlanTransportError,
} from '../test-gates/remote-dispatch.ts';
export type { RemotePlanEvidenceTransport, RemotePlanJobInput, RemotePlanResultTransport, RemotePlanTransport } from '../test-gates/remote-dispatch.ts';
export { FileNovaGateImportStore, FileNovaTestExecutionGraphStore, NovaRemoteGateImporter, NovaRemoteTestGate, gateDecisionStageResult } from '../test-gates/remote-result-import.ts';
export type { NovaTestExecutionGraphV1 } from '../test-gates/remote-result-import.ts';
export type { AgentEvidenceReviewRequestV1, GateDecisionV1, GateDecisionState, GateNodeDecisionV1, GateNodeEffect, RemotePlanTerminalDispatcher } from '../test-gates/remote-result-import.ts';
export { createProductionNovaTestGate, ProductionNovaTestGate,
  type ProductionNovaTestGateExecutionInput } from '../test-gates/production.ts';
export type { ProductionNovaTestGateOptions } from '../test-gates/production.ts';
export { loadProductionNovaTestGate } from '../test-gates/runtime-config.ts';
export { buildCommittedSourceSnapshot } from '../test-gates/source-snapshot.ts';
export type { CommittedSourceSnapshot } from '../test-gates/source-snapshot.ts';
export { NovaTestGateAuthorityRouter, assertLegacyBridgeSelection,
  runLegacyAuthoritativeShadowComparison } from '../test-gates/legacy-bridge.ts';
export type { LegacyAuthoritativeShadowComparison, LegacySuiteMigrationEntry,
  LegacySuiteMigrationLedger } from '../test-gates/legacy-bridge.ts';
export { invokeIsolated } from '@kubeclaw/plugin-foundation/isolation/runner';
export { FileJournal } from '../state/journal.ts';
export type { JournalRecord } from '../state/journal.ts';
export {NovaObservabilityReconciler,persistNovaObservabilityPlan,reconcileNovaObservabilityOnRecovery} from '../observability/reconciler.ts';
export type {ObservabilityGateClass,ReconciliationAction,ReconciliationAttempt,ReconciliationDecision,ReconciliationJournalEntry} from '../observability/reconciler.ts';
export type { LifecycleAction, LifecycleDecision, StageRuntimeState, StageStatus } from '../lifecycle/reducer.ts';
export type { ActivatedRegistry, ActivatedRegistration } from '@kubeclaw/plugin-foundation/registry/activation';
export type {
  DiscoveredPackage,
  DiscoveryOptions,
  RegistrySnapshot,
  TestProviderRegistryEntry,
  TrustPolicy,
} from '@kubeclaw/plugin-foundation/registry/types';
export type { CapabilityId, CapabilityPolicy, GrantedRegistry } from '@kubeclaw/plugin-foundation/registry/capabilities';
export type {
  ConditionDeclaration,
  DependencyDeclaration,
  EvidenceOverride,
  InputLinkDeclaration,
  LoadedPipelineTestScope,
  NodeDeclaration,
  NodeOverride,
  ResolveTestPlanInput,
  ResolverFacts,
  ResolverPolicy,
  SuiteSelection,
  SuiteTemplateV1,
  TestPlanScope,
  TestScopeDeclaration,
} from '../test-gates/types.ts';

export interface CoreKernel {
  readonly apiVersion: typeof PLUGIN_API_VERSION;
  readonly registry: {
    readonly packages: readonly never[];
    readonly registrations: readonly never[];
  };
}

export function createEmptyCoreKernel(): CoreKernel {
  return Object.freeze({
    apiVersion: PLUGIN_API_VERSION,
    registry: Object.freeze({ packages: Object.freeze([]), registrations: Object.freeze([]) }),
  });
}
