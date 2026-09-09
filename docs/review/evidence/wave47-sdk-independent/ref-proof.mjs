import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
const repository=process.cwd();
const {activate}=await import(path.join(repository,'skills/common/plugins/artifact-store/src/adapter.ts'));
const {readBoundArtifact,PORTABLE_JSON_ENCODING,verifiedArtifactJsonText}=await import(path.join(repository,'skills/common/plugin-runtime/sdk/src/index.ts'));
const root=fs.mkdtempSync(path.join(os.tmpdir(),'sdk-ref-review-final-'));
const adapter=activate({config:{artifactRoot:root}});
const producer=(runId,stageId='source')=>({runId,stageId,attemptId:'attempt:'+runId+':'+stageId,attemptNumber:1});
const invoke=(capability,request,owner=producer('run:a'))=>adapter.invoke({confidential:true,signal:new AbortController().signal,request:{...request,capability,attempt:owner,idempotencyKey:request.idempotencyKey??'read:original'}});
const read=(operation,ref,owner)=>invoke('artifacts.read',{operation,resource:{type:'artifact.object',canonicalId:ref.artifactId},payload:{namespace:ref.namespace,digest:ref.digest,reference:ref}},owner);
try{
 await adapter.ready();const refs=[];
 for(const owner of [producer('run:a'),producer('run:b'),producer('run:a','later')])refs.push((await invoke('artifacts.write',{operation:'put_json',resource:{type:'artifact.object',canonicalId:'same-id'},idempotencyKey:'write:'+owner.attemptId,payload:{namespace:'kubeclaw.implementation-agent',mediaType:'application/json',encoding:PORTABLE_JSON_ENCODING,value:{verified:true}}},owner)).artifact);
 const exact=await read('get_json_bytes',refs[0]);assert.deepEqual(exact.artifact,refs[0]);
 assert.deepEqual(await readBoundArtifact(refs[0],{contract:{lease:{attempt:producer('run:a')},artifacts:[refs[0]]},invoke}),{verified:true});
 console.log('Original older reference stays readable after later equal-byte foreign-run and same-run writes.');
 const latest=await read('get_latest_json_bytes',refs[0]);assert.deepEqual(latest.artifact,refs[2]);
 assert.throws(()=>verifiedArtifactJsonText(latest,refs[0]),/ARTIFACT_JSON_REFERENCE_UNBOUND/);
 assert.doesNotThrow(()=>verifiedArtifactJsonText(latest,refs[2]));
 assert.deepEqual((await read('get_latest_json_bytes',refs[1],producer('run:b'))).artifact,refs[1]);
 console.log('Latest remains run-scoped; consumer rejects stale expected ref even for identical bytes.');
 for(const changed of [{...refs[0],artifactId:'other'}, {...refs[0],namespace:'kubeclaw.other'}, {...refs[0],producer:producer('run:foreign')}, {...refs[0],encoding:undefined}]) {
  const clean=JSON.parse(JSON.stringify(changed));
  assert.throws(()=>verifiedArtifactJsonText(exact,clean),/ARTIFACT_JSON_REFERENCE_UNBOUND/);
  await assert.rejects(read('get_json_bytes',clean),/ARTIFACT_NOT_FOUND|ARTIFACT_REFERENCE_CORRUPT/);
 }
 console.log('Different ID, namespace, producer and encoding rejected by original store selection and independent byte verifier.');
 const legacy=await read('get_json',refs[0]);assert.deepEqual(Object.keys(legacy).sort(),['artifact','digest','sizeBytes','value']);assert.deepEqual(legacy.artifact,refs[2]);
 console.log('Legacy get_json response shape and latest same-ID/digest selection remain unchanged.');
}finally{await adapter.shutdown(new AbortController().signal);fs.rmSync(root,{recursive:true,force:true});}
