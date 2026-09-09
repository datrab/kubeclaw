import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHarness} from './adapter-dependency-locale-fixture.mjs';
import {materializeLegacyDependencyCore} from './adapter-dependency-historical.mjs';
import {hashJournalRecord} from '../../../skills/common/plugin-runtime/foundation/observability/hash-journal.ts';

function entries(file){return fs.readFileSync(file,'utf8').trim().split('\n').map(line=>JSON.parse(line).entry);}
function rewritten(file,values){
  let previousHash=null;
  fs.writeFileSync(file,values.map((entry,index)=>{
    const sequence=index+1,hash=hashJournalRecord(sequence,previousHash,entry);
    const record={sequence,previousHash,hash,entry};previousHash=hash;return JSON.stringify(record);
  }).join('\n')+'\n');
}
function consumerFile(directory){return path.join(directory,'plugins/consumer/adapter.mjs');}
const childRequest=entry=>entry.type==='requested'&&entry.request.capability==='network.http';

test('independent genuine legacy child history cannot hide corruption behind an absent or changed requested subject',async t=>{
  const harness=createHarness();
  try{
    const origin=await harness.listen(),directory=harness.fixture('corruption',origin);
    const historical=materializeLegacyDependencyCore(path.join(harness.root,'historical'));
    const producer=await harness.subprocess(directory,'en_US.UTF-8',historical);
    assert.equal(producer.signal,'SIGKILL',producer.err);assert.equal(harness.received.length,1);
    const file=path.join(directory,'effects.jsonl'),original=fs.readFileSync(file),values=entries(file);
    const variants=[
      ['orphan accepted',rows=>rows.filter(row=>!childRequest(row))],
      ['orphan completed',rows=>rows.filter(row=>!(row.request?.capability==='network.http'))],
      ['requested subject differs from accepted',rows=>{rows.find(childRequest).request.payload.body.ä=999;return rows;}],
      ['duplicate child request',rows=>{rows.splice(3,0,structuredClone(rows.find(childRequest)));return rows;}],
      ['child request before original parent',rows=>{const at=rows.findIndex(childRequest);rows.unshift(...rows.splice(at,1));return rows;}],
      ['unknown original request version',rows=>{for(const row of rows)if(row.request?.capability==='network.http')row.request.schemaVersion='effect-request.future';return rows;}],
    ];
    for(const [name,change]of variants){
      rewritten(file,change(structuredClone(values)));
      const resumed=await harness.subprocess(directory,'sv_SE.UTF-8');
      assert.equal(resumed.code,1,`${name}: ${resumed.err}`);
      assert.match(resumed.err,/ADAPTER_DEPENDENCY_(?:HISTORY_INVALID|REQUEST_VERSION_INVALID)/,name);
      assert.equal(harness.received.length,1,name);
      t.diagnostic(`${name}: rejected before another HTTP request`);
    }
    fs.writeFileSync(file,original);
    const resumed=await harness.subprocess(directory,'sv_SE.UTF-8');
    assert.equal(resumed.code,0,resumed.err);assert.equal(harness.received.length,1);
    assert.equal(harness.received[0].rawBody,'{"ä":1,"z":2}');
  }finally{await harness.close();}
});

test('independent genuine two-locale historical ambiguity rejects rather than selecting either recorded child alias',async()=>{
  const harness=createHarness();
  try{
    const origin=await harness.listen(),directory=harness.fixture('ambiguous',origin);
    const file=consumerFile(directory),source=fs.readFileSync(file,'utf8');
    fs.writeFileSync(file,source.replace('async receipt(){return call();}','async receipt(){const result=await call();process.kill(process.pid,"SIGKILL");return result;}'));
    const historical=materializeLegacyDependencyCore(path.join(harness.root,'historical'));
    for(const locale of ['en_US.UTF-8','sv_SE.UTF-8']){
      const old=await harness.subprocess(directory,locale,historical);assert.equal(old.signal,'SIGKILL',old.err);
    }
    assert.equal(harness.received.length,2);
    const before=fs.readFileSync(path.join(directory,'effects.jsonl'));
    const resumed=await harness.subprocess(directory,'sv_SE.UTF-8');
    assert.equal(resumed.code,1,resumed.err);assert.match(resumed.err,/ADAPTER_DEPENDENCY_HISTORY_AMBIGUOUS/);
    assert.equal(harness.received.length,2);
    assert.deepEqual(fs.readFileSync(path.join(directory,'effects.jsonl')),before);
  }finally{await harness.close();}
});

