import fs from 'node:fs';
import type { AdministrativeReopenDecision, PipelineDefinition, ResumeSignal } from '../../sdk/src/index.ts';
import type { PlatformConfig } from '../config/platform.ts';
import { validateContractValue } from '../registry/schema.ts';
import { prepareRuntime } from './engine-runtime.ts';
import { deepFreeze } from './engine-snapshots.ts';
import { reopenPipeline } from './engine-admin.ts';
import { recoverPipeline, resumePipeline, runNewPipeline } from './engine-run.ts';
import type { PipelineRunResult } from './runner.ts';
import { validatePipelineDefinitionAgainstRegistry } from './runner.ts';

export function loadPipelineDefinition(file: string): PipelineDefinition {
  const value = JSON.parse(fs.readFileSync(fs.realpathSync(file), 'utf8')) as unknown; validateContractValue('pipelineDefinition', value); return value as PipelineDefinition;
}
export interface AuthenticatedAdministrativePrincipal { readonly type: 'operator' | 'administrator'; readonly id: string }
export type AdministrativeDecisionAuthenticator = (decision: AdministrativeReopenDecision) => Promise<AuthenticatedAdministrativePrincipal> | AuthenticatedAdministrativePrincipal;

export async function validatePipelineRuntimeV2(platform: PlatformConfig, definitionInput: PipelineDefinition): Promise<Readonly<{ packageCount: number; stageCount: number; observerCount: number; adapterCount: number }>> {
  const definition = deepFreeze(structuredClone(definitionInput)); const runtime = await prepareRuntime(platform, definition);
  validatePipelineDefinitionAgainstRegistry(definition, runtime.granted);
  return Object.freeze({ packageCount: runtime.snapshot.packages.size, stageCount: runtime.activated.stages.size,
    observerCount: runtime.activated.observers.size, adapterCount: runtime.activated.adapters.size });
}
export function runPipelineV2(platform: PlatformConfig, definition: PipelineDefinition, runId?: string, signal?: AbortSignal): Promise<PipelineRunResult> {
  return runNewPipeline(platform, definition, runId, signal);
}
export function recoverPipelineV2(platform: PlatformConfig, definition: PipelineDefinition, runId: string): Promise<PipelineRunResult> {
  return recoverPipeline(platform, definition, runId);
}
export function resumePipelineV2(platform: PlatformConfig, definition: PipelineDefinition, runId: string, signal: ResumeSignal): Promise<PipelineRunResult> {
  return resumePipeline(platform, definition, runId, signal);
}
export function reopenBlockedPipelineV2(platform: PlatformConfig, definition: PipelineDefinition, decision: AdministrativeReopenDecision, authenticate: AdministrativeDecisionAuthenticator): Promise<PipelineRunResult> {
  return reopenPipeline(platform, definition, decision, authenticate);
}
