import { readWorkerCorePolicyCapture, workerCoreExecutionOptions } from '@kubeclaw/plugin-foundation/config/worker-core-policy';
import { randomUUID } from 'node:crypto';
import { checkWorkerResourceResultBinding } from '@kubeclaw/pipeline-worker-core-contract';
import { WorkerAttemptExecutor } from '@kubeclaw/worker-core';
import { agentLauncherProfile } from './agent-attempt.ts';
import { AgentProcess } from './agent-process.ts';
import { WorkerArtifactClient } from './worker-artifacts.ts';
import { agentPrompt } from './agent-prompt.mjs';

export async function controlRequest(controlUrl,path,body,signal) {
  const response=await fetch(new URL(path,controlUrl),{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal,redirect:'error'});
  const text=await response.text();
  if(!response.ok)throw new Error(`Prism Control ${path}: HTTP ${response.status}: ${text}`);
  return JSON.parse(text);
}

/** A boot receives a new owner ID. Only the durable store may select provably unstarted work. */
export class AgentJobRunner {
  runnerId=`prism-bridge-${randomUUID()}`;
  stopping=new AbortController();
  active;
  constructor(config){this.config=config;this.controlUrl=config.controlUrl;}
  async tick(){
    if(this.active || this.stopping.signal.aborted)return;
    this.active=this.runOne();
    try{await this.active;}finally{this.active=undefined;}
  }
  async runOne(){
    const {job}=await controlRequest(this.controlUrl,'/v1/agent/jobs/claim',{runnerId:this.runnerId},AbortSignal.timeout(this.config.controlRequestTimeoutMs));
    if(!job)return;
    // Once this claim is durable, any uncertainty is NeedsNova. Never replay a failed launch.
    let outcome;
    try{
      const envelope=job.attempt_envelope;
      if(!envelope || envelope.claim.workerId!==this.runnerId || envelope.attemptId!==job.fence || envelope.executionId!==job.id)throw new Error('Prism accepted attempt identity is missing or conflicts with claim');
      const localProfile=(await agentLauncherProfile());
      if(localProfile.profileDigest!==envelope.profile.profileDigest)throw new Error('Prism local launcher implementation does not match Control accepted profile');
      if(!['prism-agent-job.v3','prism-agent-job.v4'].includes(envelope.operation.inputSchemaId))throw new Error('Prism agent launcher requires centrally assigned settings');
      const workerCore=envelope.operation.inputSchemaId==='prism-agent-job.v4'
        ? readWorkerCorePolicyCapture(envelope.operation.values.workerCore) : undefined;
      if(!workerCore && Object.hasOwn(envelope.operation.values,'workerCore'))throw new Error('PRISM_AGENT_LEGACY_POLICY_OVERRIDE');
      const artifacts=new WorkerArtifactClient(new URL(this.controlUrl),'',true,envelope.operation.values.maximumArtifactAcknowledgmentBytes);
      const executor=new WorkerAttemptExecutor({...workerCoreExecutionOptions(workerCore,'prism-agent'),envelope,operation:new AgentProcess('openclaw',['agent','--agent','main','--session-key',job.session_key,'--message',agentPrompt(job),'--json','--timeout',String(Math.ceil(envelope.limits.timeoutMs / 1000))],envelope.operation.values.terminationGraceMs),signal:this.stopping.signal,receiptNamespace:'prism-agent-launcher',
        storeFullLog:(id,content,{signal})=>artifacts.upload(`${id}-logs`,'worker-log','text/plain',Buffer.from(content),signal)});
      outcome=await executor.execute();
      const binding=checkWorkerResourceResultBinding(envelope,outcome);
      if(!binding.ok)throw new Error(`Prism agent resource receipt binding failed: ${binding.errors.join('; ')}`);
    }catch(error){outcome={state:'errored',error:error instanceof Error?error.message:String(error)};}
    await controlRequest(this.controlUrl,`/v1/agent/jobs/${job.id}/finish`,{fence:job.fence,outcome},AbortSignal.timeout(this.config.controlRequestTimeoutMs));
  }
  async stop(){this.stopping.abort(new Error('Prism bridge is shutting down; external gateway outcome may be unresolved'));await this.active;}
}
