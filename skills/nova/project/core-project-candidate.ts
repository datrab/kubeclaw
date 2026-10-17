import {PORTABLE_JSON_ENCODING} from '@kubeclaw/plugin-sdk';
import {inspectPipelineV10CoreSourceIdentity} from '@kubeclaw/plugin-foundation/config/pipeline-v10-receiver';
import type {capturePipelineInputSet} from '@kubeclaw/plugin-foundation/config/pipeline-input-set';
import {compileProjectWithCompilerPolicyCandidate} from './compiler.ts';
import type {ProjectReviewSemanticMode} from './review-semantics.ts';
import type {ProjectDeliveryManifestMode} from './delivery-manifest.ts';

type CoreCapture=Pick<ReturnType<typeof capturePipelineInputSet>,'members'|'inputGenerationSha256'|'read'|'assertCurrent'>;

function freezeSnapshot<T>(value:T):T {
  if(value&&typeof value==='object'&&!Object.isFrozen(value)) {
    for(const child of Object.values(value))freezeSnapshot(child);
    Object.freeze(value);
  }
  return value;
}

/** Local, effect-free candidate receiving. NEVER a transport receipt or original
 * owner/source/task/R/caller grant. No caller-supplied policy/profile selector:
 * only the exact selected Core value of the SAME retained capture is consumed.
 * Nova -> Foundation only; no Foundation reader dependency on project compiler.
 * CLI/materializer/prepareRuntime callers are deliberately NOT switched here.
 */
export function inspectCapturedCoreProjectCandidate(task:unknown,inputs:CoreCapture,
  sourceIdentity:'legacy'|typeof PORTABLE_JSON_ENCODING=PORTABLE_JSON_ENCODING,
  reportArtifactEncoding:'legacy'|typeof PORTABLE_JSON_ENCODING=PORTABLE_JSON_ENCODING,
  reviewSemanticMode:ProjectReviewSemanticMode='legacy',deliveryManifestEncoding:ProjectDeliveryManifestMode='legacy') {
  const taskSnapshot=structuredClone(task);
  inputs.assertCurrent();
  const root=JSON.parse(inputs.read('config/pipeline.config.json').toString('utf8'));
  const owner=JSON.parse(inputs.read('config/nova/core.config.json').toString('utf8'));
  const selection=root.novaCoreSelection;
  const settings=owner?.profiles?.[selection?.profileId]?.settings;
  const policy=settings?.projectCompiler;
  if(policy===undefined)throw new Error('CORE_PROJECT_SELECTED_POLICY_REQUIRED');
  // Serialized member bytes are an inspection projection, not historical
  // Python profile digest or new source/installed authorization material.
  const coreInspection=inspectPipelineV10CoreSourceIdentity('projectCompiler',selection,Buffer.from(JSON.stringify(policy)),inputs);
  const platformInspection=inspectPipelineV10CoreSourceIdentity('platform',selection,Buffer.from(JSON.stringify(settings.platform)),inputs);
  const runtimeLocksInspection=inspectPipelineV10CoreSourceIdentity('runtimeLocks',selection,Buffer.from(JSON.stringify(settings.runtimeLocks)),inputs);
  const identityKeys=['rootRawSha256','inputGenerationSha256','ownerRawSha256','ownerSchemaRawSha256'] as const;
  if([platformInspection,runtimeLocksInspection].some(inspection=>identityKeys.some(key=>inspection[key]!==coreInspection[key]))) {
    throw new Error('CORE_PROJECT_CAPTURE_IDENTITY_MISMATCH');
  }
  // Local immutable raw-value snapshot, NOT a new persisted/transport/R receipt.
  // Platform paths stay authored strings; no canonical AUTHOR binding is proven.
  const selectedCore=freezeSnapshot({selection:structuredClone(selection),settings:structuredClone({
    platform:settings.platform,projectCompiler:settings.projectCompiler,runtimeLocks:settings.runtimeLocks})});
  const candidate=compileProjectWithCompilerPolicyCandidate(taskSnapshot,selectedCore.settings.projectCompiler,sourceIdentity,reportArtifactEncoding,
    reviewSemanticMode,deliveryManifestEncoding);
  inputs.assertCurrent();
  return Object.freeze({...candidate,coreInspection,platformInspection,runtimeLocksInspection,selectedCore,sourceClosureVerified:false as const,
    profileDigestVerified:false as const,canonicalAuthorPathVerified:false as const,
    taskAuthorizationVerified:false as const,originalRunAuthorizationVerified:false as const,
    callerAuthorizationVerified:false as const,c3AuthorizationVerified:false as const});
}
