import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';

// Extract actual production declarations without importing the runtime registry.
const root=path.resolve(new URL('../../',import.meta.url).pathname);
const productionSource=fs.readFileSync(path.join(root,'scripts/docs-runtime-consumer-contracts.mjs'),'utf8');
const sandbox={assert,fs,path,crypto};vm.createContext(sandbox);
for(const name of ['reviewedImageAssembly','reviewedImageRecipeBytes']){
 const start=productionSource.indexOf(`\nconst ${name} = new Map(`)+1;
 assert.ok(start>0,`missing production map ${name}`);
 const end=productionSource.indexOf('\n]);',start)+4;assert.ok(end>start);
 vm.runInContext(productionSource.slice(start,end),sandbox,{filename:`production-map:${name}`});
}
for(const name of ['imageAssemblyInstructions','assertImageAssembly']){
 const start=productionSource.indexOf(`\nfunction ${name}(`)+1;
 assert.ok(start>0,`missing production function ${name}`);
 const end=productionSource.indexOf('\n}',start)+2;assert.ok(end>start);
 vm.runInContext(productionSource.slice(start,end),sandbox,{filename:`production-function:${name}`});
}
const {assertImageAssembly,imageAssemblyInstructions,reviewedImageAssembly,reviewedImageRecipeBytes}=
 vm.runInContext('({assertImageAssembly,imageAssemblyInstructions,reviewedImageAssembly,reviewedImageRecipeBytes})',sandbox);
assert.equal(reviewedImageAssembly.size,9);assert.equal(reviewedImageRecipeBytes.size,9);
assert.deepEqual([...reviewedImageAssembly.keys()],[...reviewedImageRecipeBytes.keys()]);
const contract={recipes:[...reviewedImageAssembly].map(([file,digest])=>({path:file,
 originalSelectedInstructionDigest:digest,sha256:reviewedImageRecipeBytes.get(file),preservedRecipeCopy:path.join(root,file)}))};
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function fixture(row,run){
 const root=fs.mkdtempSync('/tmp/pr13-actual-recipe-assertion-');
 try{
  fs.chmodSync(root,0o700);
  const original=fs.readFileSync(row.preservedRecipeCopy);assert.equal(hash(original),row.sha256);
  const target=path.join(root,row.path);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,original);
  run({root,target,original});
 }finally{fs.rmSync(root,{recursive:true,force:true});}
}
for(const row of contract.recipes)test(`actual ANDguard accepts both original maps for ${row.path}`,()=>fixture(row,({root,target,original})=>{
 assert.equal(reviewedImageAssembly.get(row.path),row.originalSelectedInstructionDigest);
 assert.equal(reviewedImageRecipeBytes.get(row.path),row.sha256);
 const result=assertImageAssembly(root,[row.path],'fixture-only');
 assert.equal(result[0].recipeByteDigest,row.sha256);
 assert.equal(result[0].selectedInstructionDigest,row.originalSelectedInstructionDigest);
 fs.appendFileSync(target,'\n# unreviewed comment\n');
 assert.throws(()=>assertImageAssembly(root,[row.path],'fixture-only'),/complete exact recipe-byte authority changed/);
}));
const row=contract.recipes.find(row=>row.path==='docker/Dockerfile.prism-ingestion');
for(const [kind,mutate,oldDigestUnchanged]of [
 ['lowercase-entrypoint',s=>s+'\nentrypoint ["node","other.ts"]\n',true],
 ['lowercase-cmd-leading-space',s=>s+'\n  cmd ["node","other.ts"]\n',true],
 ['arg-base',s=>s.replace(/^ARG NODE_BASE=.*$/m,'ARG NODE_BASE=unreviewed:latest'),true],
 ['env-loader',s=>s+'\nENV NODE_OPTIONS=--require=/tmp/loader.cjs\n',true],
 ['shell',s=>s+'\nSHELL ["/bin/other","-c"]\n',true],
 ['add',s=>s+'\nADD other.ts /app/prism/skills/prism/server/ingestion.ts\n',true],
 ['onbuild',s=>s+'\nONBUILD RUN echo unreviewed\n',true],
 ['parser-directive',s=>'# syntax=unreviewed/frontend\n'+s,true],
 ['escape-directive',s=>'# escape=`\n'+s,true],
])test(`actual ANDguard rejects omitted-control mutation ${kind}`,()=>fixture(row,({root,target,original})=>{
 const changed=mutate(original.toString('utf8'));assert.notEqual(changed,original.toString('utf8'));
 if(oldDigestUnchanged)assert.equal(hash(JSON.stringify(imageAssemblyInstructions(changed))),row.originalSelectedInstructionDigest);
 fs.writeFileSync(target,changed);
 assert.throws(()=>assertImageAssembly(root,[row.path],'fixture-only'),error=>error.message.includes('complete exact recipe-byte authority changed')&&error.message.includes(row.path));
}));
test('actual ANDguard still requires retained selected-instruction map after exact bytes pass',()=>fixture(row,({root,target,original})=>{
 assert.equal(hash(fs.readFileSync(target)),reviewedImageRecipeBytes.get(row.path));
 const old=reviewedImageAssembly.get(row.path);
 try{
  // Mutate only standalone fixture-memory expectation; original files/maps stay bound.
  reviewedImageAssembly.set(row.path,'0'.repeat(64));
  assert.throws(()=>assertImageAssembly(root,[row.path],'fixture-only'),/selected launch\/COPY\/build authority changed/);
 }finally{reviewedImageAssembly.set(row.path,old);}
 assert.equal(assertImageAssembly(root,[row.path],'fixture-only')[0].selectedInstructionDigest,old);
}));
test('actual ANDguard rejects unreviewed recipe before source read',()=>fixture(row,({root})=>{
 assert.throws(()=>assertImageAssembly(root,['docker/UNREVIEWED'],'fixture-only'),/unreviewed launch recipe/);
}));
