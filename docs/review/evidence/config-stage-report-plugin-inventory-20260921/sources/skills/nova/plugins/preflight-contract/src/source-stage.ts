import { captureReviewSubject, canonicalJson, type PluginInvocationContext, type ReviewSource, type StageResult, type ArtifactRef } from '@kubeclaw/plugin-sdk';
import {parseDeclaration, validateDeliveryPaths, type Input} from './declarations.ts';

interface SourceInput {
  readonly source: ReviewSource;
  readonly contract: {
    readonly projectId: string;
    readonly baseRevision: string;
    readonly requiredFiles: readonly string[];
    readonly modules: readonly Input[];
    readonly policy: Readonly<Record<string, unknown>>;
  };
}

function blueprintFiles(module: Input): readonly {path: string; substep: string | null}[] {
  return module.substeps ? module.substeps.map(substep => ({path:`${module.modulePath}/${substep}/FORGE.md`,substep}))
    : [{path:`${module.modulePath}/FORGE.md`,substep:null}];
}

export async function execute(input: SourceInput, context: PluginInvocationContext): Promise<StageResult> {
  try {
    const paths = [...new Set([...input.contract.requiredFiles, ...input.contract.modules.flatMap(module => blueprintFiles(module).map(file => file.path))])].sort();
    if (input.source.projectId !== input.contract.projectId || canonicalJson([...input.source.paths].sort()) !== canonicalJson(paths)) throw new Error('SOURCE_PREFLIGHT_PATHS_MISMATCH');
    const subject = await captureReviewSubject(input.source, input.contract, context);
    if (subject.sourceRevision !== input.contract.baseRevision) throw new Error('SOURCE_PREFLIGHT_BASELINE_CHANGED');
    for (const module of input.contract.modules) {
      const declarations = blueprintFiles(module).flatMap(file => {
        const content = subject.files.find(entry => entry.path === file.path)?.content;
        if (content === undefined) throw new Error('SOURCE_PREFLIGHT_BLUEPRINT_MISSING');
        return parseDeclaration(module.moduleId, file.substep, content);
      });
      const failures = validateDeliveryPaths(module, declarations);
      if (failures.length) throw new Error(`SOURCE_PREFLIGHT_DELIVERY_REQUIRED:${canonicalJson(failures)}`);
    }
    const stored = await context.invoke('artifacts.write', {operation:'put_json',resource:{type:'artifact.object',canonicalId:'source-preflight'},
      payload:{...(subject?.identityEncoding ? {encoding:subject.identityEncoding} : {}), namespace:'kubeclaw.preflight-contract',mediaType:'application/json',value:{schemaVersion:'source-preflight.v1',outcome:'passed',contract:input.contract,subject}}});
    return {schemaVersion:'stage-result.v2',outcome:'passed',artifacts:[stored.artifact as ArtifactRef]};
  } catch (error) {
    return {schemaVersion:'stage-result.v2',outcome:'blocked',artifacts:[],reason:{code:'source_preflight.invalid',message:error instanceof Error ? error.message : String(error)}};
  }
}
