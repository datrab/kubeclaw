import type { captureSwarmSettings } from './swarm.ts';
import type { PipelineServiceSelection } from './pipeline-generation.ts';
import type { SwarmSelection } from './swarm-bundle.ts';

export type PipelineBootCapture = ReturnType<typeof captureSwarmSettings> & {
  readonly selectionReceipt: PipelineServiceSelection;
  readonly bootProvenance: Readonly<{
    installedPackageRoot: string;
    expectedReceipt: Readonly<{ imageReceiptDigest: `sha256:${string}`; generationDigest: `sha256:${string}`;
      packageReceiptDigest: `sha256:${string}`; callerId: SwarmSelection['callerId']; role: SwarmSelection['role'];
      serviceInstanceId: string; selectionDigest: `sha256:${string}`; schemaVersion: 'pipeline-expected-delivery.v1' }>;
    imageSelectionDigests: Readonly<Partial<Record<SwarmSelection['callerId'], `sha256:${string}`>>>;
  }>;
};
export function capturePipelineBootReceipts(expectedMount: string, systemRoot: string,
  callerId: SwarmSelection['callerId'], packageRoot: string, runtimeSurface: string): PipelineBootCapture;
export function verifyPipelineBootReceipt(expectedMount: string,
  callerId: SwarmSelection['callerId']): PipelineBootCapture;
export function assertPipelineBootCapture(capture: unknown, callerId: SwarmSelection['callerId']): asserts capture is PipelineBootCapture;

export function captureBusterChildBootReceipts(startupBase: string, systemRoot: string, packageRoot: string): Readonly<{
  capture: PipelineBootCapture; startup: import('./buster-startup-file.mjs').BusterStartupFileCapture;
}>;
export function verifyBusterChildBootReceipt(): ReturnType<typeof captureBusterChildBootReceipts>;

export function captureBusterParentStartupHandoff(parent: PipelineBootCapture): import('./buster-startup.ts').BusterStartupHandoff;
export function captureBusterBootSourceClosure(parent: PipelineBootCapture): Readonly<{
  schemaVersion: 'buster-boot-source-closure.v2';
  expectedReceipt: PipelineBootCapture['bootProvenance']['expectedReceipt'];
  installedPackageRoot: string;
  files: readonly Readonly<{ name: string; digest: `sha256:${string}`; byteLength: number; bytes: string }>[];
}>;
export function publishBusterBootSourceClosure(parent: PipelineBootCapture, archiveRoot: string): Readonly<{
  schemaVersion: 'buster-boot-source-archive-receipt.v2'; file: string; digest: `sha256:${string}`;
  byteLength: number; contentByteLength: number; generationDigest: `sha256:${string}`;
}>;
export function prepareBusterBootSourceClosure(parent: PipelineBootCapture, archiveRoot: string): Readonly<{
  receipt: ReturnType<typeof publishBusterBootSourceClosure>;
  publish: () => ReturnType<typeof publishBusterBootSourceClosure>;
}>;
export function readBusterBootSourceArchive(receipt: ReturnType<typeof publishBusterBootSourceClosure> | Readonly<{
  schemaVersion: 'buster-boot-source-archive-receipt.v1'; file: string; digest: `sha256:${string}`;
  byteLength: number; generationDigest: `sha256:${string}`;
}>):
  Omit<ReturnType<typeof captureBusterBootSourceClosure>, 'schemaVersion'> & Readonly<{
    schemaVersion: 'buster-boot-source-closure.v1' | 'buster-boot-source-closure.v2';
  }>;
export function materializeBusterBootSourceArchive(receipt: Parameters<typeof readBusterBootSourceArchive>[0], destination: string): Readonly<{
  schemaVersion: 'buster-inert-original-source-replay.v1'; destination: string;
  packageRoot: string; systemRoot: string; readerRoot: string;
  expectedReceipt: PipelineBootCapture['bootProvenance']['expectedReceipt'];
}>;

/** Full-input source observation only; deliberately not PipelineBootCapture. */
export type PipelineV10BootSource = Readonly<{
  expected: ReturnType<typeof import('./pipeline-generation.ts').receivePipelineV10ExpectedDelivery>;
  image: ReturnType<typeof import('./pipeline-generation.ts').receivePipelineV10ImageReceipt>;
  selection: ReturnType<typeof import('./pipeline-generation.ts').receivePipelineV10ServiceSelection>;
  owner: ReturnType<typeof import('./pipeline-generation.ts').receiveBusterV10SelectedOwnerProjection> | null;
  activationAllowed: false;
}>;
export function receivePipelineV10BootSource(
  wires: Readonly<{ expected: unknown; image: unknown; selection: unknown; owner: unknown }>,
  inputs: ReturnType<typeof import('./pipeline-input-set.ts').capturePipelineInputSet>,
  services: readonly SwarmSelection[], callerId: SwarmSelection['callerId'],
  packageReceiptDigest: `sha256:${string}`,
): PipelineV10BootSource;
export function capturePipelineV10BootSource(expectedFile: string, systemRoot: string,
  callerId: SwarmSelection['callerId'], packageRoot: string, runtimeSurface: string,
  services: readonly SwarmSelection[]): PipelineV10BootSource & Readonly<{
    inputGenerationSha256: string;
    sourceMemberCount: number;
    installedPackageRoot: string;
    assertCurrent: () => void;
    close: () => void;
  }>;

/** Physical runtime.v2 readback, still not PipelineBootCapture/native authority. */
export function capturePipelineV10BusterRuntimeSource(expectedFile: string, systemRoot: string,
  packageRoot: string, runtimeSurface: string, services: readonly SwarmSelection[]):
  Promise<ReturnType<typeof capturePipelineV10BootSource> & Readonly<{
    runtimeSource: ReturnType<typeof import('./pipeline-v10-receiver.ts').inspectPipelineV10BusterRuntimeSourceIdentity>;
  }>>;
