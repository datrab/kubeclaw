import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {provider as coverage} from '../../../skills/buster/plugins/coverage-budget/src/provider.js';
import {provider as size} from '../../../skills/buster/plugins/size-budget/src/provider.js';

const artifact=(file:string,mediaType='text/lcov')=>{
 const bytes=fs.readFileSync(file);
 return {artifactId:'input',type:'artifact',mediaType,contentDigest:`sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`,sizeBytes:bytes.length,storageUrl:pathToFileURL(file).href};
};
const coverageInput=(value:any)=>({testIdentity:'snapshot-test',configuration:{values:{minimumLinePercent:0}},inputs:[{name:'coverage-1',kind:'artifact',artifact:value}]});
async function fixture(operation:(root:string)=>Promise<void>){const root=await fsp.mkdtemp(path.join(os.tmpdir(),'quality-input-snapshot-'));try{await operation(root);}finally{await fsp.rm(root,{recursive:true,force:true});}}

test('coverage sparse oversize input is rejected before any read/allocation',()=>fixture(async root=>{
 const file=path.join(root,'large.info');fs.writeFileSync(file,'');fs.truncateSync(file,64*1024*1024+1);
 const input={artifactId:'sparse',type:'coverage',mediaType:'text/lcov',sizeBytes:64*1024*1024+1,contentDigest:`sha256:${'a'.repeat(64)}`,storageUrl:pathToFileURL(file).href};
 const open=fsp.open;let reads=0,closed=false;
 try{fsp.open=(async(...args:Parameters<typeof fsp.open>)=>{const handle=await open(...args);if(String(args[0])===file){const read=handle.read.bind(handle),close=handle.close.bind(handle);handle.read=(async(...values:any[])=>{reads++;return (read as any)(...values);}) as any;handle.close=async()=>{closed=true;await close();};}return handle;}) as any;
  await assert.rejects(coverage().execute(coverageInput(input)),/COVERAGE_LCOV_TOO_LARGE/);
  assert.equal(reads,0);assert.equal(closed,true);
 }finally{fsp.open=open;}
}));

for(const phase of ['read','parse'] as const)test(`coverage real AbortSignal interrupts ${phase} and closes descriptor`,()=>fixture(async root=>{
 const file=path.join(root,'coverage.info');fs.writeFileSync(file,'TN:\nSF:real-source.ts\n'+Array.from({length:15000},(_,i)=>`DA:${i+1},1\n`).join('')+'end_of_record\n');
 const input=coverageInput(artifact(file)),controller=new AbortController(),open=fsp.open;let closed=false;
 try{fsp.open=(async(...args:Parameters<typeof fsp.open>)=>{const handle=await open(...args);if(String(args[0])===file){const read=handle.read.bind(handle),close=handle.close.bind(handle);let reads=0;
   handle.read=(async(...values:any[])=>{const result=await (read as any)(...values);if(++reads===1&&phase==='read')controller.abort(new Error('REAL_READ_CANCEL'));return result;}) as any;
   handle.close=async()=>{await close();closed=true;if(phase==='parse')setImmediate(()=>controller.abort(new Error('REAL_PARSE_CANCEL')));};
  }return handle;}) as any;
  await assert.rejects(coverage().execute(input,{signal:controller.signal}),phase==='read'?/REAL_READ_CANCEL/:/REAL_PARSE_CANCEL/);assert.equal(closed,true);
 }finally{fsp.open=open;}
}));

async function sizeFixture(root:string){
 const workspace=path.join(root,'workspace'),inputs=path.join(workspace,'inputs'),source=path.join(root,'source');
 for(const directory of [workspace,inputs,source])fs.mkdirSync(directory,{recursive:true});
 fs.writeFileSync(path.join(source,'payload.bin'),'a'.repeat(600));
 const tar=path.join(inputs,'output.tar');execFileSync('tar',['--format=ustar','-cf',tar,'-C',source,'payload.bin']);
 const invocation=(sourceArtifact:any,name:string,baseline?:any)=>({attemptId:`attempt:${name}`,testIdentity:'size-snapshot',mode:'blocking',workspace:{repository:'repository',scratch:'scratch',evidence:`evidence-${name}`},configuration:{values:{maximumTotalBytes:1000}},inputs:[{name:'build-output',kind:'artifact',artifact:sourceArtifact},...(baseline?[{name:'baseline',kind:'artifact',artifact:baseline}]:[])],limits:{artifactBytes:1048576,artifactFiles:4}});
 const context=(name:string)=>{fs.mkdirSync(path.join(workspace,`evidence-${name}`),{recursive:true});return {workspaceRoot:workspace,signal:new AbortController().signal,log(){},async invoke(){throw new Error('unexpected capability');}};};
 await size().execute(invocation(artifact(tar,'application/x-tar'),'first'),context('first'));
 const baselineFile=path.join(workspace,'evidence-first','size-budget-baseline.json');
 const baseline=artifact(baselineFile,'application/vnd.kubeclaw.size-budget-baseline+json');
 return {workspace,tar,baselineFile,baseline,invocation,context};
}

