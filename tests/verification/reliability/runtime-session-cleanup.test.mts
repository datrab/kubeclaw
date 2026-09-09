import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { once } from 'node:events';
import { registeredSessionIdentity } from '../../../skills/common/plugins/runtime-dispatch/src/openclaw-session.ts';
import * as core from '../../../skills/nova/core/src/index.ts';

type Mode = 'max-polls' | 'poll-body' | 'parent-abort' | 'late-spawn' | 'cancel-rejected' | 'cancel-body' | 'acp-ack' | 'acp-terminal' | 'wrong-terminal' | 'lost-spawn' | 'acp-lost' | 'wrong-poll-terminal' | 'collision' | 'legacy' | 'ambiguous-spawn' | 'acp-wrong-terminal' | 'contradictory-terminal' | 'missing-task-alias' | 'missing-task-snake' | 'missing-task-records';
async function fixture(mode: Mode) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-session-cleanup-'));
  const owner = new AbortController();
  const requests: Array<{tool: string; args: Record<string, unknown>; idempotencyKey?: string}> = [];
  const timers: NodeJS.Timeout[] = [];
  let identity: Record<string, unknown> | undefined;
  const identities: Record<string, unknown>[] = [];
  let spawned = 0, cancelled = 0, polls = 0, closedBodies = 0;
  let state = 'running', visible = true;
  const server = http.createServer((request, response) => {
    const send = (details: unknown) => {
      response.writeHead(200, {'content-type':'application/json'});
      response.end(JSON.stringify({ok:true,output:{details}}));
    };
    void (async () => {
      assert.equal(request.headers.authorization, 'Bearer local-cleanup-token');
      const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString()); requests.push(body);
      const {tool,args} = body;
      if (tool === 'sessions_spawn') {
        spawned++;
        identity = {taskId:'task:owned',runId:'run:owned',sessionKey:'session:owned',label:args.label,model:args.model};
        if (mode.startsWith('missing-task')) { const accepted={...identity}; delete accepted.taskId; send({status:'accepted',childSessionKey:'session:owned',...accepted}); return; }
        if (mode === 'ambiguous-spawn') { response.destroy(); return; }
        if (mode === 'collision') {
          identity = {...identity, taskId:`task:${spawned}`, runId:`run:${spawned}`, sessionKey:`session:${spawned}`};
          identities.push(identity); response.destroy(); return;
        }
        if (mode === 'lost-spawn' || mode === 'acp-lost') {
          visible=false;response.destroy();
        } else if (mode === 'late-spawn') {
          visible = false;
          timers.push(setTimeout(()=>{visible=true;},40));
          timers.push(setTimeout(()=>send({status:'accepted',childSessionKey:'session:owned',...identity}),90));
          owner.abort(new Error('parent cancelled late spawn'));
        } else send({status:'accepted',childSessionKey:'session:owned',...identity});
      } else if ((tool === 'subagents' && args.action === 'cancel') || tool === 'sessions_send') {
        assert.equal(args.taskId ?? args.sessionKey, mode.startsWith('acp')?'session:owned':identity?.taskId);
        assert.equal(body.idempotencyKey,`cancel:${identity?.runId}`); cancelled++;
        if (mode === 'cancel-rejected') {response.writeHead(503);response.end('cancel unavailable');return;}
        if (mode === 'cancel-body') {
          response.on('close',()=>{closedBodies++;});
          response.writeHead(200,{'content-type':'application/json'});response.write('{');return;
        }
        if (!['acp-ack','wrong-terminal'].includes(mode)) state='cancelled';
        send({status:'ok'});
      } else if ((tool === 'subagents' && args.action === 'list') || tool === 'session_status') {
        if (identity && cancelled===0 && ++polls===1 && ['poll-body','parent-abort'].includes(mode)) {
          response.on('close',()=>{closedBodies++;});
          response.writeHead(200,{'content-type':'application/json'});response.write('{');
          if(mode==='parent-abort') owner.abort(new Error('parent cancelled poll'));
          return;
        }
        if (mode === 'missing-task-alias' && identity) { send({tasks:[{...identity,task_id:'task:foreign',status:'completed'}]}); return; }
        if (mode === 'missing-task-records' && identity) { send({tasks:[{...identity,status:'completed'},{...identity,taskId:'task:foreign',status:'running'}]}); return; }
        if (mode === 'missing-task-snake' && identity) { const entry: Record<string, unknown>={...identity,task_id:identity.taskId,status:state}; delete entry.taskId; send({tasks:[entry]}); return; }
        if (mode === 'contradictory-terminal' && identity) { send({active:[{...identity,status:'completed'}],recent:[{...identity,taskId:'task:foreign',status:'running'}]}); return; }
        if (mode === 'ambiguous-spawn' && identity) { send({active:[identity],recent:[{...identity,taskId:'task:foreign',sessionKey:'session:foreign'}]}); return; }
        if (mode === 'acp-wrong-terminal' && identity) { send({session:{sessionKey:'session:foreign',state:'idle'}}); return; }
        if (mode === 'collision') { send({tasks:identities.map(entry=>({...entry,status:entry===identity?state:'cancelled'}))}); return; }
        if (mode === 'legacy' && !identity) { send({tasks:[{taskId:'task:legacy',runId:'run:legacy',sessionKey:'session:legacy',label:'test-cleanup-regression-d1ba1a3f',model:'test/model',status:'running'}]}); return; }
        send(tool==='session_status'?{state,model:'test/model'}:{tasks:identity&&visible?(((mode==='wrong-terminal'&&cancelled>0)||(mode==='wrong-poll-terminal'&&cancelled===0))?[{...identity,runId:'run:other',taskId:'task:other',sessionKey:'session:other',status:'completed'}]:[{...identity,status:state}]):[]});
      } else {response.writeHead(500);response.end('unexpected gateway tool');}
    })().catch(error=>{response.writeHead(500);response.end(String(error));});
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');server.unref();
  const address=server.address();assert(address&&typeof address!=='string');const origin=`http://127.0.0.1:${address.port}`;
  const roots=['common','nova'].map(role=>path.resolve('skills',role,'plugins'));
  const snapshot=core.buildRegistry(core.discoverPackages({installationRoots:roots,trustPolicy:{trustedBuiltinRoots:roots,
    allowedSourceDigests:new Map(),verifiedAttestations:new Map(),verifierId:'test:runtime-cleanup'}}));
  const runtimeId='kubeclaw.runtime-dispatch:openclaw';
  const granted=core.resolveCapabilityGrants(snapshot,{enabledRegistrations:new Set(['kubeclaw.case-study:case-study']),
    providers:new Map([['artifacts.write','kubeclaw.artifact-store:artifact-store'],['runtime.dispatch',runtimeId],['network.http','kubeclaw.network-http:http'],['secrets.read','kubeclaw.secret-resolver:secrets'],['git.repository.read','kubeclaw.repository-adapter:repository']]),
    grants:new Map([['kubeclaw.case-study:case-study',new Map([['runtime.dispatch',{allowedAgents:['agent']}],['artifacts.write',{allowedNamespaces:['kubeclaw.case-study']}]])],[runtimeId,new Map([['network.http',{allowedOrigins:[origin]}],['secrets.read',{allowedNames:['runtime.token']}],['git.repository.read',{allowedPrefixes:['.']}]])]])});
  const activated=await core.activateRegistry(granted.snapshot,new Set(granted.grants.keys()));
  const secretName=`RUNTIME_CLEANUP_TOKEN_${process.pid}`;process.env[secretName]='local-cleanup-token';
  const configs=new Map<string,Record<string,unknown>>([
    [runtimeId,{targets:{agent:{endpoint:`${origin}/tools/invoke`,tokenSecret:'runtime.token',runtime:mode.startsWith('acp')?'acp':'subagent',
      agentId:'test',agentRole:'test',model:'test/model',cwd:root,repositoryRoot:root,resultPathPrefix:'results',spawnIntervalMs:0,
      pollMs:10,maxPollMs:10,maxPolls:['poll-body','parent-abort'].includes(mode)?20:1,sessionTimeoutMs:80}}}],
    ['kubeclaw.network-http:http',{allowedOrigins:[origin],allowedMethods:['POST'],allowedHeaders:['authorization','content-type'],timeoutMs:1000}],
    ['kubeclaw.secret-resolver:secrets',{environment:{'runtime.token':secretName}}],
    ['kubeclaw.repository-adapter:repository',{repositoryRoot:root}],
    ['kubeclaw.artifact-store:artifact-store',{artifactRoot:path.join(root,'artifacts')}],
  ]);
  const journalPath=path.join(root,'effects.jsonl');
  const create=()=>new core.AdapterRuntime({granted,activated,configs,
    effects:new core.EffectCoordinator(new core.FileEffectJournal(journalPath),undefined,undefined,new core.FileResourceLockManager(path.join(root,'locks'))),
    shutdownTimeoutMs:1000,async emitDomainEvent(){}});
  const runtime=create();await runtime.start();
  const attempt={runId:'run:cleanup',stageId:'runtime',attemptId:'attempt:cleanup',attemptNumber:1};
  const request={operation:'dispatch',resource:{type:'runtime.agent',canonicalId:'agent'},payload:{protocol:'cleanup-regression'}};
  return {root,runtime,owner,create,journalPath,requests,attempt,request,spawned:()=>spawned,cancelled:()=>cancelled,closedBodies:()=>closedBodies,
    async close(){await runtime.shutdown();timers.forEach(clearTimeout);server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));delete process.env[secretName];fs.rmSync(root,{recursive:true,force:true});}};
}

