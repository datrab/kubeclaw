import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { readManagedEvidence } from '../../../skills/buster/engine/test-gates/runner-managed-evidence.ts';
import { persistRunnerCompletion } from '../../../skills/buster/engine/test-gates/runner-completion.ts';

function fixture(t, bytes = Buffer.from('original producer bytes')) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'completion-source-'));
  t.after(() => fs.rmSync(root, {recursive:true, force:true}));
  const file = path.join(root,'output'); fs.writeFileSync(file,bytes);
  const artifact = {artifactId:'artifact:original', type:'log', mediaType:'text/plain',
    storageUrl:pathToFileURL(file).href, sizeBytes:bytes.length,
    contentDigest:`sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`};
  return {root,file,artifact,bytes};
}

test('completion held read returns exactly original digest and size, including empty source',async t=>{
  for (const bytes of [Buffer.alloc(0),Buffer.from('original'),Buffer.alloc(131073,7)]) {
    const f=fixture(t,bytes);
    assert.deepEqual(await readManagedEvidence(f.root,f.artifact,bytes.length),bytes);
  }
});

for(const change of ['same-size','shorter','longer']) test(`completion refuses ${change} source substitution before durable re-receipt`,async t=>{
  const f=fixture(t);
  fs.writeFileSync(f.file,change==='same-size'?Buffer.alloc(f.bytes.length,1):change==='shorter'?'x':Buffer.alloc(f.bytes.length+1));
  await assert.rejects(readManagedEvidence(f.root,f.artifact,1000),/OBSERVABILITY_EVIDENCE_SOURCE_CHANGED/);
});

test('completion precap rejects before opening and allocating producer source',async t=>{
  const f=fixture(t);let opened=false;
  t.mock.method(fs.promises,'open',async()=>{opened=true;throw Error('unexpected open');});
  await assert.rejects(readManagedEvidence(f.root,f.artifact,f.bytes.length-1),/OBJECT_TOO_LARGE/);
  assert.equal(opened,false);
});

for(const mutation of ['grow','rewrite','cancel'])test(`held completion source ${mutation} cannot publish bytes`,async t=>{
  const f=fixture(t,Buffer.alloc(131073,7)); const controller=new AbortController();
  const open=fs.promises.open.bind(fs.promises);let changed=false,closed=false;
  t.mock.method(fs.promises,'open',async(...args)=>{
    const h=await open(...args), read=h.read.bind(h), close=h.close.bind(h);
    h.close=async()=>{closed=true;return close();};
    h.read=async(...readArgs)=>{
      const result=await read(...readArgs);
      if(!changed){changed=true;
        if(mutation==='grow')fs.appendFileSync(f.file,'extra');
        else if(mutation==='rewrite')fs.writeFileSync(f.file,Buffer.alloc(f.bytes.length,9));
        else controller.abort(Error('original cancellation'));
      }
      return result;
    };
    return h;
  });
  await assert.rejects(readManagedEvidence(f.root,f.artifact,f.bytes.length,controller.signal),
    mutation==='cancel'?/original cancellation/:/SOURCE_CHANGED/);
  assert(changed);assert(closed);
});

// Actual completion function, real producer file; durable store boundary modeled.
// No independent/native/inputStore sealing acceptance is inferred.
function completion(t) {
  const f=fixture(t), events=[];
  const envelope={pipelineRunId:'run:original',moduleId:'module:original',gateId:'gate:original',
    planId:'plan:original',nodeId:'node:original',attemptId:'attempt:original',
    claim:{claimId:'claim:original',generation:1,workerId:'worker:original'},limits:{evidenceBytes:1000}};
  const result={schemaVersion:'worker-attempt-result.v1',protocolVersion:'worker-protocol.v1',
    attemptId:envelope.attemptId,claimId:envelope.claim.claimId,claimGeneration:1,workerId:envelope.claim.workerId,
    state:'completed',startedAt:'2026-10-16T19:00:00Z',completedAt:'2026-10-16T19:00:01Z',durationMs:1000,
    summary:'original',specialistResult:null,error:null,evidence:[{evidenceId:'evidence:original',type:'log',artifact:f.artifact}],
    resources:{logBytes:0,resultBytes:100,evidenceBytes:f.bytes.length},cleanup:{state:'not_required',summary:null},
    exitCode:0,signal:null,resultDigest:`sha256:${'a'.repeat(64)}`,receipt:{receiptId:'receipt:original',receiptDigest:`sha256:${'b'.repeat(64)}`}};
  const owner={options:{artifactRoot:f.root},authorityId:'authority:original',now:()=>new Date('2026-10-16T19:00:02Z'),
    attemptStore:{async storeEvidence(meta,bytes){events.push(['evidence',meta,bytes]);return {evidenceId:meta.evidenceId,type:meta.type,artifact:{...f.artifact}};},
      async storeResult(...args){events.push(['result',...args]);},async resumeCompletion(){events.push(['admit']);}},admissionStore:{}};
  return {...f,events,envelope,result,owner};
}

test('actual completion rejects changed original bytes before durable evidence/result/closure',async t=>{
  const f=completion(t);fs.writeFileSync(f.file,Buffer.alloc(f.bytes.length,3));
  await assert.rejects(persistRunnerCompletion(f.owner,f.envelope,f.result),/SOURCE_CHANGED/);
  assert.deepEqual(f.events,[]);
});

test('actual completion keeps original producer claim/result despite mutation during durable write',async t=>{
  const f=completion(t), store=f.owner.attemptStore.storeEvidence;
  f.owner.attemptStore.storeEvidence=async(...args)=>{
    f.result.summary='substituted';f.result.receipt.receiptId='receipt:substituted';
    f.envelope.claim.generation=99;f.envelope.moduleId='module:substituted';return store(...args);
  };
  const result=await persistRunnerCompletion(f.owner,f.envelope,f.result);
  assert.equal(result.summary,'original');assert.equal(result.claimGeneration,1);
  const persisted=f.events.find(x=>x[0]==='result');
  assert.equal(persisted[3].record.correlation.moduleId,'module:original');
  assert.equal(persisted[3].record.correlation.claimGeneration,1);
  assert.equal(f.events.at(-1)[0],'admit');
});

test('actual completion cancellation after evidence write never stores passing result/intent',async t=>{
  const f=completion(t), controller=new AbortController(), store=f.owner.attemptStore.storeEvidence;
  f.owner.options.signal=controller.signal;
  f.owner.attemptStore.storeEvidence=async(...args)=>{const result=await store(...args);controller.abort(Error('cancelled before receipt'));return result;};
  await assert.rejects(persistRunnerCompletion(f.owner,f.envelope,f.result),/cancelled before receipt/);
  assert.deepEqual(f.events.map(x=>x[0]),['evidence']);
});
