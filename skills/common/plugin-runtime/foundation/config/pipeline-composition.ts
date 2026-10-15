import path from 'node:path';
import { assertPipelineBootCapture, type PipelineBootCapture } from './pipeline-boot.mjs';
import type { BusterSettings, PrismControlSettings, PrismStudioSettings, PrismWorkerSettings,
  PrismIngestionSettings, PrismNativeSettings, PrismNonceDatabaseSettings, PrismSupervisorSettings, WorkerCoreSettings } from './swarm.ts';

/** Typed projections consume only the verified caller capture; they never reload current configuration. */
export function projectStudioSettings(capture: PipelineBootCapture): PrismStudioSettings {
  assertPipelineBootCapture(capture, 'prism-studio');
  return capture.components['prism-studio']!.settings as unknown as PrismStudioSettings;
}

export function projectControlSettings(capture: PipelineBootCapture) {
  assertPipelineBootCapture(capture, 'prism-control');
  const { dispatchTimeoutMs, ...control } = capture.components['prism-control']!.settings as unknown as PrismControlSettings & { dispatchTimeoutMs: number };
  const execution = capture.components['prism-execution']!.settings as unknown as Pick<PrismNativeSettings, 'resourcePolicy' | 'maximumResultBytes' | 'enginePolicy'>;
  return Object.freeze({ control: Object.freeze(control), native: Object.freeze({ ...execution, dispatchTimeoutMs }) });
}

export function projectWorkerSettings(capture: PipelineBootCapture) {
  assertPipelineBootCapture(capture, 'prism-worker');
  const worker = capture.components['prism-worker']!.settings as unknown as { ingress: PrismWorkerSettings; nonceDatabase: PrismNonceDatabaseSettings; supervisor: PrismSupervisorSettings };
  const control = capture.components['prism-control']!.settings as unknown as PrismControlSettings & { dispatchTimeoutMs: number };
  const execution = capture.components['prism-execution']!.settings as unknown as Pick<PrismNativeSettings, 'resourcePolicy' | 'maximumResultBytes' | 'enginePolicy'>;
  return Object.freeze({ maximumArtifactAcknowledgmentBytes: control.maximumArtifactAcknowledgmentBytes, controlInternalUrl: control.controlInternalUrl, worker: worker.ingress, nonceDatabase: worker.nonceDatabase, native: Object.freeze({ ...execution,
    dispatchTimeoutMs: control.dispatchTimeoutMs, supervisor: worker.supervisor }) });
}

export function projectBusterSettings(capture: PipelineBootCapture, caller: 'buster-preparation' | 'buster-runtime'): BusterSettings {
  assertPipelineBootCapture(capture, caller);
  const authored = capture.components['buster-engine']!.settings as unknown as BusterSettings;
  const clusterInvokers = Object.freeze({ ...authored.clusterInvokers,
    shared: Object.freeze({ ...authored.clusterInvokers.shared,
      kubectlExecutable: path.resolve(capture.identity.generationDirectory, authored.clusterInvokers.shared.kubectlExecutable) }) });
  return Object.freeze({ ...authored, clusterInvokers });
}

export function projectBusterWorkerCore(capture: PipelineBootCapture): WorkerCoreSettings {
  assertPipelineBootCapture(capture, 'buster-runtime');
  return capture.components['worker-core']!.settings as unknown as WorkerCoreSettings;
}

/** Ingestion has its own service receipt, not the Control caller's authority. */
export function projectIngestionSettings(capture: PipelineBootCapture): PrismIngestionSettings {
  assertPipelineBootCapture(capture, 'prism-ingestion');
  return (capture.components['prism-control']!.settings as unknown as PrismControlSettings).ingestionServer;
}

export function projectAgentBridgeSettings(capture: PipelineBootCapture) {
  assertPipelineBootCapture(capture, 'prism-agent-bridge');
  return (capture.components['prism-control']!.settings as unknown as PrismControlSettings).agentBridge;
}
