// Compile-only ABI coverage: installed source observations must not become boot grants.
import { capturePipelineV10BootSource, capturePipelineV10BusterRuntimeSource, capturePipelineV10BusterPreparationSource, receivePipelineV10BootSource,
  type PipelineBootCapture, type PipelineV10BootSource } from '../../../../skills/common/plugin-runtime/foundation/config/pipeline-boot.mjs';

type Installed = ReturnType<typeof capturePipelineV10BootSource>;
type Received = ReturnType<typeof receivePipelineV10BootSource>;
type Runtime = Awaited<ReturnType<typeof capturePipelineV10BusterRuntimeSource>>;
type Assert<T extends true> = T;
type IsAssignable<A, B> = [A] extends [B] ? true : false;
export type SourceWireABI = Assert<IsAssignable<Received, PipelineV10BootSource>>;
export type InstalledSourceABI = Assert<IsAssignable<Installed, PipelineV10BootSource>>;
export type ActivationDenied = Assert<IsAssignable<Installed['activationAllowed'], false>>;
export type NoBootGrant = Assert<IsAssignable<Installed, PipelineBootCapture> extends false ? true : false>;
export type RetainedLifetime = Assert<IsAssignable<Pick<Installed, 'assertCurrent' | 'close'>,
  { assertCurrent(): void; close(): void }>>;
export type NoWireLifetime = Assert<'assertCurrent' extends keyof Received ? false : true>;
export type RuntimeSourceABI = Assert<IsAssignable<Runtime, Installed>>;
export type RuntimeActivationDenied = Assert<IsAssignable<Runtime['runtimeSource']['activationAllowed'], false>>;
export type RuntimeNoBootGrant = Assert<IsAssignable<Runtime, PipelineBootCapture> extends false ? true : false>;

type Preparation = Awaited<ReturnType<typeof capturePipelineV10BusterPreparationSource>>;
export type PreparationSourceABI = Assert<IsAssignable<Preparation, Installed>>;
export type PreparationActivationDenied = Assert<IsAssignable<Preparation['ownerSource']['activationAllowed'], false>>;
export type PreparationNoBootGrant = Assert<IsAssignable<Preparation, PipelineBootCapture> extends false ? true : false>;
