import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {WorkerAttemptExecutor,workerAttemptSpecDigest,sha256Digest} from '@kubeclaw/worker-core';
import {AgentProcess} from '../server/agent-process.ts';
import {agentAttempt} from '../server/agent-attempt.ts';
import {ContentAddressedArtifactStore} from '../storage/index.ts';
import {WorkerArtifactClient} from '../server/worker-artifacts.ts';
import {handleInternalArtifact} from '../server/internal-artifacts.ts';

async function boundary(){
 const root=await mkdtemp(join(tmpdir(),'prism-agent-process-'));const artifacts=new ContentAddressedArtifactStore(root);
 const server=createServer((req,res)=>{void handleInternalArtifact(req,res,new URL(req.url!,'http://localhost'),{artifacts,spiffeEnabled:false,workerSecret:'local-process-test',trustedWorkerSpiffeId:'',trustedControlSpiffeId:''}).catch(error=>{res.writeHead(500);res.end(String(error));});});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const port=(server.address() as {port:number}).port;
 const client=new WorkerArtifactClient(new URL(`http://127.0.0.1:${port}`),'local-process-test',false);
 const execute=async(executable:string,args:string[],timeoutMs=5000,logBytes=4096)=>{
  const envelope=await agentAttempt({id:randomUUID(),fence:randomUUID(),expires_at:new Date(Date.now()+60000),request_digest:sha256Digest({input:true}),request:{input:true}},'real-process-test');
  envelope.limits={...envelope.limits,timeoutMs,cleanupTimeoutMs:3000,logBytes};envelope.attemptSpecDigest=workerAttemptSpecDigest(envelope);
  return new WorkerAttemptExecutor({envelope,operation:new AgentProcess(executable,args),storeFullLog:(id,text,{signal})=>client.upload(id,'worker-log','text/plain',Buffer.from(text),signal)}).execute();
 };
 const close=async()=>{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));await rm(root,{recursive:true,force:true});};
 return {execute,close,artifacts};
}
test('original WorkerCore drains a real Node process through close and retains its real HTTP-uploaded log',async()=>{
 const {execute,close,artifacts}=await boundary();try{
  const result=await execute(process.execPath,['-e',"process.stdout.write('original-stdout\\n');process.stderr.write('original-stderr\\n');"]);
  assert.equal(result.state,'completed',JSON.stringify(result));
  const log=result.evidence.find(item=>item.type==='worker-log');assert.ok(log);
  const text=Buffer.from(await artifacts.get(log.artifact.artifactId)).toString();
  assert.match(text,/original-stdout/);assert.match(text,/original-stderr/);
  assert.equal(result.specialistResult?.values.localProcessClosed,true);
 }finally{await close();}
});
test('original WorkerCore times out and terminates a real running process; no gateway success is inferred',async()=>{
 const {execute,close}=await boundary();try{
  const result=await execute(process.execPath,['-e',"console.log('started');setInterval(()=>{},1000)"],100);
  assert.notEqual(result.state,'completed');assert.match(JSON.stringify(result),/TIMEOUT|timed_out/);
 }finally{await close();}
});
test('real process failure and output overflow preserve diagnostics and fail the bounded attempt',async()=>{
 const {execute,close,artifacts}=await boundary();try{
  const failed=await execute(process.execPath,['-e',"console.error('exact external diagnostic');process.exitCode=19"]);
  assert.notEqual(failed.state,'completed');
  const log=failed.evidence.find(item=>item.type==='worker-log');assert.ok(log);
  assert.match(Buffer.from(await artifacts.get(log.artifact.artifactId)).toString(),/exact external diagnostic/);
  const overflow=await execute(process.execPath,['-e',"process.stdout.write('x'.repeat(10000))"],5000,256);
  assert.notEqual(overflow.state,'completed');assert.match(JSON.stringify(overflow),/LOG_LIMIT/);
 }finally{await close();}
});
