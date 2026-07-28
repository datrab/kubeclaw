import { PLUGIN_API_VERSION } from '../../sdk/src/index.ts';
export { activateRegistry } from '../registry/activation.ts';
export { buildRegistry } from '../registry/build.ts';
export {
  CAPABILITY_IDS,
  resolveCapabilityGrants,
} from '../registry/capabilities.ts';
export { discoverPackages } from '../registry/discovery.ts';
export { RegistryError } from '../registry/errors.ts';
export { createPluginInvocationContext } from '../execution/context.ts';
export { loadPlatformConfig } from '../config/platform.ts';
export type { PlatformConfig } from '../config/platform.ts';
export {
  loadPipelineDefinition,
  resumePipelineV2,
  runPipelineV2,
} from '../execution/engine.ts';
export { AdapterRuntime } from '../execution/adapters.ts';
export { RevocableLease } from '../execution/lease.ts';
export { EffectCoordinator } from '../effects/coordinator.ts';
export {
  FileEffectJournal,
  MemoryEffectJournal,
} from '../effects/journal.ts';
export { ResourceLockManager } from '../effects/locks.ts';
export { ExecutionGraph } from '../execution/graph.ts';
export { PipelineRunner } from '../execution/runner.ts';
export type {
  PipelineRunnerOptions,
  PipelineRunResult,
} from '../execution/runner.ts';
export { applyStageResult } from '../lifecycle/reducer.ts';
export { recoverStageStates } from '../lifecycle/recovery.ts';
export { ObserverRuntime } from '../telemetry/observers.ts';
export type {
  ObserverDrainResult,
  ObserverFailure,
  ObserverRuntimeOptions,
} from '../telemetry/observers.ts';
export { WaitCoordinator } from '../state/waits.ts';
export { installExternalPackage, removeInstalledPackage } from '../packages/install.ts';
export { invokeIsolated } from '../isolation/runner.ts';
export { FileJournal } from '../state/journal.ts';
export type { JournalRecord } from '../state/journal.ts';
export type {
  LifecycleAction,
  LifecycleDecision,
  StageRuntimeState,
  StageStatus,
} from '../lifecycle/reducer.ts';
export type {
  ActivatedRegistry,
  ActivatedRegistration,
} from '../registry/activation.ts';
export type {
  DiscoveredPackage,
  DiscoveryOptions,
  RegistrySnapshot,
  TrustPolicy,
} from '../registry/types.ts';
export type {
  CapabilityId,
  CapabilityPolicy,
  GrantedRegistry,
} from '../registry/capabilities.ts';

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
    registry: Object.freeze({
      packages: Object.freeze([]),
      registrations: Object.freeze([]),
    }),
  });
}