test('independent actual failed legacy HTTP child remains failed across locale recovery without retransmission',async()=>{
  const harness=createHarness();
  harness.server.removeAllListeners('request');
  harness.server.on('request',async(request,response)=>{
    const chunks=[];for await(const chunk of request)chunks.push(chunk);
    harness.received.push({url:request.url,rawBody:Buffer.concat(chunks).toString()});
    response.writeHead(503,{'content-type':'application/json'});response.end('{"error":"deliberate local receiver failure"}');
  });
  try{
    const origin=await harness.listen(),directory=harness.fixture('failed',origin),file=consumerFile(directory);
    fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('const result=await call();process.kill(process.pid,\'SIGKILL\');return result;','try{return await call();}catch(error){process.kill(process.pid,"SIGKILL");throw error;}'));
    const historical=materializeLegacyDependencyCore(path.join(harness.root,'historical'));
    const produced=await harness.subprocess(directory,'en_US.UTF-8',historical);
    assert.equal(produced.signal,'SIGKILL',produced.err);assert.equal(harness.received.length,1);
    const journal=path.join(directory,'effects.jsonl'),before=fs.readFileSync(journal);
    assert.equal(entries(journal).filter(row=>row.type==='completed')[0].receipt.status,'failed');
    const resumed=await harness.subprocess(directory,'sv_SE.UTF-8');
    assert.equal(resumed.code,1,resumed.err);assert.match(resumed.err,/HTTP_503/);
    assert.equal(harness.received.length,1);assert.deepEqual(fs.readFileSync(journal),before);
  }finally{await harness.close();}
});

test('independent SIGKILL after the receiver observed a legacy POST but before its response keeps the child unresolved',async()=>{
  const harness=createHarness();let directory;
  harness.server.removeAllListeners('request');
  harness.server.on('request',async(request,response)=>{
    const chunks=[];for await(const chunk of request)chunks.push(chunk);
    harness.received.push({url:request.url,rawBody:Buffer.concat(chunks).toString()});
    if(harness.received.length===1){
      const pid=Number(fs.readFileSync(path.join(directory,'worker.pid'),'utf8'));
      process.kill(pid,'SIGKILL');return;
    }
    response.writeHead(200,{'content-type':'application/json'});response.end('{"unexpected":"repeat"}');
  });
  try{
    const origin=await harness.listen();directory=harness.fixture('unresolved',origin);
    const file=consumerFile(directory),source=fs.readFileSync(file,'utf8');
    fs.writeFileSync(file,`import fs from 'node:fs';\n${source.replace('async invoke({fence}){fence.assertCurrent();',`async invoke({fence}){fence.assertCurrent();fs.writeFileSync(${JSON.stringify(path.join(directory,'worker.pid'))},String(process.pid));`)}`);
    const historical=materializeLegacyDependencyCore(path.join(harness.root,'historical'));
    const produced=await harness.subprocess(directory,'en_US.UTF-8',historical);
    assert.equal(produced.signal,'SIGKILL',produced.err);assert.equal(harness.received.length,1);
    const journal=path.join(directory,'effects.jsonl'),before=fs.readFileSync(journal);
    assert.equal(entries(journal).filter(row=>row.type==='completed').length,0);
    const resumed=await harness.subprocess(directory,'sv_SE.UTF-8');
    assert.equal(resumed.code,1,resumed.err);assert.match(resumed.err,/EFFECT_RECOVERY_RECEIPT_UNAVAILABLE/);
    assert.equal(harness.received.length,1);assert.deepEqual(fs.readFileSync(journal),before);
  }finally{await harness.close();}
});

test('independent concurrent current producer processes in different locales retain one actual child action and replay',async()=>{
  const harness=createHarness();
  try{
    const origin=await harness.listen(),directory=harness.fixture('concurrent',origin);
    const producers=await Promise.all(['en_US.UTF-8','sv_SE.UTF-8'].map(locale=>harness.subprocess(directory,locale)));
    assert(producers.some(producer=>producer.signal==='SIGKILL'));
    for(const producer of producers){
      if(producer.signal==='SIGKILL'||producer.code===0)continue;
      assert.equal(producer.code,1,producer.err);assert.match(producer.err,/RESOURCE_LOCK_REENTRANT_DENIED/);
    }
    assert.equal(harness.received.length,1);
    const resumed=await harness.subprocess(directory,'sv_SE.UTF-8');
    assert.equal(resumed.code,0,resumed.err);assert.equal(harness.received.length,1);
    assert.equal(new Set(entries(path.join(directory,'effects.jsonl')).filter(childRequest).map(row=>row.request.idempotencyKey)).size,1);
    assert.equal(harness.received[0].rawBody,'{"ä":1,"z":2}');
  }finally{await harness.close();}
});
