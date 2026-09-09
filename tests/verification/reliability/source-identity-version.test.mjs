import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {runPipelineV2,resumePipelineV2} from '../../../skills/nova/core/src/index.ts';
import {compileProject} from '../../../skills/nova/project/compiler.ts';
import {reviewIdentityDigest,PORTABLE_JSON_ENCODING} from '@kubeclaw/plugin-sdk';
import {projectSourceFixture} from './project-source-fixture.mjs';

const file=fileURLToPath(import.meta.url);
const run=promisify(execFile);
if(process.argv[2]==='--child'){
  const [mode,root]=process.argv.slice(3);
  const {platform,definition,runId,project}=JSON.parse(fs.readFileSync(path.join(root,'input.json'),'utf8'));
  if(mode==='compile')process.stdout.write(JSON.stringify(compileProject(project).definition));
  else {
    const signal=mode==='resume'?JSON.parse(fs.readFileSync(path.join(root,'signal.json'),'utf8')):undefined;
    const result=signal?await resumePipelineV2(platform,definition,runId,signal):await runPipelineV2(platform,definition,runId);
    process.stdout.write(JSON.stringify({locale:Intl.DateTimeFormat().resolvedOptions().locale,status:result.status,stages:[...result.stages]}));
  }
}else{
  async function child(mode,root,locale){
    const result=await run(process.execPath,[file,'--child',mode,root],{env:{...process.env,LANG:locale,LC_ALL:locale},maxBuffer:8*1024*1024});
    return JSON.parse(result.stdout);
  }
  for(const [writer,reader,legacy,unicode] of [
    ['en_US.UTF-8','sv_SE.UTF-8',false,true],['sv_SE.UTF-8','en_US.UTF-8',false,true],
    ['en_US.UTF-8','sv_SE.UTF-8',true,false],['en_US.UTF-8','sv_SE.UTF-8',true,true],
  ])test(`persisted source approval graph ${writer} -> ${reader}, legacy=${legacy}, Unicode policy=${unicode}`,async()=>{
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'source-version-'));let f;
    try{
      f=await projectSourceFixture(root,{review:true,clean:false});
      const input={platform:f.platform,definition:f.definition,runId:f.runId,project:f.project};
      const save=()=>fs.writeFileSync(path.join(root,'input.json'),JSON.stringify(input));save();
      const compiled=await child('compile',root,writer);
      assert.deepEqual(compiled,await child('compile',root,reader),'actual compiler input bindings are portable');
      const preflight=f.definition.stages.find(stage=>stage.id==='source-preflight');
      assert.equal(preflight.input.source.identityEncoding,PORTABLE_JSON_ENCODING);
      // Policy is an explicitly open contract map. Exercise its Unicode keys through actual capture/consumers.
      if(unicode)preflight.input.contract.policy.localeProbe={ä:1,z:2,a:3};
      if(legacy)delete preflight.input.source.identityEncoding;
      for(const stage of f.definition.stages){
        const binding=stage.input.sourceBinding;if(!binding)continue;
        if(legacy)delete binding.identityEncoding;
        binding.inputDigest=reviewIdentityDigest(preflight.input.contract,preflight.input.source);
      }
      save();
      const paused=await child('run',root,writer);
      assert.equal(paused.status,'waiting',JSON.stringify(paused));
      assert.equal(f.dispatches.length,1);assert.equal(f.messages.length,1);
      const subject=f.dispatches[0].reviewSubject;
      assert.equal(subject.identityEncoding,legacy?undefined:PORTABLE_JSON_ENCODING);
      assert.equal(subject.inputDigest,f.definition.stages.find(stage=>stage.input.sourceBinding).input.sourceBinding.inputDigest);
      const wait=new Map(paused.stages).get('architecture-approval').wait;
      fs.writeFileSync(path.join(root,'signal.json'),JSON.stringify({schemaVersion:'resume-signal.v2',signalId:`signal:${wait.waitId}`,idempotencyKey:`key:${wait.waitId}`,
        waitId:wait.waitId,signalType:wait.signalType,issuer:wait.authorizedIssuer,issuedAt:new Date().toISOString(),payload:{decision:'approved',issuer:wait.authorizedIssuer,reason:'Approve these exact persisted bytes.'}}));
      const resumed=await child('resume',root,reader);
      assert.notEqual(paused.locale,resumed.locale);
      assert.equal(resumed.status,legacy&&unicode?'blocked':'succeeded',JSON.stringify(resumed));
      assert.equal(f.dispatches.length,legacy&&unicode?1:3,'unverifiable legacy binding cannot invoke implementation');
      if(legacy&&unicode){assert.equal(f.git('rev-parse','HEAD'),f.sourceRevision);assert.equal(fs.existsSync(path.join(f.repository,'api.mjs')),false);}
      else {assert.equal(f.git('rev-list','--first-parent','--count',`${f.sourceRevision}..HEAD`),'3');assert.equal(f.git('status','--porcelain'),'');}
    }finally{await f?.close();fs.rmSync(root,{recursive:true,force:true});}
  });
  for(const legacySubject of [false,true])test(`mixed SourceBinding codec rejects before review; legacy subject=${legacySubject}`,async()=>{
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'source-mixed-'));let f;
    try{
      f=await projectSourceFixture(root,{review:true,clean:false});
      const source=f.definition.stages.find(stage=>stage.id==='source-preflight').input.source;
      const binding=f.definition.stages.find(stage=>stage.id==='architecture-review').input.sourceBinding;
      if(legacySubject)delete source.identityEncoding;else delete binding.identityEncoding;
      const result=await runPipelineV2(f.platform,f.definition,f.runId);
      assert.equal(result.status,'blocked');assert.equal(f.dispatches.length,0);assert.equal(f.messages.length,0);
      assert.equal(f.git('rev-parse','HEAD'),f.sourceRevision);
    }finally{await f?.close();fs.rmSync(root,{recursive:true,force:true});}
  });

}
