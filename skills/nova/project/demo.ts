import type {StageDefinition} from '@kubeclaw/plugin-sdk';
import {validatePipelineTestGateContract,resolvedTestPlanDigest,type ResolvedTestPlanV1} from '@kubeclaw/pipeline-test-gate-contract';
export interface Demo {readonly authNodeId:string;readonly protocol:'json-session.v1';readonly operatorTarget:string;readonly retentionSeconds:number;}
function configuration(value:unknown):Demo {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('PROJECT_DEMO_INVALID');
  const record=value as Record<string,unknown>;
  if(Object.keys(record).some(key=>!['authNodeId','protocol','operatorTarget','retentionSeconds'].includes(key))
    ||typeof record.authNodeId!=='string'||!record.authNodeId||record.authNodeId.length>2048||record.protocol!=='json-session.v1'
    ||typeof record.operatorTarget!=='string'||!/^[a-z0-9][a-z0-9._:-]{0,127}$/u.test(record.operatorTarget))throw new Error('PROJECT_DEMO_INVALID');
  const seconds=retention(record.retentionSeconds);
  return {authNodeId:record.authNodeId,protocol:record.protocol,operatorTarget:record.operatorTarget,retentionSeconds:seconds};
}
function retention(value:unknown):number {
  const seconds=value===undefined?604800:value;
  if(typeof seconds!=='number'||!Number.isSafeInteger(seconds)||seconds<1||seconds>9223372036)throw new Error('PROJECT_DEMO_RETENTION_INVALID');return seconds;
}
function validatePlan(value:unknown,demo:Demo):void {
  validatePipelineTestGateContract('resolvedTestPlan',value);const plan=value as ResolvedTestPlanV1;
  const {planDigest,...unsigned}=plan;if(resolvedTestPlanDigest(unsigned)!==planDigest)throw new Error('PROJECT_DEMO_PLAN_DIGEST_MISMATCH');
  const auth=plan.nodes.find(node=>node.id===demo.authNodeId);
  assertAuthentication(auth,plan,demo);
  const incoming=(nodeId:string,input:string)=>{const links=plan.links.filter(link=>link.to.nodeId===nodeId&&link.to.input===input);
    if(links.length!==1)throw new Error('PROJECT_DEMO_SOURCE_LINK_REQUIRED');const link=links[0]!,node=plan.nodes.find(item=>item.id===link.from.nodeId);
    if(!node||node.skipReason!==null)throw new Error('PROJECT_DEMO_SOURCE_NODE_REQUIRED');return {link,node};};
  const deployment=incoming(demo.authNodeId,'deployment'),credentials=incoming(demo.authNodeId,'credentials'),exposure=incoming(demo.authNodeId,'exposure');
  assertFixtures(deployment,credentials,exposure);
  const source=incoming(exposure.node.id,'deployment');if(source.node.id!==deployment.node.id||source.link.from.output!==deployment.link.from.output)throw new Error('PROJECT_DEMO_EXPOSURE_BINDING_REQUIRED');
  const image=incoming(deployment.node.id,'image'),manifest=incoming(deployment.node.id,'checked-manifest');
  if(image.node.provider.packageId!=='kubeclaw.container-build'||image.link.kind!=='value'||image.link.schemaId!=='kubeclaw.container-image@1'
    ||manifest.link.kind!=='artifact'||manifest.link.mediaType!=='application/vnd.kubeclaw.checked-kubernetes-yaml')throw new Error('PROJECT_DEMO_SOURCE_BUILD_REQUIRED');
}
export function normalizeDemo(value:unknown):Demo|undefined {return value===undefined?undefined:configuration(value);}
export function demoStages(value:unknown,plan:unknown):StageDefinition[] {
  if(value===undefined)return [];
  const demo=configuration(value);validatePlan(plan,demo);
  const execution={maxAttempts:2,maxRemediationCycles:0,maxTechnicalRetries:1,timeoutMs:120000};
  return [{id:'demo-candidate',type:'kubeclaw.demo.candidate',dependsOn:['project-summary'],config:{},input:{manifestStageId:'project-summary',...demo},execution},
    {id:'demo-delivery',type:'kubeclaw.demo.delivery',dependsOn:['demo-candidate'],config:{},input:{candidateStageId:'demo-candidate'},execution},
    {id:'demo-ready',type:'kubeclaw.demo.ready',dependsOn:['demo-delivery'],config:{},input:{candidateStageId:'demo-candidate',deliveryStageId:'demo-delivery'},execution}];
}

function assertAuthentication(auth:ResolvedTestPlanV1['nodes'][number]|undefined,plan:ResolvedTestPlanV1,demo:Demo):void {
  if(!auth||auth.kind!=='test'||auth.mode!=='blocking'||auth.skipReason!==null||auth.provider.packageId!=='kubeclaw.demo-auth-smoke'
    ||auth.provider.contractId!=='kubeclaw.demo-auth-smoke@1'||auth.configuration.values.protocol!==demo.protocol
    ||!plan.coverage?.policy.requiredChecks.some(check=>check.nodeIds.includes(auth.id)))throw new Error('PROJECT_DEMO_BLOCKING_AUTH_REQUIRED');
}

type Linked={readonly link:ResolvedTestPlanV1['links'][number];readonly node:ResolvedTestPlanV1['nodes'][number]};
function assertFixtures(deployment:Linked,credentials:Linked,exposure:Linked):void {
  if(deployment.node.provider.packageId!=='kubeclaw.kubernetes-fixture'||deployment.node.id!==credentials.node.id
    ||deployment.link.kind!=='value'||deployment.link.schemaId!=='kubeclaw.kubernetes-deployment-fixture@1'
    ||credentials.link.kind!=='value'||credentials.link.schemaId!=='kubeclaw.generated-demo-credentials@1'
    ||exposure.node.provider.packageId!=='kubeclaw.tailscale-exposure'||exposure.link.kind!=='value'||exposure.link.schemaId!=='kubeclaw.public-endpoint-fixture@1'
    ||exposure.node.configuration.values.retentionMode!=='await-readiness')throw new Error('PROJECT_DEMO_FIXTURE_BINDING_REQUIRED');
}
