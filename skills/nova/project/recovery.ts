import {parseReviewSource, portableJson, PORTABLE_JSON_ENCODING, type StageDefinition} from '@kubeclaw/plugin-sdk';
import {readRunSnapshot,verifyPinnedGraph} from '@kubeclaw/nova-core/run-snapshots';
import {runRoot} from '@kubeclaw/nova-core/run-root';
import {compileProject, compileProjectWithCorePolicy} from './compiler.ts';
import { PROJECT_REVIEW_SEMANTIC_ENCODING, type ProjectReviewSemanticMode } from './review-semantics.ts';
import { storedDeliveryManifestMode } from './delivery-manifest.ts';

function storedSemanticMode(stored: readonly StageDefinition[]): ProjectReviewSemanticMode {
  const modes = new Set(stored.filter(stage => stage.type === 'kubeclaw.decision.review').map(stage => {
    portableJson(stage.config);
    if (!Object.hasOwn(stage.config, 'reviewSemanticEncoding')) return 'legacy' as const;
    if (stage.config.reviewSemanticEncoding !== PROJECT_REVIEW_SEMANTIC_ENCODING
      || stage.config.reportArtifactEncoding !== PORTABLE_JSON_ENCODING) throw new Error('PROJECT_RECOVERY_REVIEW_SEMANTICS_INVALID');
    return PROJECT_REVIEW_SEMANTIC_ENCODING;
  }));
  if (modes.size > 1) throw new Error('PROJECT_RECOVERY_REVIEW_SEMANTICS_MIXED');
  return modes.values().next().value ?? 'legacy';
}

function storedReportMode(stored: readonly StageDefinition[]): 'legacy' | typeof PORTABLE_JSON_ENCODING {
  const actual = stored.filter(stage => stage.type === 'kubeclaw.decision.review');
  const modes = new Set(actual.map(stage => {
    portableJson(stage.config);
    if (!Object.hasOwn(stage.config, 'reportArtifactEncoding')) return 'legacy' as const;
    if (stage.config.reportArtifactEncoding !== PORTABLE_JSON_ENCODING) throw new Error('PROJECT_RECOVERY_REPORT_ENCODING_INVALID');
    return PORTABLE_JSON_ENCODING;
  }));
  if (modes.size > 1) throw new Error('PROJECT_RECOVERY_REPORT_ENCODING_MIXED');
  return modes.values().next().value ?? 'legacy';
}

/** Reconstruct source, report and semantic modes independently, then verify the WHOLE graph. */
export function compileProjectRecovery(project: unknown, storageRoot: string): ReturnType<typeof compileProject> {
  // Resolve the retained run before invoking ANY compiler. A legacy skeleton
  // would validate declarations and derive defaults before the original reader
  // and selected compiler policy are known. Only the run locator is needed here;
  // the original compiler below still validates the complete supplied project.
  if (!project || typeof project !== 'object' || Array.isArray(project)) throw new Error('PROJECT_OBJECT_INVALID:project');
  const runId = (project as Record<string, unknown>).runId;
  if (typeof runId !== 'string' || !runId.trim()) throw new Error('PROJECT_TEXT_REQUIRED:runId');
  const root=runRoot(storageRoot,runId);
  const snapshot=readRunSnapshot(root);
  const sources=snapshot.graph.nodes.filter(stage=>stage.id==='source-preflight' && stage.type==='kubeclaw.validate.source-preflight');
  if(sources.length!==1)throw new Error('PROJECT_RECOVERY_SOURCE_INVALID');
  const source=parseReviewSource(sources[0]!.input.source);
  const reportMode=storedReportMode(snapshot.graph.nodes);
  const semanticMode=storedSemanticMode(snapshot.graph.nodes);
  const deliveryManifestMode=storedDeliveryManifestMode(snapshot.graph.nodes);
  // Original snapshot only: never resolve the current Core locator on recovery.
  // The paired version marker makes a partial/unknown capture fail closed.
  const configuration = snapshot.registry.configuration as {corePolicy?: Record<string, unknown>} | undefined;
  const policy = configuration?.corePolicy;
  const selected = Object.hasOwn(snapshot.registry, 'projectCompilerVersion');
  if (selected && snapshot.registry.projectCompilerVersion !== 'project-compiler-runtime.v1') throw new Error('PROJECT_RECOVERY_COMPILER_VERSION_INVALID');
  const compiled = selected
    ? compileProjectWithCorePolicy(project, policy, source.identityEncoding ?? 'legacy', reportMode, semanticMode, deliveryManifestMode)
    : compileProject(project,source.identityEncoding ?? 'legacy',reportMode,semanticMode,deliveryManifestMode);
  const reviewIds = (stages: readonly StageDefinition[]) => stages.filter(stage => stage.type === 'kubeclaw.decision.review').map(stage => stage.id).sort();
  if (portableJson(reviewIds(compiled.definition.stages)) !== portableJson(reviewIds(snapshot.graph.nodes))) throw new Error('PROJECT_RECOVERY_REVIEW_NODES_MISMATCH');
  verifyPinnedGraph(root,compiled.definition);
  return compiled;
}