for(const mode of ['max-polls','poll-body','parent-abort','late-spawn','cancel-rejected','cancel-body','acp-ack','acp-terminal','wrong-terminal','lost-spawn','acp-lost','wrong-poll-terminal','ambiguous-spawn','acp-wrong-terminal','contradictory-terminal','missing-task-alias','missing-task-snake','missing-task-records'] as const){
  test(`actual Core/HTTP session cleanup: ${mode}`,async()=>{
    const f=await fixture(mode);
    try{
      const unknown=['cancel-rejected','cancel-body','acp-ack','wrong-terminal','lost-spawn','acp-lost','ambiguous-spawn','acp-wrong-terminal','contradictory-terminal','missing-task-alias','missing-task-records'].includes(mode);
      await assert.rejects(f.runtime.invoke('runtime.dispatch',f.attempt,'dispatch:cleanup',f.request,f.owner.signal),
        unknown?/OPENCLAW_SESSION_CLEANUP_UNRESOLVED/u:/OPENCLAW_SESSION_TERMINAL_CONFIRMED:run:owned/u);
      assert.equal(f.spawned(),1);assert.equal(f.cancelled(),['lost-spawn','acp-lost','ambiguous-spawn','missing-task-alias','missing-task-records'].includes(mode)?0:1);
      const journal=new core.FileEffectJournal(f.journalPath);
      const receipt=await journal.receipt('dispatch:cleanup');assert.equal(receipt?.status,'failed');
      assert.match(receipt?.error?.message??'',unknown?/CLEANUP_UNRESOLVED/u:/TERMINAL_CONFIRMED/u);
      assert.equal((await journal.request('dispatch:cleanup'))?.attempt.attemptId,'attempt:cleanup');
      assert(!fs.readFileSync(f.journalPath,'utf8').includes('local-cleanup-token'));
      const reopened=f.create();await reopened.start();
      try{await assert.rejects(reopened.invoke('runtime.dispatch',f.attempt,'dispatch:cleanup',f.request,new AbortController().signal),/EFFECT_OUTCOME_UNRESOLVED/u);}
      finally{await reopened.shutdown();}
      assert.equal(f.spawned(),1,'durable failed dispatch must not blindly respawn');
      if(['poll-body','parent-abort','cancel-body'].includes(mode)){
        for(let i=0;i<20&&f.closedBodies()===0;i++)await new Promise(resolve=>setTimeout(resolve,10));
        assert(f.closedBodies()>0,'actual response connection closed');
      }
    }finally{await f.close();}
  });
}

