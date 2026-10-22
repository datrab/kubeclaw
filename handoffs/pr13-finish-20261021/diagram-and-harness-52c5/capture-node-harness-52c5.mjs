import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { pathToFileURL } from 'node:url';
const root='/home/node/.openclaw/workspace/kubeclaw-pr13-recovery';
const output='/home/node/.openclaw/workspace/tmp/pr13-finish-20261021/node-harness-52c5-data';
fs.mkdirSync(output);
const hash=value=>createHash('sha256').update(value).digest('hex');
const names=['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'];
let denied=0;
for(const name of names)childProcess[name]=()=>{denied++;throw new Error('Capture denies child process '+name);};
syncBuiltinESMExports();
const custody=await import(pathToFileURL(path.join(root,'scripts/docs-api-documentation-role-custody.mjs')));
const sources=['scripts/tests/docs-check-refs.test.mjs','scripts/docs-check-refs.mjs'];
const before=Object.fromEntries(sources.map(source=>[source,hash(fs.readFileSync(path.join(root,source)))]));
const capture=()=>Object.fromEntries(sources.map(source=>{
 const bytes=fs.readFileSync(path.join(root,source),'utf8');
 const result={sourceSha256:hash(bytes),declarations:custody.nodeEntryDeclarationReceipt(source,bytes),initialization:custody.nodeEntryInitializationReceipt(source,bytes)};
 if(source.endsWith('.test.mjs'))result.selectors=custody.documentationSelectorReceipt(custody.documentationExecutableSelectors(source,bytes,root));
 else {
  const old=custody.reviewedRootNodeEntryRecipes.closure.find(record=>record.source===source);
  // Bind each original selected source-owned unit to the same declared symbol.
  // Native declarations contain only kind/hash; TS source ranges supply range DATA.
  result.priorClosure=old;
 }
 return [source,result];
}));
const first=capture(),repeat=capture();assert.deepEqual(first,repeat);assert.equal(denied,0);
for(const source of sources)assert.equal(hash(fs.readFileSync(path.join(root,source))),before[source]);
for(const [name,value]of [['first.json',first],['repeat.json',repeat],['summary.json',{before,firstRepeatEqual:true,childProcessAttempts:denied,childrenAuthorized:false}]])fs.writeFileSync(path.join(output,name),JSON.stringify(value,null,2)+'\n');
console.log(JSON.stringify({firstRepeatEqual:true,childProcessAttempts:denied,sources}));
