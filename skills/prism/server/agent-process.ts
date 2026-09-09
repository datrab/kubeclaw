import { spawn,type ChildProcess } from 'node:child_process';
import { sha256Digest,type WorkerAttemptContext,type WorkerAttemptOperation } from '@kubeclaw/worker-core';
import type { WorkerAttemptLimitsV2,WorkerAttemptEnvelopeV2,WorkerResourceObservations } from '@kubeclaw/pipeline-worker-core-contract';

/** Core records explicitly unavailable local child-tree measurements. Gateway/model CPU, memory and cancellation remain external. */
export class AgentProcess implements WorkerAttemptOperation<WorkerAttemptEnvelopeV2> {
  private child:ChildProcess|undefined;
  private closed:Promise<void>|undefined;
  private streamsClosed=false;
  private readonly executable:string;
  private readonly args:string[];
  constructor(executable:string,args:string[]) {this.executable=executable;this.args=args;}
  prepare(_limits:WorkerAttemptLimitsV2){return undefined;}
  execute(context:WorkerAttemptContext<WorkerAttemptEnvelopeV2>) {
    if(this.child)throw new Error('Prism external action has already been started');
    context.signal.throwIfAborted();
    const child=spawn(this.executable,this.args,{stdio:['ignore','pipe','pipe'],detached:true});
    this.child=child;
    this.closed=new Promise(resolve=>child.once('close',()=>{this.streamsClosed=true;resolve();}));
    child.stdout!.on('data',(chunk:Buffer)=>context.log('stdout',chunk));
    child.stderr!.on('data',(chunk:Buffer)=>context.log('stderr',chunk));
    return new Promise<{summary:string;specialistResult:{schemaId:string;schemaDigest:string;values:{localProcessClosed:boolean}};evidence:[];exitCode:number|null;signal:string|null}>((resolve,reject)=>{
      child.once('error',reject);
      child.once('close',(code,signal)=>{
        if(code!==0)return reject(new Error(`OpenClaw CLI closed with code ${code}, signal ${signal}; gateway action requires reconciliation`));
        resolve({summary:'OpenClaw CLI closed; authoritative success requires the fenced Control receipt',specialistResult:{schemaId:'prism-agent-launcher-result.v1',schemaDigest:sha256Digest({type:'object',required:['localProcessClosed']}),values:{localProcessClosed:true}},evidence:[],exitCode:code,signal});
      });
    });
  }
  async terminate() {
    if(!this.child || this.streamsClosed)return;
    const kill=(signal:NodeJS.Signals)=>{try{if(this.child?.pid)process.kill(-this.child.pid,signal);}catch(error){if((error as NodeJS.ErrnoException).code!=='ESRCH')throw error;}};
    kill('SIGTERM');const timer=setTimeout(()=>kill('SIGKILL'),1000);
    try{await this.closed;}finally{clearTimeout(timer);}
  }
  async measure():Promise<WorkerResourceObservations> {
    const unavailable={status:'unavailable' as const,reason:'Complete local CLI child-tree resource accounting is unavailable; bridge parent counters are not child observations'};
    return {cpuTimeMs:{...unavailable},maximumMemoryBytes:{...unavailable},maximumProcesses:{...unavailable}};
  }
}
