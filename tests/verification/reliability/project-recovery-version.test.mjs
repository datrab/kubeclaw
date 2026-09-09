import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {compileProject} from '../../../skills/nova/project/compiler.ts';
import {compileProjectRecovery} from '../../../skills/nova/project/recovery.ts';
import {graphSnapshot,writeRunSnapshots} from '../../../skills/nova/core/execution/engine-snapshots.ts';
import {runRoot} from '../../../skills/nova/core/execution/run-root.ts';
import {projectSourceFixture} from './project-source-fixture.mjs';
const file=fileURLToPath(import.meta.url);
if(process.argv[2]==='--child'){
 const {project,storageRoot}=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));
 process.stdout.write(JSON.stringify(compileProjectRecovery(project,storageRoot)));
}else{
 for(const legacy of [false,true])test(`Project CLI recovery compiler preserves stored source contract and rejects changed projects; legacy=${legacy}`,async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'project-recovery-version-'));let f;
  try{
   f=await projectSourceFixture(root,{review:true,clean:false});
   const compiled=legacy?compileProject(f.project,'legacy'):compileProject(f.project);
   const storageRoot=path.join(root,'compiler-state'),directory=runRoot(storageRoot,compiled.runId);fs.mkdirSync(directory,{recursive:true});
   writeRunSnapshots(directory,graphSnapshot(compiled.definition,legacy?'execution-graph-snapshot.v2':'execution-graph-snapshot.v3'),{});
   const before=fs.readFileSync(path.join(directory,'run-snapshot.json'));
   const input=path.join(root,'recovery.json');fs.writeFileSync(input,JSON.stringify({project:f.project,storageRoot}));
   const child=()=>JSON.parse(execFileSync(process.execPath,[file,'--child',input],{encoding:'utf8',env:{...process.env,LANG:'sv_SE.UTF-8',LC_ALL:'sv_SE.UTF-8'},stdio:['ignore','pipe','pipe']}));
   assert.deepEqual(child(),compiled);assert.deepEqual(fs.readFileSync(path.join(directory,'run-snapshot.json')),before);
   const changed=structuredClone(f.project);changed.modules[0].task+=' Unreviewed change.';
   fs.writeFileSync(input,JSON.stringify({project:changed,storageRoot}));assert.throws(child,/RECOVERY_GRAPH_DIGEST_MISMATCH/);
   assert.deepEqual(fs.readFileSync(path.join(directory,'run-snapshot.json')),before);
  }finally{await f?.close();fs.rmSync(root,{recursive:true,force:true});}
 });
}
