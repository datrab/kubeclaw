import { readFile } from 'node:fs/promises';
import { sha256Digest,sha256Text,workerAttemptSpecDigest,workerProfileDigest } from '@kubeclaw/worker-core';
import type { WorkerAttemptEnvelopeV2,WorkerProfileV2,JsonValue } from '@kubeclaw/pipeline-worker-core-contract';

function unavailable(unit:'milliseconds'|'bytes'|'processes') {
  return {scope:'local-cli-process-tree',unit,measurement:'unavailable' as const,
    reason:'Node child_process does not expose trustworthy complete child-tree resource accounting in this deployment'};
}

/** This is the local launcher profile, not the remote gateway/model engine or deterministic Prism engine. */
export async function agentAttempt(job:{id:string;fence:string;expires_at:string|Date;request_digest:string;request:Record<string,unknown>},runnerId:string):Promise<WorkerAttemptEnvelopeV2> {
  const files=['agent-process.ts','agent-attempt.ts','agent-job-runner.mjs','agent-prompt.mjs','preference-prompt.mjs'];
  const content=await Promise.all(files.map(async file=>({file,digest:sha256Text(await readFile(new URL(file,import.meta.url),'utf8'))})));
  const unsignedProfile={schemaVersion:'worker-profile.v2' as const,profileId:'prism-openclaw-launcher-v2',workerType:'prism-agent',coreContractId:'kubeclaw.pipeline-worker-core@2',
    engine:{engineId:'prism-openclaw-launcher',contractId:'kubeclaw.prism-agent-launcher@1',engineVersion:'2.0.0',contentDigest:sha256Digest(content)},capabilities:['openclaw.agent','artifacts.write'],resourceCapabilities:{
      schemaVersion:'worker-resource-capabilities.v1' as const,
      cpuTimeMs:unavailable('milliseconds'),maximumMemoryBytes:unavailable('bytes'),maximumProcesses:unavailable('processes'),
    }};
  const profile:WorkerProfileV2={...unsignedProfile,profileDigest:workerProfileDigest(unsignedProfile)};
  const expiresAt=new Date(job.expires_at).toISOString();const now=new Date().toISOString();
  const unsigned={schemaVersion:'worker-attempt-envelope.v2' as const,protocolVersion:'worker-protocol.v1' as const,
    pipelineRunId:`prism-${job.id}`,moduleId:null,gateId:null,planId:`prism-${job.id}`,nodeId:'openclaw-agent',executionId:job.id,
    attemptId:job.fence,attemptNumber:1,claim:{schemaVersion:'attempt-claim.v1' as const,claimId:job.fence,attemptId:job.fence,generation:1,workerId:runnerId,claimedAt:now,expiresAt},profile,packages:[],grantedCapabilities:[...profile.capabilities],
    limits:{timeoutMs:900_000,cleanupTimeoutMs:10_000,logBytes:1_048_576,resultBytes:1_048_576,evidenceBytes:2_097_152,evidenceFiles:2},
    resourceBudgets:{schemaVersion:'worker-resource-budgets.v1' as const,cpuTimeMs:{state:'unrequested' as const},maximumMemoryBytes:{state:'unrequested' as const},maximumProcesses:{state:'unrequested' as const}},
    inputs:[],operation:{contractId:'kubeclaw.prism-agent-launcher@1',inputSchemaId:'prism-agent-job.v1',inputSchemaDigest:sha256Digest({type:'object',required:['jobId','requestDigest','request']}),values:{jobId:job.id,requestDigest:job.request_digest,request:job.request as JsonValue}},
    cancellationId:job.fence,issuedAt:now,queueDeadline:expiresAt};
  return {...unsigned,attemptSpecDigest:workerAttemptSpecDigest(unsigned)};
}
