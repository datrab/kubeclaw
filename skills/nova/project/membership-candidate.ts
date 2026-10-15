import {portableJson, sha256Text, type PipelineDefinition, type StageDefinition} from '@kubeclaw/plugin-sdk';
import {validateContractValue} from '@kubeclaw/plugin-foundation/registry/schema';
import {ExecutionGraph} from '../core/execution/graph.ts';

export interface ProjectMembershipGroupCandidate {
  readonly groupId:string;
  readonly kind:'foundation'|'implementation'|'integration'|'delivery';
  readonly stages:readonly {readonly stageId:string;readonly stageType:string;readonly taskInputSha256:string}[];
}

/** Local producer observation, not config-membership.v1 or a published receipt.
 * Called with the actual emitted arrays, never prefix classification at runtime.
 */
export function projectMembershipGroupCandidate(groupId:string,kind:ProjectMembershipGroupCandidate['kind'],stages:readonly StageDefinition[]):ProjectMembershipGroupCandidate {
  return {groupId,kind,stages:stages.map(stage=>({stageId:stage.id,stageType:stage.type,taskInputSha256:sha256Text(portableJson(stage.input))}))};
}

/** Effect-free exact PROJECT membership inspection. Original source/task/R and
 * installed owner/instance authenticity are not established by matching hashes.
 * No new graph codec, transport schema, publication or dispatch permission.
 */
export function inspectProjectMembershipCandidate(definitionInput:PipelineDefinition,groupsInput:readonly ProjectMembershipGroupCandidate[]) {
  const definition=structuredClone(definitionInput),groups=structuredClone(groupsInput);
  validateContractValue('pipelineDefinition',definition);
  const graph=ExecutionGraph.fromDefinition(definition);
  const byStage=new Map<string,string>(),groupIds=new Set<string>();
  for(const group of groups) {
    if(!group.groupId||groupIds.has(group.groupId)||!['foundation','implementation','integration','delivery'].includes(group.kind)||group.stages.length===0) {
      throw new Error('PROJECT_MEMBERSHIP_GROUP_INVALID');
    }
    groupIds.add(group.groupId);
    for(const member of group.stages) {
      if(byStage.has(member.stageId))throw new Error(`PROJECT_MEMBERSHIP_DUPLICATE_STAGE:${member.stageId}`);
      const stage=graph.stage(member.stageId);
      if(member.stageType!==stage.type||member.taskInputSha256!==sha256Text(portableJson(stage.input))) {
        throw new Error(`PROJECT_MEMBERSHIP_STAGE_IDENTITY_MISMATCH:${member.stageId}`);
      }
      byStage.set(member.stageId,group.groupId);
    }
  }
  if(byStage.size!==graph.stages().length)throw new Error('PROJECT_MEMBERSHIP_COVERAGE_MISMATCH');
  const repairRelations=graph.remediationEdges().map(edge=>{
    const originalGroupId=byStage.get(edge.to)!;
    // Current project repair loops stay in their original implementation group.
    // This is not a validator for future explicit cross-group declarations.
    if(byStage.get(edge.from)!==originalGroupId)throw new Error(`PROJECT_MEMBERSHIP_REPAIR_GROUP_MISMATCH:${edge.from}:${edge.to}`);
    return {sourceStage:edge.from,targetStage:edge.to,originalGroupId};
  });
  for(const group of groups) {
    group.stages.forEach(Object.freeze);Object.freeze(group.stages);Object.freeze(group);
  }
  repairRelations.forEach(Object.freeze);
  return Object.freeze({groups:Object.freeze(groups),repairRelations:Object.freeze(repairRelations),
    // Existing v3 snapshot identity only; NOT the proposed task graph v4.
    graph:graph.snapshot(definition.id,definition.maxConcurrency),
    registrationOwnerVerified:false as const,sourceIdentityVerified:false as const,taskAuthorizationVerified:false as const,
    originalRunAuthorizationVerified:false as const,callerAuthorizationVerified:false as const,
    originalAuthorizationVerified:false as const,activationAllowed:false as const});
}
