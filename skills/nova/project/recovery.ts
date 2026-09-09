import {parseReviewSource} from '@kubeclaw/plugin-sdk';
import {readRunSnapshot,verifyPinnedGraph} from '@kubeclaw/nova-core/run-snapshots';
import {runRoot} from '@kubeclaw/nova-core/run-root';
import {compileProject} from './compiler.ts';

/** Recompile user input using its recorded source contract, then verify the whole graph. */
export function compileProjectRecovery(project: unknown, storageRoot: string): ReturnType<typeof compileProject> {
  const current=compileProject(project);
  const root=runRoot(storageRoot,current.runId);
  const snapshot=readRunSnapshot(root);
  const sources=snapshot.graph.nodes.filter(stage=>stage.id==='source-preflight' && stage.type==='kubeclaw.validate.source-preflight');
  if(sources.length!==1)throw new Error('PROJECT_RECOVERY_SOURCE_INVALID');
  const source=parseReviewSource(sources[0]!.input.source);
  const compiled=source.identityEncoding ? current : compileProject(project,'legacy');
  verifyPinnedGraph(root,compiled.definition);
  return compiled;
}
