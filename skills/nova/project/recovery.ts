import {parseReviewSource, portableJson, PORTABLE_JSON_ENCODING, type StageDefinition} from '@kubeclaw/plugin-sdk';
import {readRunSnapshot,verifyPinnedGraph} from '@kubeclaw/nova-core/run-snapshots';
import {runRoot} from '@kubeclaw/nova-core/run-root';
import {compileProject} from './compiler.ts';
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

function storedReportMode(expected: readonly StageDefinition[], stored: readonly StageDefinition[]): 'legacy' | typeof PORTABLE_JSON_ENCODING {
  const reviewType = 'kubeclaw.decision.review';
  const expectedIds = expected.filter(stage => stage.type === reviewType).map(stage => stage.id).sort();
  const actual = stored.filter(stage => stage.type === reviewType);
  const actualIds = actual.map(stage => stage.id).sort();
  if (portableJson(actualIds) !== portableJson(expectedIds)) throw new Error('PROJECT_RECOVERY_REVIEW_NODES_MISMATCH');
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
  // This validated legacy skeleton obtains identity and generated Review node set;
  // it is never substituted for the stored graph or used to authorize defaults.
  const skeleton=compileProject(project,'legacy','legacy','legacy','legacy');
  const root=runRoot(storageRoot,skeleton.runId);
  const snapshot=readRunSnapshot(root);
  const sources=snapshot.graph.nodes.filter(stage=>stage.id==='source-preflight' && stage.type==='kubeclaw.validate.source-preflight');
  if(sources.length!==1)throw new Error('PROJECT_RECOVERY_SOURCE_INVALID');
  const source=parseReviewSource(sources[0]!.input.source);
  const reportMode=storedReportMode(skeleton.definition.stages,snapshot.graph.nodes);
  const semanticMode=storedSemanticMode(snapshot.graph.nodes);
  const deliveryManifestMode=storedDeliveryManifestMode(snapshot.graph.nodes);
  const compiled=compileProject(project,source.identityEncoding ?? 'legacy',reportMode,semanticMode,deliveryManifestMode);
  verifyPinnedGraph(root,compiled.definition);
  return compiled;
}
