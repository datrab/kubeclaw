import assert from 'node:assert/strict';import path from 'node:path';import {execFileSync} from 'node:child_process';
if(process.argv[2]==='child'){
 const original=await import('./legacy-values.ts');
 const current=await import(path.join(process.cwd(),'skills/common/plugin-runtime/sdk/src/values.ts'));
 const values=[{z:1,ä:2,a:3,'😀':4,'𐀀':5},{nested:[-0,1e30,null,true,'\ud800','é'],object:{I:1,ı:2,i:3}},JSON.parse('{"__proto__":{"a":1},"2":2,"10":10}'),[],{}];
 for(const value of values)assert.equal(current.canonicalJson(value),original.canonicalJson(value));
 console.log(JSON.stringify({locale:Intl.DateTimeFormat().resolvedOptions().locale,legacyVectorsIdentical:values.length}));
}else for(const locale of ['en_US.UTF-8','sv_SE.UTF-8','tr_TR.UTF-8'])process.stdout.write(execFileSync(process.execPath,[import.meta.filename,'child'],{env:{...process.env,LANG:locale,LC_ALL:locale},encoding:'utf8'}));
