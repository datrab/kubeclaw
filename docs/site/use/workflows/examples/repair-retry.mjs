#!/usr/bin/env node
// Retained-state Core rehearsal: trusted repository TEST stages, native Git, production artifact store.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {budgetFixture} from '../../../../../tests/verification/reliability/repair-budget-fixture.mjs';
import {runRoot} from '../../../../../skills/nova/core/execution/run-root.ts';
import {parseJournalRecords} from '../../../../../skills/nova/core/state/journal.ts';
import {recoverStageStates} from '../../../../../skills/nova/core/lifecycle/recovery.ts';
import {sha256Bytes} from '../../../../../skills/common/plugin-runtime/sdk/src/index.ts';
const sourceRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../../..');
const [operation,root]=process.argv.slice(2);
assert.equal(process.argv.length,4,'Usage: repair-retry.mjs prepare|run|verify|cleanup NEW_ABSOLUTE_DIRECTORY');
assert(root&&path.isAbsolute(root)&&path.normalize(root)===root&&root!=='/','Select a temporary directory with an absolute path. Its path must agree with the output of path.normalize for that path.');
process.chdir(sourceRoot);
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const write=(file,value)=>fs.writeFileSync(path.join(root,file),JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
const revision=()=>execFileSync('git',['rev-parse','HEAD'],{cwd:sourceRoot,encoding:'utf8'}).trim();
function pins(directory){let cursor=path.parse(directory).root;for(const part of directory.slice(cursor.length).split(path.sep).filter(Boolean)){cursor=path.join(cursor,part);const stat=fs.lstatSync(cursor);assert(stat.isDirectory()&&!stat.isSymbolicLink(),`Unsafe path ${cursor}`);}}
function owned(){pins(root);const marker=read(path.join(root,'owner.json'));assert.equal(marker.root,root);assert.equal(marker.sourceRoot,sourceRoot);assert.equal(marker.uid,process.getuid());assert.equal(marker.revision,revision(),'Source HEAD changed. Keep the fixture. Stop.');return marker;}
function records(file){const result=[];parseJournalRecords(fs.readFileSync(file),result,file);return result;}
function tree(directory){return fs.readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(entry=>{assert(!entry.isSymbolicLink(),'Unexpected preserved-state symlink');const file=path.join(directory,entry.name);return entry.isDirectory()?tree(file).map(child=>({...child,file:path.join(entry.name,child.file)})):[{file:entry.name,digest:sha256Bytes(fs.readFileSync(file))}];});}
function cli(directory,args,name,exitCode){const result=spawnSync(process.execPath,[path.join(sourceRoot,'skills/nova/core/cli.ts'),'--platform',path.join(directory,'platform.json'),...args],{cwd:sourceRoot,encoding:'utf8',timeout:60000,maxBuffer:16*1024**2});fs.writeFileSync(path.join(directory,name+'.stdout'),result.stdout??'',{flag:'wx'});fs.writeFileSync(path.join(directory,name+'.stderr'),result.stderr??'',{flag:'wx'});fs.writeFileSync(path.join(directory,name+'.command.json'),JSON.stringify({args,exitCode:result.status,signal:result.signal,error:result.error?.message??null}),{flag:'wx'});assert(!result.error&&!result.signal,`Process failure ${name}`);assert.equal(result.status,exitCode,`${name}: inspect retained output`);return result;}
function capture(directory,label,runId){const raw=path.join(directory,label);fs.mkdirSync(raw);for(const name of ['state','artifacts'])fs.cpSync(path.join(directory,name),path.join(raw,name),{recursive:true});fs.writeFileSync(path.join(raw,'manifest.json'),JSON.stringify(tree(raw)),{flag:'wx'});for(const entry of fs.readdirSync(runRoot(path.join(raw,'state'),runId))){if(entry.endsWith('.jsonl'))records(path.join(runRoot(path.join(raw,'state'),runId),entry));}return raw;}
if(operation==='prepare'){
 assert.equal(process.versions.node.split('.')[0],'24');assert(!fs.existsSync(root),'Do not use a fixture at the selected path again.');pins(path.dirname(root));fs.mkdirSync(root,{mode:0o700});write('owner.json',{root,sourceRoot,uid:process.getuid(),revision:revision()});
 for(const [name,failures,technical]of [['mixed',{lint:[1],review:[2],test:[3]},{source:[1]}],['technical-exhausted',{}, {source:[1,2]}],['extra-order',{lint:[1,2,3],test:[4]},{}]]){
  const directory=path.join(root,name);fs.mkdirSync(directory);const f=budgetFixture(directory,failures,technical);for(const [file,value]of [['platform.json',f.platform],['pipeline.json',f.definition]])fs.writeFileSync(path.join(directory,file),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
 }
 console.log(JSON.stringify({status:'prepared',execution:false,sourceRevision:revision()}));
}else if(operation==='run'){
 owned();assert(!fs.existsSync(path.join(root,'verification.json')),'Use verify. Or prepare a NEW fixture.');write('run-started.json',{schemaVersion:'repair-rehearsal-run-intent.v1',sourceRevision:read(path.join(root,'owner.json')).revision,startedAt:new Date().toISOString()});
 for(const [name,status]of [['mixed','succeeded'],['technical-exhausted','blocked'],['extra-order','waiting']]){
  const directory=path.join(root,name),runId='run:repair-rehearsal:'+name;
  const args=['--pipeline',path.join(directory,'pipeline.json'),'--run-id',runId];
  const first=JSON.parse(cli(directory,args,'run',status==='succeeded'?0:1).stdout);assert.equal(first.status,status);capture(directory,'raw-before-first-audit',runId);cli(directory,['--audit',runId],'first-audit',0);
  if(name==='extra-order'){
   const wait=first.stages.lint.wait;const signal={schemaVersion:'resume-signal.v2',signalId:'signal:one-extra',idempotencyKey:'key:one-extra',waitId:wait.waitId,signalType:wait.signalType,issuer:wait.authorizedIssuer,issuedAt:new Date().toISOString(),payload:{repairAuthorization:{pendingDigest:wait.request.repairAuthorization.digest,reason:'Examine the preserved findings. Give approval for one more source repair only.'}}};
   const bad=structuredClone(signal);bad.payload.repairAuthorization.pendingDigest='sha256:'+'0'.repeat(64);fs.writeFileSync(path.join(directory,'invalid-signal.json'),JSON.stringify(bad),{flag:'wx'});fs.writeFileSync(path.join(directory,'signal.json'),JSON.stringify(signal),{flag:'wx'});
   const eventFile=path.join(runRoot(path.join(directory,'state'),runId),'events.jsonl');const before=fs.readFileSync(eventFile);capture(directory,'raw-before-invalid-resume',runId);const rejected=cli(directory,[...args,'--signal',path.join(directory,'invalid-signal.json')],'invalid-resume',1);assert.match(rejected.stderr,/REPAIR_AUTHORIZATION_INVALID/);assert.deepEqual(fs.readFileSync(eventFile),before,'Rejected digest changed lifecycle');
   capture(directory,'raw-before-valid-resume',runId);const final=JSON.parse(cli(directory,[...args,'--signal',path.join(directory,'signal.json')],'resume',1).stdout);assert.equal(final.status,'blocked');capture(directory,'raw-before-final-audit',runId);cli(directory,['--audit',runId],'final-audit',0);
  }
 }
 verify();
}else if(operation==='verify'){owned();verify();}
else if(operation==='cleanup'){owned();fs.rmSync(root,{recursive:true});console.log(JSON.stringify({status:'owned-fixture-removed',root}));}
else throw new Error('Unknown operation');
function verify(){
 const observations=[];
 for(const name of ['mixed','technical-exhausted','extra-order']){
  const directory=path.join(root,name),runId='run:repair-rehearsal:'+name;
  for(const label of ['raw-before-first-audit',...(name==='extra-order'?['raw-before-invalid-resume','raw-before-valid-resume','raw-before-final-audit']:[])]){const captureRoot=path.join(directory,label);assert.deepEqual(tree(captureRoot).filter(entry=>entry.file!=='manifest.json'),read(path.join(captureRoot,'manifest.json')));const capturedRun=runRoot(path.join(captureRoot,'state'),runId);for(const file of fs.readdirSync(capturedRun))if(file.endsWith('.jsonl'))records(path.join(capturedRun,file));}
  const finalName=name==='extra-order'?'resume':'run';const output=read(path.join(directory,finalName+'.stdout'));const definition=read(path.join(directory,'pipeline.json'));const finalRaw=name==='extra-order'?'raw-before-final-audit':'raw-before-first-audit';const raw=path.join(directory,finalRaw);const manifest=read(path.join(raw,'manifest.json'));assert.deepEqual(tree(raw).filter(entry=>entry.file!=='manifest.json'),manifest);
  const journal=records(path.join(runRoot(path.join(raw,'state'),runId),'events.jsonl'));const replay=recoverStageStates(definition,journal,runId,'nova');for(const [id,state]of replay)assert.deepEqual(state,output.stages[id],`Replay differs ${name}/${id}`);
  const source=output.stages.source,ledger=source.repairLedger??[];
  if(name==='mixed'){assert.equal(output.status,'succeeded');assert.equal(source.attemptsUsed,5);assert.equal(source.technicalRetriesUsed,1);assert.deepEqual(ledger.map(order=>order.category),['lint','review','test']);assert.equal(output.stages.lint.attemptsUsed,4);assert.equal(output.stages.review.attemptsUsed,3);assert.equal(output.stages.test.attemptsUsed,2);}
  if(name==='technical-exhausted'){assert.equal(output.status,'blocked');assert.equal(source.attemptsUsed,2);assert.equal(source.technicalRetriesUsed,1);assert.equal(ledger.length,0);}
  if(name==='extra-order'){assert.equal(output.status,'blocked');assert.equal(source.attemptsUsed,4);assert.equal(ledger.length,3);assert.equal(ledger.filter(order=>order.authorization).length,1);assert.equal(output.stages.test.pendingRepair.category,'test');assert.equal(output.stages.lint.attemptsUsed,4);}
  observations.push({scenario:name,status:output.status,sourceAttempts:source.attemptsUsed,technicalRetries:source.technicalRetriesUsed??0,repairCategories:ledger.map(order=>order.category),eventCount:journal.length});
 }
 const result={status:'verified-core-retry-repair-rehearsal',scope:'This rehearsal uses trusted TEST checker stages, Core, native Git, file journals, and the artifact store. It is not a product implementation project.',observations};if(!fs.existsSync(path.join(root,'verification.json')))write('verification.json',result);else assert.deepEqual(read(path.join(root,'verification.json')),result);console.log(JSON.stringify(result));
}
