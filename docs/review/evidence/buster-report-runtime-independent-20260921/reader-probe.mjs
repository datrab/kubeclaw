import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const out=path.dirname(new URL(import.meta.url).pathname);
const repo=process.cwd();
const before=fs.readFileSync('docs/review/evidence/buster-report-runtime-extraction-20260921/report-adapter-runtime.before.txt','utf8').replace("'./process-input.ts'",JSON.stringify(pathToFileURL(path.join(repo,'skills/buster/engine/test-gates/process-input.ts')).href))+'\nexport { readPackage };\n';
const oldFile=path.join(out,'old-runtime.probe.ts');fs.writeFileSync(oldFile,before);
const mutation=path.join(out,'mutant-reader.probe.ts');
fs.writeFileSync(mutation,fs.readFileSync('skills/buster/engine/test-gates/report-artifact-reader.ts','utf8').replace('await handle.close();','/* mutant: descriptor closure removed */'));
const original=await import(pathToFileURL(oldFile));
const current=await import(pathToFileURL(path.join(repo,'skills/buster/engine/test-gates/report-artifact-reader.ts')));
const mutant=await import(pathToFileURL(mutation));
const pkg=await import(pathToFileURL(path.join(repo,'skills/buster/engine/test-gates/report-adapter-package.ts')));
const root=fs.mkdtempSync(path.join(os.tmpdir(),'rr-independent-'));const allowed=path.join(root,'allowed');fs.mkdirSync(allowed);
const file=path.join(allowed,'report');const outside=path.join(root,'outside');fs.writeFileSync(file,'abc');fs.writeFileSync(outside,'abc');fs.symlinkSync(outside,path.join(allowed,'link'));
const artifact={storageUrl:pathToFileURL(file).href,contentDigest:'sha256:'+crypto.createHash('sha256').update('abc').digest('hex'),sizeBytes:3};
const realOpen=fs.promises.open;let cases=0;
async function outcome(Reader,kind){
 const events=[];const handles=[];let injected=false;const reason=new Error('own caller');const c=new AbortController();
 let a={...artifact},max=10;if(kind==='limit')max=2;if(kind==='invalid-limit')max=0;if(kind==='digest')a.contentDigest='sha256:'+'0'.repeat(64);if(kind==='size')a.sizeBytes=4;if(kind==='outside')a.storageUrl=pathToFileURL(outside).href;if(kind==='symlink')a.storageUrl=pathToFileURL(path.join(allowed,'link')).href;if(kind==='aborted')c.abort(reason);
 fs.promises.open=async(...args)=>{events.push(['open',args[1]]);const h=await realOpen(...args);handles.push(h);return new Proxy(h,{get(target,key){if(key==='close')return async()=>{events.push('close');return target.close();};if(key==='read')return async(...args)=>{events.push('read');if(!injected && (kind==='growth'||kind==='shrink')){injected=true;fs.writeFileSync(file,kind==='growth'?'abcd':'a');}return target.read(...args);};const v=target[key];return typeof v==='function'?v.bind(target):v;}});};
 let result;try{result={value:(await new Reader([allowed]).read(a,max,c.signal)).toString()};}catch(e){result={error:e.message,identity:e===reason};}finally{fs.promises.open=realOpen;for(const h of handles)await h.close();fs.writeFileSync(file,'abc');}
 return {result,events};
}
try{
 for(const kind of ['success','limit','invalid-limit','digest','size','outside','symlink','aborted','growth','shrink']){assert.deepEqual(await outcome(current.FileReportArtifactReader,kind),await outcome(original.FileReportArtifactReader,kind),kind);cases++;}
 const expected=await outcome(original.FileReportArtifactReader,'digest');const changed=await outcome(mutant.FileReportArtifactReader,'digest');assert.notDeepEqual(changed,expected);assert.equal(changed.events.includes('close'),false);
 const source=path.join(root,'package');fs.mkdirSync(source);fs.writeFileSync(path.join(source,'b'),'b');fs.mkdirSync(path.join(source,'a'));fs.writeFileSync(path.join(source,'a','é'),'é');
 assert.deepEqual(await pkg.readPackage(source),await original.readPackage(source));
 console.log(JSON.stringify({readerDifferentialCases:cases,checks:'same results, error identity, open flags, read calls, descriptor close on success/rejection',packageDigestAndOrderingEqual:true,descriptorClosureMutantDetected:true},null,2));
}finally{fs.promises.open=realOpen;fs.rmSync(root,{recursive:true,force:true});fs.unlinkSync(oldFile);fs.unlinkSync(mutation);}