test('full dispatch digest separates actual legacy-prefix collisions through Core/HTTP', async () => {
  const ids = ['collision:11329', 'collision:12843'];
  const digests = ids.map(dispatchId => crypto.createHash('sha256').update(`session-v1:attempt:0:payload:${crypto.createHash('sha256').update(JSON.stringify({dispatchId,payload:{protocol:'cleanup-regression'}})).digest('hex')}`).digest());
  assert.equal(digests[0].toString('hex').slice(0,8), 'd1ba1a3f');
  assert.equal(digests[1].toString('hex').slice(0,8), 'd1ba1a3f');
  const f = await fixture('collision');
  try {
    for (const [index,id] of ids.entries()) {
      await assert.rejects(f.runtime.invoke('runtime.dispatch',f.attempt,id,f.request,f.owner.signal), new RegExp(`TERMINAL_CONFIRMED:run:${index+1}`,'u'));
    }
    const labels = f.requests.filter(r=>r.tool==='sessions_spawn').map(r=>String(r.args.label));
    assert.equal(f.spawned(),2); assert.equal(f.cancelled(),2);
    assert.notEqual(labels[0],labels[1]);
    labels.forEach((label,index)=>{assert(label.length<=60);assert(label.endsWith(digests[index].toString('base64url')));});
  } finally { await f.close(); }
});

test('legacy colliding label never authorizes adoption, cancellation or respawn', async () => {
  const f = await fixture('legacy');
  try {
    await assert.rejects(f.runtime.invoke('runtime.dispatch',f.attempt,'collision:11329',f.request,f.owner.signal), /OPENCLAW_LEGACY_SESSION_BINDING_UNRESOLVED/u);
    assert.equal(f.spawned(),0); assert.equal(f.cancelled(),0);
    assert.match((await new core.FileEffectJournal(f.journalPath).receipt('collision:11329'))?.error?.message??'', /CLEANUP_UNRESOLVED/u);
  } finally { await f.close(); }
});

test('original registry parser rejects conflicting identifier aliases', () => {
  const entry={label:'owned',runId:'run:owned',taskId:'task:owned',sessionKey:'session:owned',model:'test/model'};
  for(const field of ['run_id','session_key','task_id']) {
    assert.throws(()=>registeredSessionIdentity({tasks:[{...entry,[field]:'foreign'}]},'owned','test/model'), /REATTACHMENT_AMBIGUOUS/u);
  }
});
