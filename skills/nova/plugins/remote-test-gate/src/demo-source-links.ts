import type { FileNovaGateImportStore } from '@kubeclaw/nova-core';
type Verified=Awaited<ReturnType<FileNovaGateImportStore['readVerifiedResult']>>;
/** Image and manifest must be actual outputs of this source-bound final execution. */
export function assertDemoSourceLinks(verified:Verified,deploymentNodeId:string,image:string,manifestDigest:string) {
  const incoming=(input:string)=>{
    const links=verified.source.plan.links.filter(link=>link.to.nodeId===deploymentNodeId&&link.to.input===input);
    if(links.length!==1)throw new Error('DEMO_EVIDENCE_DEPLOYMENT_SOURCE_LINK_REQUIRED');
    const link=links[0]!;
    const node=verified.source.plan.nodes.find(item=>item.id===link.from.nodeId);
    const result=verified.result.nodes.find(item=>item.nodeId===link.from.nodeId);
    const attempt=verified.result.attempts.find(item=>item.attemptId===result?.finalAttemptId);
    if(!node||!attempt||result?.outcome!=='passed'||attempt.executionState!=='completed'||attempt.outcome!=='passed')throw new Error('DEMO_EVIDENCE_DEPLOYMENT_SOURCE_NOT_PASSED');
    const outputs=attempt.outputs.filter(item=>item.name===link.from.output);
    if(outputs.length!==1)throw new Error('DEMO_EVIDENCE_DEPLOYMENT_SOURCE_OUTPUT_REQUIRED');
    return {link,node,output:outputs[0]!};
  };
  const built=incoming('image');
  if(built.link.kind!=='value'||built.output.kind!=='value'||built.output.schemaId!=='kubeclaw.container-image@1'
    || built.node.provider.packageId!=='kubeclaw.container-build'||built.node.provider.contractId!=='kubeclaw.container-build@1')throw new Error('DEMO_EVIDENCE_BUILT_IMAGE_REQUIRED');
  const value=built.output.value as Record<string,unknown>;
  if(value?.schemaVersion!=='container-image.v1'||value.reference!==image||!image.endsWith(`@${String(value.digest)}`))throw new Error('DEMO_EVIDENCE_BUILT_IMAGE_MISMATCH');
  const manifest=incoming('checked-manifest');
  if(manifest.link.kind!=='artifact'||manifest.output.kind!=='artifact'||manifest.output.artifact.mediaType!=='application/vnd.kubeclaw.checked-kubernetes-yaml'
    || manifest.output.artifact.contentDigest!==manifestDigest)throw new Error('DEMO_EVIDENCE_CHECKED_MANIFEST_MISMATCH');
}
