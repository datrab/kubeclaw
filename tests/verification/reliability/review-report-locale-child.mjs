import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {stripTypeScriptTypes} from 'node:module';
import {canonicalJson,portableJson,PORTABLE_JSON_ENCODING,sha256Text} from '@kubeclaw/plugin-sdk';
import {report} from './review-report-locale-fixture.mjs';
import {strictReportSummary} from './review-report-summary-fixture.mjs';
import {storeReviewReport} from '../../../skills/nova/plugins/review/src/review-report-storage.ts';
import {readReviewGovernorBaseline} from '../../../skills/nova/plugins/review/src/review-governor-history.ts';
import {activate} from '../../../skills/common/plugins/artifact-store/src/adapter.ts';
import {EffectCoordinator} from '../../../skills/nova/core/effects/coordinator.ts';
import {FileEffectJournal} from '../../../skills/nova/core/effects/journal.ts';
import {FileResourceLockManager} from '../../../skills/nova/core/effects/locks.ts';

const [root,mode,phase]=process.argv.slice(2);
const value=report(),file=path.join(root,'effects.jsonl');
const attempt={runId:'run:report-hex',stageId:'review',attemptId:'attempt-hex',attemptNumber:1};
const adapter=activate({config:{artifactRoot:path.join(root,'artifacts')}});
const coordinator=new EffectCoordinator(new FileEffectJournal(file),undefined,undefined,new FileResourceLockManager(path.join(root,'locks')));
const owner={pluginId:'kubeclaw.artifact-store',apiVersion:'pipeline-plugin-v2',packageVersion:'1.0.0',contentDigest:`sha256:${'a'.repeat(64)}`};
let sequence=0;
// This is the SDK invocation boundary to the real Core and registered ArtifactStore,
// not a complete Review stage/model execution or a fabricated native gate.
function context(identity=attempt,artifacts=[]){return {contract:{lease:{attempt:identity},artifacts,stageLifecycle:{remediationCyclesUsed:1}},invoke:async(capability,request)=>{
 const key=identity===attempt?'report:hex:1':`report:${phase}:reader:${++sequence}`;
 const receipt=await coordinator.invoke(adapter,owner,{...request,attempt:identity,capability,idempotencyKey:key},new AbortController().signal);
 assert.equal(receipt.status,'completed');return receipt.result;
}};}
async function originalWriter(){
 const archive=JSON.parse(fs.readFileSync(new URL('./fixtures/review-report-storage-original.json',import.meta.url),'utf8'));
 const bytes=Buffer.from(archive.content);
 assert.equal(crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'),'d0f6184b60b521b5c82e22ff97896362935ecb67');
 // Only module resolution is relocated. The entire archived original producer
 // executes unchanged, with dependencies resolved from THIS current checkout.
 const source=stripTypeScriptTypes(archive.content).replace(/from '([^']+)'/gu,(_all,name)=>{
  const target=name.startsWith('.')?new URL(name,new URL('../../../skills/nova/plugins/review/src/review-report-storage.ts',import.meta.url)).href:import.meta.resolve(name);
  return `from '${target}'`;
 });
 const target=path.join(root,'original-storage.mjs');fs.writeFileSync(target,source);
 return (await import(pathToFileURL(target).href)).storeReviewReport;
}
try{
 await adapter.ready();
 const writer=mode==='original'?await originalWriter():storeReviewReport;
 let artifact,error;
 try{artifact=await writer(value,context(),mode==='portable'?PORTABLE_JSON_ENCODING:undefined);}catch(cause){error=cause.message;}
 if(artifact&&phase==='readers'){
  const reader=context({...attempt,attemptId:'attempt-next',attemptNumber:2},[artifact]);
  assert.deepEqual(await readReviewGovernorBaseline(reader),value.governor.baseline);
 }
 let summary;
 if(artifact&&phase==='summary-produce'){
  summary=await strictReportSummary(context);fs.writeFileSync(path.join(root,'summary-evidence.json'),JSON.stringify(summary));
 }
 if(artifact&&phase==='summary-consume')summary=await strictReportSummary(context,JSON.parse(fs.readFileSync(path.join(root,'summary-evidence.json'),'utf8')));
 process.stdout.write(JSON.stringify({locale:Intl.DateTimeFormat().resolvedOptions().locale,mode,phase,error:error??null,
  summary:summary?{digest:summary.summaryDigest,reportDigest:summary.reportDigest,strict:true,providerExecution:false}:undefined,
  artifact:artifact??null,legacyDigest:sha256Text(canonicalJson(value)),portableDigest:sha256Text(portableJson(value)),
  strictReport:true,actualCore:true,actualArtifactStore:true,fullReviewExecution:false})+'\n');
}finally{await adapter.shutdown();}
