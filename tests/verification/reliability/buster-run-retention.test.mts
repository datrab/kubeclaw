import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {createRemotePlanJob} from '../../../skills/nova/core/test-gates/remote-dispatch.ts';
import {attestSourceSnapshot} from '@kubeclaw/pipeline-test-gate-contract';
import {plan,completed} from '../../fixtures/test-gate/remote-plan.mts';
import {FileBusterPlanJobStore} from '../../../skills/buster/engine/test-gates/remote-plan-service.ts';
import {runDirectory} from '../../../skills/buster/engine/test-gates/run-records.ts';
import {retentionPolicy} from '../../../skills/buster/engine/test-gates/run-retention.ts';
const now='2026-11-10T00:00:00.000Z';const after=(days:number)=>new Date(Date.parse(now)+days*86400000).toISOString();
function fixture(t:test.TestContext,retention?:{mode:'retain_days';days:number},archiveBytes=22){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'buster-run-retention-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const keys=crypto.generateKeyPairSync('ed25519'),archive=crypto.randomBytes(archiveBytes);const definition=plan('blocking',null);
 const snapshot=attestSourceSnapshot({schemaVersion:'source-snapshot.v1',sourceType:'git-commit',pipelineStageId:'stage:test',repositoryId:'repository:test',revision:'git:'+'a'.repeat(40),tree:'git:'+'b'.repeat(40),archiveContentDigest:'sha256:'+crypto.createHash('sha256').update(archive).digest('hex'),archiveSizeBytes:archive.length,creatorAuthority:'nova:test'},keys.privateKey.export({type:'pkcs8',format:'pem'}));
 const make=(id:string)=>createRemotePlanJob({idempotencyKey:id,pipelineStageId:'stage:test',plan:definition,sourceSnapshot:snapshot,repositoryArchive:archive,grants:new Map(),maximumConcurrency:1,submittedAt:now});
 const options={recordLimits:{maximumRecords:100,maximumBytes:16777216,maximumRecordBytes:1048576},maximumArchiveBytes:1048576,maximumResultBytes:1048576,maximumResultStoreBytes:16777216,trustedSourceAuthority:'nova:test',sourceAttestationPublicKey:keys.publicKey.export({type:'spki',format:'pem'}),...(retention?{retention}:{})};
 const store=new FileBusterPlanJobStore(root+'/state',options),runtime=root+'/runtime';
 const done=async(id:string)=>{const job=make(id);await store.accept(job,now);await store.transition(job.jobId,['accepted'],'running',now);const output=completed(job,{outcome:'passed'});await store.complete(job.jobId,output.result,now);fs.mkdirSync(runDirectory(runtime,job.jobId),{recursive:true});fs.writeFileSync(path.join(runDirectory(runtime,job.jobId),'test.log'),'synthetic evidence');return {job,output};};
 return {root,store,runtime,make,done,options};
}
test('default deletes only after verified delivery; replay receipt survives deletion and restart',async t=>{
 const {root,store,runtime,done,options}=fixture(t);const {job,output}=await done('delivery');
 assert.equal((await store.collectRetention(after(1),runtime,new Set())).deleted.length,0);
 await assert.rejects(store.acknowledge(job.jobId,{requestDigest:job.requestDigest,resultDigest:'sha256:'+'0'.repeat(64)},now),/DELIVERY_CONFLICT/);
 await store.acknowledge(job.jobId,{requestDigest:job.requestDigest,resultDigest:output.result.resultDigest},now);
 assert.deepEqual((await store.collectRetention(after(1),runtime,new Set([job.jobId]))).deleted,[],'active ownership must win over acknowledgement');
 assert.deepEqual((await store.collectRetention(after(1),runtime,new Set())).deleted,[job.jobId]);
 assert.equal(fs.existsSync(runDirectory(runtime,job.jobId)),false);assert.equal(fs.existsSync(runDirectory(root+'/state/jobs',job.jobId)),false);assert.equal(fs.existsSync(root+'/state/records/store.json'),false);
 const restarted=new FileBusterPlanJobStore(root+'/state',options);assert.equal((await restarted.accept(job,after(2))).state,'completed');assert.equal((await restarted.header(job.jobId))?.status.state,'completed');
 await restarted.acknowledge(job.jobId,{requestDigest:job.requestDigest,resultDigest:output.result.resultDigest},after(2));assert.deepEqual((await restarted.collectRetention(after(2),runtime,new Set())).deleted,[]);
 await restarted.collectRetention(after(15),runtime,new Set());assert.equal(await restarted.header(job.jobId),null);
});
test('retain_days keeps acknowledged data to deadline; undelivered data expires at fourteen days, never active data',async t=>{
 const f=fixture(t,{mode:'retain_days',days:2});const {job,output}=await f.done('two-days');await f.store.acknowledge(job.jobId,{requestDigest:job.requestDigest,resultDigest:output.result.resultDigest},now);assert.deepEqual((await f.store.collectRetention(after(1),f.runtime,new Set())).deleted,[]);assert.deepEqual((await f.store.collectRetention(after(2),f.runtime,new Set())).deleted,[job.jobId]);
 const g=fixture(t);const second=await g.done('undelivered');const running=g.make('running');await g.store.accept(running,now);await g.store.transition(running.jobId,['accepted'],'running',now);assert.deepEqual((await g.store.collectRetention(after(13),g.runtime,new Set())).deleted,[]);assert.deepEqual((await g.store.collectRetention(after(14),g.runtime,new Set())).deleted,[second.job.jobId]);assert.equal((await g.store.header(running.jobId))?.status.state,'running');
 for(const value of [{mode:'retain_days',days:0},{mode:'retain_days',days:15},{mode:'retain_days',days:1.5},{mode:'forever'},{mode:'delete_after_delivery',days:2}])assert.throws(()=>retentionPolicy(value),/RETENTION_INVALID/);
});
test('individual status reads do not parse any other run archive; receipt is durable before deletion',async t=>{
 const f=fixture(t);const a=await f.done('one'),b=await f.done('two');const file=path.join(runDirectory(f.root+'/state/jobs',b.job.jobId),'run.ndjson');const text=fs.readFileSync(file,'utf8');fs.writeFileSync(file,text.slice(0,text.indexOf('\n')+1)+'corrupted unrelated archive');
 assert.equal((await f.store.header(a.job.jobId))?.status.state,'completed');assert.equal((await f.store.headers()).length,2);assert.equal((await f.store.get(a.job.jobId)).payload.status.state,'completed');
 await f.store.acknowledge(a.job.jobId,{requestDigest:a.job.requestDigest,resultDigest:a.output.result.resultDigest},now);
 const restarted=new FileBusterPlanJobStore(f.root+'/state',f.options);assert.equal((await restarted.accept(a.job,now)).state,'completed');assert.deepEqual((await restarted.collectRetention(now,f.runtime,new Set())).deleted,[a.job.jobId]);
});
test('delivery is acknowledged only after all blobs are durable; an ACK retry uses the retained import, not a fresh execution',async t=>{
 const {FileNovaGateImportStore,NovaRemoteGateImporter}=await import('../../../skills/nova/core/test-gates/remote-result-import.ts');
 const f=fixture(t),job=f.make('verified-import');const body=Buffer.from('actual synthetic test evidence'),digest='sha256:'+crypto.createHash('sha256').update(body).digest('hex');
 const artifact={type:'log' as const,artifactId:'artifact:test',contentDigest:digest,sizeBytes:body.length,mediaType:'text/plain',storageUrl:'file:///synthetic.log'};
 const output=completed(job,{outcome:'passed',artifact});await f.store.accept(job,now);await f.store.transition(job.jobId,['accepted'],'running',now);const status=await f.store.complete(job.jobId,output.result,now);
 const imports=new FileNovaGateImportStore(f.root+'/nova-import',{recordLimits:f.options.recordLimits,maximumEvidenceStoreBytes:1048576});let unavailable=true,reads=0,acks=0,failAck=true;
 const transport={async result(){reads++;return output.result;},async evidence(){if(unavailable)throw new Error('test evidence unavailable');return body;},async acknowledge(){acks++;assert.ok((await imports.readExecutionGraphs()).length===1,'ACK preceded durable import');if(failAck)throw new Error('test ACK response lost');await f.store.acknowledge(job.jobId,{requestDigest:job.requestDigest,resultDigest:output.result.resultDigest},now);await f.store.collectRetention(now,f.runtime,new Set());}};
 const importer=new NovaRemoteGateImporter({store:imports,evidence:transport,results:transport,maximumEvidenceBytes:1048576,maximumResultBytes:1048576});
 await assert.rejects(importer.import(job,status),/evidence unavailable/);assert.equal(acks,0);assert.equal(fs.existsSync(runDirectory(f.root+'/state/jobs',job.jobId)),true);
 unavailable=false;await assert.rejects(importer.import(job,status),/ACK response lost/);assert.equal(acks,1);assert.equal(reads,2);
 failAck=false;assert.equal((await importer.import(job,status)).state,'passed');assert.equal(reads,2,'verified import retry must not fetch deleted remote data');assert.equal(acks,2);assert.equal(fs.existsSync(runDirectory(f.root+'/state/jobs',job.jobId)),false);
});
test('legacy journal requires explicit maintenance; invalid retention is rejected before service startup',t=>{
 const f=fixture(t);fs.mkdirSync(f.root+'/old/records',{recursive:true});fs.writeFileSync(f.root+'/old/records/store.json','old history must not be silently ignored');assert.throws(()=>new FileBusterPlanJobStore(f.root+'/old',f.options),/LEGACY_JOURNAL_PRESENT/);
});
test('authenticated HTTP confirmation is fixed to the completed request and result; losing its reply cannot re-run a job',async t=>{
 const {createBusterRemotePlanHttpServer}=await import('../../../skills/buster/engine/test-gates/remote-plan-http.ts');const {HttpRemotePlanTransport}=await import('../../../skills/nova/core/test-gates/remote-dispatch.ts');
 const f=fixture(t),{job,output}=await f.done('http-delivery');const token='synthetic-delivery-test-token-00000000';
 const service={async acknowledge(id:string,input:{requestDigest:string;resultDigest:string|null}){const r=await f.store.acknowledge(id,input,now);await f.store.collectRetention(now,f.runtime,new Set());return {schemaVersion:'buster-delivery-ack.v1',jobId:r.jobId,requestDigest:r.requestDigest};}};
 const server=createBusterRemotePlanHttpServer({service:service as unknown as import('../../../skills/buster/engine/test-gates/remote-plan-service.ts').BusterRemotePlanService,token,maximumRequestBytes:1048576,maximumResponseBytes:1048576,maximumResultBytes:1048576});await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));});
 const endpoint='http://127.0.0.1:'+(server.address() as import('node:net').AddressInfo).port,url=endpoint+'/v1/plan-jobs/'+encodeURIComponent(job.jobId)+'/delivered';
 assert.equal((await fetch(url,{method:'POST',body:'{}'})).status,401);
 const transport=new HttpRemotePlanTransport({endpoint,token,maximumResponseBytes:1048576,maximumResultBytes:1048576});
 await assert.rejects(transport.acknowledge(job.jobId,job.requestDigest,'sha256:'+'0'.repeat(64)),/HTTP_409/);assert.equal(fs.existsSync(runDirectory(f.root+'/state/jobs',job.jobId)),true);
 await transport.acknowledge(job.jobId,job.requestDigest,output.result.resultDigest);await transport.acknowledge(job.jobId,job.requestDigest,output.result.resultDigest);assert.equal(fs.existsSync(runDirectory(f.root+'/state/jobs',job.jobId)),false);assert.equal((await f.store.accept(job,now)).state,'completed');
});
test('failed and cancelled runs with proven shutdown expire; unknown orphan ownership is reported, not guessed',async t=>{
 const f=fixture(t);
 for(const state of ['failed','cancelled'] as const){const job=f.make('safe-'+state);await f.store.accept(job,now);await f.store.transition(job.jobId,['accepted'],state,now,{error:'fixture stopped before provider invocation',quiescent:true});await f.store.acknowledge(job.jobId,{requestDigest:job.requestDigest,resultDigest:null},now);assert.deepEqual((await f.store.collectRetention(now,f.runtime,new Set())).deleted,[job.jobId]);}
 const unknown=f.make('orphan');await f.store.accept(unknown,now);await f.store.transition(unknown.jobId,['accepted'],'failed',now,{error:'BUSTER_REMOTE_EXECUTION_INTERRUPTED'});const report=await f.store.collectRetention(after(14),f.runtime,new Set());assert.deepEqual(report.held,[unknown.jobId]);assert.deepEqual(report.deleted,[]);
 const done=await f.done('atomic-finish');const reopened=new FileBusterPlanJobStore(f.root+'/state',f.options);assert.equal((await reopened.header(done.job.jobId))?.quiescent,true,'completion and quiescence must survive restart in one record');await reopened.acknowledge(done.job.jobId,{requestDigest:done.job.requestDigest,resultDigest:done.output.result.resultDigest},now);assert.ok((await reopened.collectRetention(now,f.runtime,new Set())).deleted.includes(done.job.jobId));
});
test('explicit legacy discard streams bounded records, refuses active jobs and preserves replay receipts',async t=>{
 const {discardLegacyJournal}=await import('../../../skills/buster/engine/test-gates/discard-legacy-journal.ts');const {canonicalJson}=await import('@kubeclaw/pipeline-observability-contract');
 const f=fixture(t,undefined,150000);const done=await f.done('legacy-done'),pending=f.make('legacy-pending');await f.store.accept(pending,now);
 const legacy=f.root+'/legacy',file=legacy+'/records/store.json';fs.mkdirSync(path.dirname(file),{recursive:true});
 const snapshot=async()=>{const a=(await f.store.get(done.job.jobId)).record,b=(await f.store.get(pending.jobId)).record;fs.writeFileSync(file,canonicalJson({schemaVersion:'pipeline-durable-record-store.v1',records:[a,{...b,sequence:2}]}));};
 await snapshot();const original=fs.readFileSync(file);await assert.rejects(discardLegacyJournal(legacy,f.options.recordLimits,now),/LEGACY_ACTIVE_JOBS/);assert.deepEqual(fs.readFileSync(file),original);assert.equal(fs.existsSync(legacy+'/receipts'),false);
 await f.store.transition(pending.jobId,['accepted'],'cancelled',now,{quiescent:true,error:'cancelled synthetic fixture'});await snapshot();const bytes=fs.statSync(file).size;assert.ok(bytes>300000);
 const result=await discardLegacyJournal(legacy,f.options.recordLimits,now);assert.deepEqual(result,{discarded:true,records:2,bytes});assert.equal(fs.existsSync(file),false);
 const restarted=new FileBusterPlanJobStore(legacy,f.options);assert.equal((await restarted.accept(done.job,now)).state,'completed');assert.equal((await restarted.header(pending.jobId))?.status.state,'cancelled');assert.deepEqual(await discardLegacyJournal(legacy,f.options.recordLimits,now),{discarded:false,records:0,bytes:0});
});
test('interrupted recursive removal is resumed from its receipt even after run header removal',async t=>{
 const f=fixture(t),{job,output}=await f.done('partial-removal');await f.store.acknowledge(job.jobId,{requestDigest:job.requestDigest,resultDigest:output.result.resultDigest},now);
 const directory=runDirectory(f.root+'/state/jobs',job.jobId);fs.unlinkSync(path.join(directory,'run.ndjson'));assert.ok(fs.existsSync(path.join(directory,'results')));assert.ok(fs.existsSync(runDirectory(f.runtime,job.jobId)));
 const restarted=new FileBusterPlanJobStore(f.root+'/state',f.options);assert.deepEqual((await restarted.collectRetention(after(20),f.runtime,new Set())).deleted,[job.jobId]);assert.equal(fs.existsSync(directory),false);assert.equal(fs.existsSync(runDirectory(f.runtime,job.jobId)),false);assert.equal((await restarted.accept(job,after(20))).state,'completed');
 await restarted.collectRetention(after(33),f.runtime,new Set());assert.equal((await restarted.header(job.jobId))?.status.state,'completed');
});
test('legacy payload corruption vetoes discard before any original bytes or replay receipts change',async t=>{
 const {discardLegacyJournal}=await import('../../../skills/buster/engine/test-gates/discard-legacy-journal.ts');const {canonicalJson}=await import('@kubeclaw/pipeline-observability-contract');const f=fixture(t),done=await f.done('corrupt-legacy');
 const record=structuredClone((await f.store.get(done.job.jobId)).record);record.payload.status.error='corrupted payload';const legacy=f.root+'/legacy',file=legacy+'/records/store.json';fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,canonicalJson({schemaVersion:'pipeline-durable-record-store.v1',records:[record]}));const original=fs.readFileSync(file);
 await assert.rejects(discardLegacyJournal(legacy,f.options.recordLimits,now));assert.deepEqual(fs.readFileSync(file),original);assert.equal(fs.existsSync(legacy+'/receipts'),false);
});

test('fourteen-day retention starts a fresh replay window only after payload removal',async t=>{
 const f=fixture(t,{mode:'retain_days',days:14});const {job,output}=await f.done('max-retention');
 await f.store.acknowledge(job.jobId,{requestDigest:job.requestDigest,resultDigest:output.result.resultDigest},now);
 assert.deepEqual((await f.store.collectRetention(after(14),f.runtime,new Set())).deleted,[job.jobId]);
 assert.equal((await f.store.accept(job,after(14))).state,'completed');
 await f.store.collectRetention(after(27),f.runtime,new Set());assert.equal((await f.store.header(job.jobId))?.status.state,'completed');
 await f.store.collectRetention(after(28),f.runtime,new Set());assert.equal(await f.store.header(job.jobId),null);
});
