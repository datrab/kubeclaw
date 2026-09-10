import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const child=fileURLToPath(new URL('./review-report-locale-child.mjs',import.meta.url));
function run(root,mode,locale,phase='writer'){
 const raw=execFileSync(process.execPath,[child,root,mode,phase],{encoding:'utf8',env:{...process.env,LANG:locale,LC_ALL:locale},stdio:['ignore','pipe','pipe']});
 process.stdout.write(raw);return JSON.parse(raw);
}
test('new report CAS identity and original completed receipt replay are native-locale independent',()=>{
 for(const producerLocale of ['en_US.UTF-8','da_DK.UTF-8','tr_TR.UTF-8','sv_SE.UTF-8']){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'report-portable-'));
 try{
  const original=run(root,'portable',producerLocale);assert.equal(original.error,null);
  assert.equal(original.artifact.encoding,'kubeclaw-json.utf16.v1');
  const before=fs.readFileSync(path.join(root,'effects.jsonl'));
  for(const locale of ['en_US.UTF-8','da_DK.UTF-8','tr_TR.UTF-8','sv_SE.UTF-8']){
   const replay=run(root,'portable',locale);assert.equal(replay.error,null);assert.deepEqual(replay.artifact,original.artifact);
   assert.deepEqual(fs.readFileSync(path.join(root,'effects.jsonl')),before,'completed replay writes no journal bytes');
  }
 }finally{fs.rmSync(root,{recursive:true,force:true});}
 }
});
test('archived untagged original reports preserve exact same-locale replay and old cross-locale fail closed',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'report-original-'));
 try{
  const original=run(root,'original','en_US.UTF-8');assert.equal(original.error,null);assert.equal(Object.hasOwn(original.artifact,'encoding'),false);
  const before=fs.readFileSync(path.join(root,'effects.jsonl'));
  const same=run(root,'legacy','en_US.UTF-8');assert.deepEqual(same.artifact,original.artifact);
  const cross=run(root,'legacy','da_DK.UTF-8');assert.match(cross.error,/report reference that does not match/);
  assert.deepEqual(fs.readFileSync(path.join(root,'effects.jsonl')),before);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('actual governor reads the strict report through Core and ArtifactStore in another locale',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'report-governor-'));
 try{
  assert.equal(run(root,'portable','en_US.UTF-8').error,null);
  assert.equal(run(root,'portable','da_DK.UTF-8','readers').error,null);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('actual project-summary consumes a strict original-builder report across locales',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'report-summary-'));
 try{
  const producer=run(root,'portable','en_US.UTF-8','summary-produce');assert.equal(producer.error,null);assert.equal(producer.summary.strict,true);
  const consumer=run(root,'portable','da_DK.UTF-8','summary-consume');assert.equal(consumer.error,null);assert.deepEqual(consumer.summary,producer.summary);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

for(const mode of ['original','portable'])for(const boundary of ['requested','accepted'])test(`genuine ${mode} ${boundary} prefix retains identity and uncertainty`,()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'report-prefix-'));
 try{
  const first=run(root,mode,'en_US.UTF-8');assert.equal(first.error,null);
  const file=path.join(root,'effects.jsonl'),lines=fs.readFileSync(file,'utf8').trimEnd().split('\n');
  const index=lines.findIndex(line=>JSON.parse(line).entry.type===boundary);assert(index>=0);
  const prefix=Buffer.from(lines.slice(0,index+1).join('\n')+'\n');
  fs.writeFileSync(file,prefix); // Exact original persisted prefix, never rehashed.
  const replay=run(root,mode==='original'?'legacy':'portable',mode==='original'?'en_US.UTF-8':'da_DK.UTF-8');
  const after=fs.readFileSync(file);assert.deepEqual(after.subarray(0,prefix.length),prefix);
  if(boundary==='accepted'){
   assert.match(replay.error,/EFFECT_RECOVERY_RECEIPT_UNAVAILABLE/);assert.deepEqual(after,prefix);
  }else{
   assert.equal(replay.error,null);assert.deepEqual(replay.artifact,first.artifact);
   const requests=after.toString().trimEnd().split('\n').map(JSON.parse).filter(record=>record.entry.type==='requested');
   assert.equal(requests.length,1);assert.deepEqual(requests[0],JSON.parse(lines[0]));
  }
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('portable opt-in is not silently applied to an original pending request',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'report-no-migration-'));
 try{
  assert.equal(run(root,'original','en_US.UTF-8').error,null);
  const file=path.join(root,'effects.jsonl'),prefix=Buffer.from(fs.readFileSync(file,'utf8').split('\n')[0]+'\n');fs.writeFileSync(file,prefix);
  const result=run(root,'portable','en_US.UTF-8');assert.equal(result.error,'EFFECT_IDEMPOTENCY_CONFLICT:report:hex:1');
  assert.deepEqual(fs.readFileSync(file),prefix);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
