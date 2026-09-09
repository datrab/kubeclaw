import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {activate} from '../../../skills/common/plugins/artifact-store/src/adapter.ts';
import {FileEffectJournal} from '../../../skills/nova/core/effects/journal.ts';
import {assertMatchingRequest, stableEffectId} from '../../../skills/nova/core/effects/identity.ts';
import {PORTABLE_JSON_ENCODING, portableJson, canonicalJson, sha256Text, readBoundArtifact, resolveSourceRevision,
  verifiedArtifactJsonText, type AdapterActivationContext, type AdapterInvocation, type ArtifactRef, type PluginInvocationContext} from '@kubeclaw/plugin-sdk';

const file = fileURLToPath(import.meta.url);
const value = {status:'ready_for_testing',sourceRevision:'a'.repeat(40),headBefore:'b'.repeat(40),details:{a:3,ä:1,z:2,'😀':0,'𐀀':9}};
function producer(stageId:string) {return {runId:'run:portable',stageId,attemptId:`attempt:${stageId}`,attemptNumber:1};}
async function child(mode:string,root:string) {
  const adapter=activate({config:{artifactRoot:path.join(root,'artifacts')}} as AdapterActivationContext);
  const invoke=(capability:string,request:any,attempt=producer('reader'))=>adapter.invoke({confidential:true,signal:new AbortController().signal,
    request:{...request,capability,attempt,idempotencyKey:request.idempotencyKey??`${mode}:${request.resource.canonicalId}`}} as AdapterInvocation);
  await adapter.ready();
  try {
    if(mode==='write') {
      const refs:ArtifactRef[]=[];
      for(const kind of ['legacy','portable']) {
        const response=await invoke('artifacts.write',{operation:'put_json',resource:{type:'artifact.object',canonicalId:`implementation:${kind}`},
          payload:{namespace:'kubeclaw.implementation-agent',mediaType:'application/json',value,...(kind==='portable'?{encoding:PORTABLE_JSON_ENCODING}:{})}},producer(kind));
        refs.push(response.artifact as ArtifactRef);
      }
      fs.writeFileSync(path.join(root,'refs.json'),JSON.stringify(refs));
      const request:any={schemaVersion:'effect-request.v1',requestId:'request:portable',idempotencyKey:'effect:portable',attempt:producer('portable'),
        capability:'artifacts.write',operation:'put_json',resource:{type:'artifact.object',canonicalId:'implementation:portable'},payload:{value}};
      request.effectId=stableEffectId(request);
      await new FileEffectJournal(path.join(root,'effects.jsonl')).requested(request);
      return {locale:Intl.DateTimeFormat().resolvedOptions().locale,legacy:refs[0]!.digest,portable:refs[1]!.digest};
    }
    const refs=JSON.parse(fs.readFileSync(path.join(root,'refs.json'),'utf8')) as ArtifactRef[];
    const context={contract:{lease:{attempt:producer('reader')},artifacts:refs},invoke} as unknown as PluginInvocationContext;
    for(const ref of refs) {
      assert.deepEqual(await readBoundArtifact(ref,context),value);
      assert.equal(await resolveSourceRevision({sourceStageId:ref.producer.stageId},context),value.sourceRevision);
      const response=await invoke('artifacts.read',{operation:'get_json_bytes',resource:{type:'artifact.object',canonicalId:ref.artifactId},payload:{namespace:ref.namespace,digest:ref.digest,reference:ref}});
      assert.equal(sha256Text(verifiedArtifactJsonText(response,ref)),ref.digest);
      for(const changed of [{artifactId:'implementation:other'},{namespace:'other.namespace'},{mediaType:'text/plain'},
        {producer:{...ref.producer,runId:'run:other'}},{producer:{...ref.producer,stageId:'other-stage'}},
        {producer:{...ref.producer,attemptId:'other-attempt'}},{producer:{...ref.producer,attemptNumber:2}},
        ...(ref.encoding===undefined?[{encoding:PORTABLE_JSON_ENCODING}]:[{encoding:undefined}])]) {
        const expected={...ref,...changed};if(expected.encoding===undefined)delete expected.encoding;
        assert.throws(()=>verifiedArtifactJsonText(response,expected),/ARTIFACT_JSON_REFERENCE_UNBOUND/);
      }

      assert.throws(()=>verifiedArtifactJsonText({...response,value:{...value,details:{a:4}}},ref),/ARTIFACT_JSON_VALUE_UNBOUND/);
      assert.throws(()=>verifiedArtifactJsonText({...response,jsonBytes:response.jsonBytes+' '},ref),/ARTIFACT_JSON_BYTES_UNBOUND/);
      assert.throws(()=>verifiedArtifactJsonText({...response,artifact:{...ref,encoding:'unknown'}},ref),/ARTIFACT_JSON_REFERENCE_UNBOUND/);
      assert.deepEqual((await invoke('artifacts.read',{operation:'get_json',resource:{type:'artifact.object',canonicalId:ref.artifactId},payload:{namespace:ref.namespace,digest:ref.digest,reference:ref}})).value,value);
      if(ref.encoding===PORTABLE_JSON_ENCODING) {
        const foreign=await invoke('artifacts.write',{operation:'put_json',idempotencyKey:'write:foreign',resource:{type:'artifact.object',canonicalId:ref.artifactId},
          payload:{namespace:ref.namespace,mediaType:ref.mediaType,encoding:ref.encoding,value}}, {...producer('foreign'),runId:'run:foreign'});
        const foreignRef=foreign.artifact as ArtifactRef;assert.equal(foreignRef.digest,ref.digest);
        const foreignRead=await invoke('artifacts.read',{operation:'get_json_bytes',resource:{type:'artifact.object',canonicalId:ref.artifactId},payload:{namespace:ref.namespace,digest:ref.digest,reference:foreignRef}});
        assert.throws(()=>verifiedArtifactJsonText(foreignRead,ref),/ARTIFACT_JSON_REFERENCE_UNBOUND/);
        assert.deepEqual(await readBoundArtifact(ref,context),value,'exact original owner remains selectable after foreign same-byte write');
      }

    }
    const replayRequest={operation:'put_json',idempotencyKey:'write:implementation:portable',resource:{type:'artifact.object',canonicalId:'implementation:portable'},
      payload:{namespace:'kubeclaw.implementation-agent',mediaType:'application/json',encoding:PORTABLE_JSON_ENCODING,value}};
    assert.deepEqual((await invoke('artifacts.write',replayRequest,producer('portable'))).artifact,refs[1],'portable cross-locale write replay preserves original reference');
    await assert.rejects(invoke('artifacts.write',{...replayRequest,payload:{...replayRequest.payload,encoding:'unrecognized'}},producer('portable')),/ARTIFACT_ENCODING_UNSUPPORTED/);
    await assert.rejects(invoke('artifacts.write',{...replayRequest,payload:{...replayRequest.payload,encoding:undefined}},producer('portable')),/DURABLE_RECORD_IDEMPOTENCY_CONFLICT/);
    const prior=await new FileEffectJournal(path.join(root,'effects.jsonl')).request('effect:portable');assert(prior);
    assertMatchingRequest(prior,{...prior,payload:{value}});
    assert.throws(()=>assertMatchingRequest(prior,{...prior,payload:{value:{...value,details:{a:4}}}}),/EFFECT_IDEMPOTENCY_CONFLICT/);
    assert.equal(refs[1]!.encoding,PORTABLE_JSON_ENCODING);assert.equal(refs[1]!.digest,sha256Text(portableJson(value)));
    return {locale:Intl.DateTimeFormat().resolvedOptions().locale,legacyReserialized:sha256Text(canonicalJson(value)),portable:refs[1]!.digest};
  }finally{await adapter.shutdown(new AbortController().signal);}
}
if(process.argv[2]==='--child') {
  process.stdout.write(JSON.stringify(await child(process.argv[3]!,process.argv[4]!)));
}else {
  test('original artifact/source consumers and reopened effect journal preserve byte authority across native locales',()=>{
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'sdk-portable-'));
    const run=(mode:string,locale:string,directory:string)=>JSON.parse(execFileSync(process.execPath,[file,'--child',mode,directory],
      {encoding:'utf8',env:{...process.env,LANG:locale,LC_ALL:locale}}));
    try {
      let portable:string|undefined;
      for(const [writer,reader] of [['en_US.UTF-8','sv_SE.UTF-8'],['sv_SE.UTF-8','en_US.UTF-8'],['tr_TR.UTF-8','sv_SE.UTF-8']]) {
        const directory=path.join(root,writer!);fs.mkdirSync(directory);
        const produced=run('write',writer!,directory),consumed=run('read',reader!,directory);
        assert.notEqual(produced.locale,consumed.locale,'test must use distinct native locales');
        assert.notEqual(produced.legacy,consumed.legacyReserialized,'original bytes differ from reader locale serialization');
        portable??=produced.portable;assert.equal(produced.portable,portable);assert.equal(consumed.portable,portable);
      }
    }finally{fs.rmSync(root,{recursive:true,force:true});}
  });
}
