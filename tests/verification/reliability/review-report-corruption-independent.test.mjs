import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const child=fileURLToPath(new URL('./review-report-locale-child.mjs',import.meta.url));
function run(root,mode,phase){
 return execFileSync(process.execPath,[child,root,mode,phase],{encoding:'utf8',timeout:15000,
  env:{...process.env,LANG:'en_US.UTF-8',LC_ALL:'en_US.UTF-8'},stdio:['ignore','pipe','pipe']});
}
for(const mode of ['legacy','portable'])for(const fault of ['missing','corrupt'])test(`original governor rejects actual ${mode} report blob ${fault}`,()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'report-corruption-'));
 try{
  const produced=JSON.parse(run(root,mode,'writer'));assert.equal(produced.error,null);
  const journal=path.join(root,'effects.jsonl'),before=fs.readFileSync(journal);
  const hash=produced.artifact.digest.slice(7),blob=path.join(root,'artifacts','blobs','sha256',hash.slice(0,2),hash.slice(2));
  const original=fs.readFileSync(blob);assert.equal(original.length,produced.artifact.sizeBytes);
  if(fault==='missing')fs.unlinkSync(blob);
  else{const damaged=Buffer.from(original);damaged[0]^=1;fs.writeFileSync(blob,damaged);}
  assert.throws(()=>run(root,mode,'readers'),error=>{
   assert.equal(error.status,1);
   assert.match(String(error.stderr),/prior review|governor history|receipt.status|strictEqual/);
   return true;
  });
  const after=fs.readFileSync(journal);assert.deepEqual(after.subarray(0,before.length),before,'Original completed report write remains unchanged');
  const entries=after.toString().trimEnd().split('\n').map(line=>JSON.parse(line).entry);
  const failure=entries.at(-1).receipt;
  assert.equal(failure.status,'failed');
  assert.deepEqual(failure.error,{code:'adapter.effect_failed',message:fault==='missing'?'ARTIFACT_NOT_FOUND':'ARTIFACT_INTEGRITY_FAILED'});
  assert.equal(entries.filter(entry=>entry.type==='requested'&&entry.request.capability==='artifacts.write').length,1,'Reader cannot repeat original report write');
  process.stdout.write(JSON.stringify({mode,fault,actualBlobFault:true,originalWritePrefixUnchanged:true,readerRejected:true})+'\n');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