for(const format of ['tar','file'] as const)test(`size ${format} measurement detects same-inode mutation after initial verification`,()=>fixture(async root=>{
 const f=await sizeFixture(root);
 const file=format==='tar'?f.tar:path.join(root,'single.bin');if(format==='file')fs.writeFileSync(file,'x'.repeat(32));
 const input=artifact(file,format==='tar'?'application/x-tar':'application/octet-stream'),before=fs.statSync(file);
 const baseline={...f.baseline};Object.defineProperty(baseline,'mediaType',{get(){
  const fd=fs.openSync(file,'r+');try{fs.writeSync(fd,Buffer.from('Z'),0,1,format==='tar'?512:0);}finally{fs.closeSync(fd);}
  fs.utimesSync(file,before.atime,before.mtime);assert.equal(fs.statSync(file).ino,before.ino);
  return 'application/vnd.kubeclaw.size-budget-baseline+json';
 }});
 const name=`changed-${format}`;
 await assert.rejects(size().execute(f.invocation(input,name,baseline),f.context(name)),/SIZE_BUDGET_INPUT_DIGEST_MISMATCH:build-output/);
 assert.equal(fs.existsSync(path.join(f.workspace,`evidence-${name}`,'size-budget-baseline.json')),false);
}));

test('baseline parsing uses the bytes that were actually digest-verified',()=>fixture(async root=>{
 const f=await sizeFixture(root),open=fsp.open;let reads=0;
 try{fsp.open=(async(...args:Parameters<typeof fsp.open>)=>{const handle=await open(...args);if(String(args[0])===f.baselineFile){const read=handle.read.bind(handle);handle.read=(async(...values:any[])=>{
   if(values[3]===0&&++reads===2){const before=fs.statSync(f.baselineFile),bytes=fs.readFileSync(f.baselineFile,'utf8');const changed=bytes.replace(/"totalBytes":\s*600/u,'"totalBytes":601');assert.notEqual(bytes,changed);fs.writeFileSync(f.baselineFile,changed);fs.utimesSync(f.baselineFile,before.atime,before.mtime);}
   return (read as any)(...values);
  }) as any;}return handle;}) as any;
  await assert.rejects(size().execute(f.invocation(artifact(f.tar,'application/x-tar'),'changed-baseline',f.baseline),f.context('changed-baseline')),/SIZE_BUDGET_INPUT_DIGEST_MISMATCH:baseline/);
  assert.equal(fs.existsSync(path.join(f.workspace,'evidence-changed-baseline','size-budget-baseline.json')),false);
 }finally{fsp.open=open;}
}));

test('bounded coverage parser preserves literal LF/CRLF, duplicate-max and genuine-zero semantics',()=>fixture(async root=>{
 const cases=[
  {text:'SF:src/a.ts\nDA:1,0\n',percent:0,total:1},
  {text:'SF:src/a.ts\r\nDA:1,1\r\nend_of_record\r\n',percent:100,total:1},
  {text:'SF:../literal.ts\nDA:1,0\nDA:1,2\nDA:2,0',percent:50,total:2},
  {text:'SF:empty.ts\nSF:real.ts\nDA:1,1',percent:100,total:1},
 ];
 for(const [index,value] of cases.entries()){
  const file=path.join(root,`valid-${index}.info`);fs.writeFileSync(file,value.text);
  const result=await coverage().execute(coverageInput(artifact(file)));
  assert.equal(result.outcome,'passed');assert.equal(result.metrics[0].value,value.percent);assert.equal(result.metrics[2].value,value.total);
 }
 for(const [index,text] of ['', 'SF:no-lines.ts\n', 'DA:1,1\n','SF:src/a.ts\nDA:1,1\r'].entries()){
  const file=path.join(root,`invalid-${index}.info`);fs.writeFileSync(file,text);
  await assert.rejects(coverage().execute(coverageInput(artifact(file))),/COVERAGE_LCOV_(EMPTY|INVALID)/);
 }
}));

for(const phase of ['eof','close'] as const)test(`size file cancellation during final ${phase} prevents baseline publication`,()=>fixture(async root=>{
 const f=await sizeFixture(root),file=path.join(root,'file.bin');fs.writeFileSync(file,'x'.repeat(32));
 const input=artifact(file,'application/octet-stream'),controller=new AbortController(),open=fsp.open;
 try{fsp.open=(async(...args:Parameters<typeof fsp.open>)=>{const handle=await open(...args);if(String(args[0])===file){const read=handle.read.bind(handle),close=handle.close.bind(handle);let endings=0;
  handle.read=(async(...values:any[])=>{const result=await (read as any)(...values);if(result.bytesRead===0&&++endings===2&&phase==='eof')controller.abort();return result;}) as any;
  handle.close=async()=>{await close();if(phase==='close')controller.abort();};
 }return handle;}) as any;
  const name=`cancel-${phase}`;await assert.rejects(size().execute(f.invocation(input,name),{...f.context(name),signal:controller.signal}),/SIZE_BUDGET_CANCELLED/);
  assert.equal(controller.signal.aborted,true);assert.equal(fs.existsSync(path.join(f.workspace,`evidence-${name}`,'size-budget-baseline.json')),false);
 }finally{fsp.open=open;}
}));
