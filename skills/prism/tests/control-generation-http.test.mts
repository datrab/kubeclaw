import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer, type Server} from 'node:http';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite-pgvector';
import fixture from '../../../contracts/prism/v1/fixtures/minimal-web.json' with {type:'json'};
import {migrate} from '../storage/index.ts';
import {createControlServer} from '../server/control-server.ts';
import {agentPrompt} from '../server/agent-prompt.mjs';
import register from '../openclaw-plugin/index.mjs';

const identity = 'operator@example.invalid';
const subject = `user-${createHash('sha256').update(identity).digest('hex').slice(0,24)}`;
const peer = 'spiffe://kubeclaw.test/prism-agent';
const headers = {'x-forwarded-client-cert':`URI=${peer}`};
async function listen(server:Server) {
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const address=server.address();assert.ok(address && typeof address!=='string');
  return `http://127.0.0.1:${address.port}`;
}
async function close(server:Server) {
  await new Promise<void>((resolve,reject)=>{server.close(error=>error?reject(error):resolve());server.closeAllConnections();});
}
async function setup() {
  const root=await mkdtemp(join(tmpdir(),'prism-original-http-'));
  const environment={ARTIFACT_ROOT:join(root,'artifacts'),PRISM_SESSION_SECRET:'local-session-secret',PRISM_INGRESS_SECRET:'local-ingress-secret',PRISM_INGESTION_SECRET:'local-ingestion-secret',WORKER_TRUST_SPIFFE_ENABLED:'true',PRISM_TRUSTED_NOVA_SPIFFE_ID:'spiffe://kubeclaw.test/nova',PRISM_TRUSTED_WORKER_SPIFFE_ID:'spiffe://kubeclaw.test/worker',PRISM_CONTROL_SPIFFE_ID:'spiffe://kubeclaw.test/control',PRISM_TRUSTED_AGENT_SPIFFE_ID:peer,PRISM_PIPELINE_PREFERENCE_SUBJECT:subject};
  let db=new PGlite(join(root,'db'),{extensions:{vector}});await migrate(db);
  let server=await createControlServer(db,environment);let url=await listen(server);
  // This forwards real HTTP bytes to the original handler at its documented
  // loopback/proxy boundary. It is NOT an Envoy, TLS, CNI or SPIFFE issuance test.
  const relay=createServer(async(request,response)=>{
    try {
      const chunks:Buffer[]=[];for await(const chunk of request)chunks.push(Buffer.from(chunk));
      const result=await fetch(new URL(request.url!,url),{method:request.method,headers:{'content-type':'application/json',...headers},body:Buffer.concat(chunks)});
      response.writeHead(result.status,{'content-type':'application/json'});response.end(await result.text());
    }catch(error){response.writeHead(502);response.end(String(error));}
  });
  const relayUrl=await listen(relay);
  const tools=new Map<string,{execute:(id:string,input:unknown,context:unknown)=>Promise<any>}>();
  register({registerTool:(tool:any)=>tools.set(tool.name,tool)});
  async function api(path:string,body?:unknown,extra:Record<string,string>={},method=body===undefined?'GET':'POST') {
    const result=await fetch(new URL(path,url),{method,headers:{'content-type':'application/json',...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:result.status,value:await result.json() as any,headers:result.headers};
  }
  async function session(user=identity) {
    const result=await api('/v1/session',{}, {'x-prism-ingress-secret':environment.PRISM_INGRESS_SECRET,'tailscale-user-login':user});assert.equal(result.status,201);
    return {subject:result.value.userId,csrf:result.value.csrf,headers:{cookie:result.headers.getSetCookie().map(value=>value.split(';')[0]).join('; '),'x-prism-csrf':result.value.csrf}};
  }
  async function dispatch(projectId:string,revision:number) {
    const digest=`sha256:${createHash('sha256').update(`${projectId}:${revision}`).digest('hex')}`;
    const result=await api('/v1/dispatch',{request:{schema:'prism.design-request.v1',projectId,architecture:{artifactId:`artifact:${digest}`,contentDigest:digest,revision},architectureContent:{title:projectId,revision}}},{...headers,'idempotency-key':`${projectId}:${revision}`});
    assert.equal(result.status,202,JSON.stringify(result.value));return result.value;
  }
  async function claim() {const result=await api('/v1/agent/jobs/claim',{runnerId:'local-original-runner'},headers);assert.equal(result.status,200,JSON.stringify(result.value));return result.value.job;}
  function designs(projectId:string,label:string) {
    return ['one','two','three'].map((key,index)=>{const document=structuredClone(fixture);document.meta.projectId=projectId;document.meta.title=`${label}-${key}`;document.theme.colors.action=['#123456','#654321','#abcdef'][index]!;document.theme.colors.background=['#111111','#222222','#333333'][index]!;document.theme.space.medium=20+index*5;return {key,title:document.meta.title,summary:label,document};});
  }
  async function deliver(job:any,label:string) {return tools.get('prism_create_design_set')!.execute('actual-tool-invocation',{jobId:job.id,fence:job.fence,generationId:job.id,projectId:job.request.projectId,designs:designs(job.request.projectId,label)},{config:{controlUrl:relayUrl}});}
  return {api,session,dispatch,claim,deliver,db:()=>db,
    restart:async()=>{await close(server);await db.close();db=new PGlite(join(root,'db'),{extensions:{vector}});await db.waitReady;server=await createControlServer(db,environment);url=await listen(server);},
    close:async()=>{await close(relay);await close(server);await db.close();await rm(root,{recursive:true,force:true});}};
}

test('PATH-T02-001 original HTTP event survives database/service restart and a fresh session into exact agent input and tool result',async()=>{
  const context=await setup();try {
    const first=await context.session();
    assert.equal((await context.api('/v1/projects',{externalId:'origin',name:'Origin'},first.headers)).status,201);
    const event={schema:'prism.preference-event.v1',eventId:'persisted-personal-event',userId:first.subject,projectId:'origin',action:'liked',traits:['dense'],context:{domain:'tools'},source:'explicit',learningScope:'personal',occurredAt:new Date().toISOString()};
    assert.equal((await context.api('/v1/preferences',event,first.headers)).status,201);
    const other=await context.session('other@example.invalid');
    assert.equal((await context.api('/v1/preferences',{...event,eventId:'foreign-personal-event',userId:other.subject},other.headers)).status,201);
    await context.restart();
    const fresh=await context.session();assert.notEqual(fresh.csrf,first.csrf);assert.equal(fresh.subject,first.subject);
    const history=await context.api('/v1/preferences',undefined,fresh.headers);assert.deepEqual(history.value.events.map((item:any)=>item.eventId),[event.eventId]);
    const admission=await context.dispatch('new-project',1);const job=await context.claim();assert.equal(job.id,admission.preferences.generationId);
    const snapshot=job.request.preferences.snapshot;
    assert.equal(snapshot.subjectId,first.subject);assert.equal(snapshot.projectId,'new-project');assert.equal(snapshot.personalEnabled,true);
    assert.equal(snapshot.policyVersion,'prism.preferences.v1.decay180-project-override');assert.deepEqual(snapshot.events,[event]);
    const prompt=agentPrompt(job);assert.ok(prompt.includes(event.eventId));assert.ok(prompt.includes(job.request.preferences.snapshotDigest));assert.ok(!prompt.includes('foreign-personal-event'));
    const persisted=await context.db().query<{snapshot:unknown}>('SELECT snapshot FROM prism.preference_generation WHERE id=$1',[job.id]);assert.deepEqual(snapshot,persisted.rows[0]!.snapshot);
    const delivery=await context.deliver(job,'Preference-bound');assert.equal(delivery.details.status,'created');
    const directions=await context.db().query<{evidence:{generationId:string;snapshotDigest:string}}>('SELECT evidence FROM prism.direction');assert.equal(directions.rows.length,3);
    for(const row of directions.rows){assert.equal(row.evidence.generationId,job.id);assert.equal(row.evidence.snapshotDigest,job.request.preferences.snapshotDigest);}
    assert.equal((await context.api('/v1/preferences',{...event,eventId:'impersonation',userId:other.subject},fresh.headers)).status,422);
    assert.equal((await context.api('/v1/preferences/policy',{projectId:'new-project',personalEnabled:false},fresh.headers,'PUT')).status,200);
    const disabled=await context.dispatch('new-project',2);
    assert.equal(disabled.preferences.snapshot.personalEnabled,false);
    assert.deepEqual(disabled.preferences.snapshot.events,[]);
  }finally{await context.close();}
});

test('PATH-T02-002 diagnostic: original stale tool callback makes no successor mutation, but running predecessor still blocks successor claim',async()=>{
  const context=await setup();try {
    await context.dispatch('overlap',1);const first=await context.claim();assert.ok(first.fence);
    const second=await context.dispatch('overlap',2);
    assert.equal(await context.claim(),null,'real same-session admission prevents a fabricated overlapping claim');
    await assert.rejects(context.deliver(first,'Stale A1'),/stale design generation/);
    assert.equal((await context.db().query('SELECT id FROM prism.design_document')).rows.length,0);
    const current=await context.db().query<{current_round_id:string}>("SELECT current_round_id FROM prism.design_request WHERE status='active'");assert.equal(current.rows[0]!.current_round_id,second.preferences.generationId);
    assert.equal(await context.claim(),null,'A2 acceptance is NOT proved; requires genuine predecessor lifecycle reconciliation');
    assert.equal((await context.api(`/v1/agent/jobs/${first.id}`,undefined,headers)).value.job.result,null);
  }finally{await context.close();}
});

test('pipeline retry with a fresh transport key resumes the admitted round instead of creating another design action',async()=>{
 const context=await setup();try{
  const initial=await context.dispatch('pipeline-retry',1);
  const retry=await context.api('/v1/dispatch',{request:initial.preferences.request},{...headers,'idempotency-key':'new-nova-attempt'});
  assert.equal(retry.status,202,JSON.stringify(retry.value));
  assert.equal(retry.value.preferences.generationId,initial.preferences.generationId);
  assert.equal(retry.value.agent.jobId,initial.agent.jobId);
  assert.equal((await context.db().query('SELECT id FROM prism.agent_job')).rows.length,1);
  assert.equal((await context.db().query('SELECT id FROM prism.design_round')).rows.length,1);
 }finally{await context.close();}
});

test('authenticated project status exposes stopped generation without requiring a design document',async()=>{
 const context=await setup();try{
  const admission=await context.dispatch('pending-status',1);const id=admission.result.projectId;
  assert.equal((await context.api(`/v1/projects/${id}/status`)).status,422);
  const operator=await context.session();
  const waiting=await context.api(`/v1/projects/${id}/status`,undefined,operator.headers);
  assert.equal(waiting.status,200);assert.equal(waiting.value.state,'accepted');assert.equal(waiting.value.documentId,null);
  const job=await context.claim();
  await context.api(`/v1/agent/jobs/${job.id}/finish`,{fence:job.fence,outcome:{state:'errored',error:'model auth unavailable'}},headers);
  const stopped=await context.api(`/v1/projects/${id}/status`,undefined,operator.headers);
  assert.equal(stopped.status,200);assert.equal(stopped.value.state,'needs_nova');assert.match(stopped.value.summary,/stopped/);
 }finally{await context.close();}
});
