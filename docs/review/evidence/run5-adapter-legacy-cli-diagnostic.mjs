import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
const root=path.resolve(process.argv[2]);
const archive=path.join(root,'tests/verification/reliability/fixtures/legacy-source-producer');
const provenance=JSON.parse(fs.readFileSync(path.join(archive,'provenance.json'),'utf8'));
if(provenance.schemaVersion!=='historical-source-producer.v1'||provenance.files.length!==7)throw new Error('HISTORICAL_PROVENANCE_INVALID');
for(const entry of provenance.files){
 const bytes=fs.readFileSync(path.join(archive,entry.archivePath));
 const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
 const blob=crypto.createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');
 if(bytes.length!==entry.bytes||sha256!==entry.sha256||blob!==entry.gitBlobSha1)throw new Error(`HISTORICAL_SOURCE_INTEGRITY_INVALID:${entry.sourcePath}`);
}
const staging=fs.mkdtempSync(path.join(os.tmpdir(),'legacy-source-producer-'));
const oldCore=path.join(staging,'core');
fs.cpSync(path.join(root,'skills/nova/core'),oldCore,{recursive:true});
fs.symlinkSync(path.join(root,'node_modules'),path.join(staging,'node_modules'),'dir');
for(const entry of provenance.files.filter(entry=>entry.sourcePath.startsWith('skills/nova/core/'))){
 fs.copyFileSync(path.join(archive,entry.archivePath),path.join(staging,entry.sourcePath.slice('skills/nova/'.length)));
}
const original=path.join(root,'tests/verification/contracts/check-project-compiler.mts');
const temporary=path.join(path.dirname(original),`.legacy-resume-cutover-${process.pid}.mts`);
const marker='  console.log(JSON.stringify({ ok: true, scope: archive ?';
const source=fs.readFileSync(original,'utf8');
if(source.split(marker).length!==2)throw new Error('ORIGINAL_HOOK_BOUNDARY_CHANGED');
const hook=String.raw`
  const legacyProjectRoot=path.join(temporary,'legacy-project');
  fs.cpSync(path.join(root,'skills/nova/project'),legacyProjectRoot,{recursive:true});
  fs.symlinkSync(path.join(root,'node_modules'),path.join(temporary,'node_modules'),'dir');
  fs.writeFileSync(path.join(legacyProjectRoot,'source.ts'),fs.readFileSync(path.join(root,'tests/verification/reliability/fixtures/legacy-source-producer/project/source.ts.txt')));
  fs.writeFileSync(path.join(legacyProjectRoot,'compiler.ts'),fs.readFileSync(path.join(root,'tests/verification/reliability/fixtures/legacy-source-producer/project/compiler.ts.txt')));
  const oldCompiler=await import(pathToFileURL(path.join(legacyProjectRoot,'compiler.ts')).href);
  const oldDefinition=oldCompiler.compileProject(project).definition;
  assert.equal(oldDefinition.stages.find(stage=>stage.id==='source-preflight').input.source.identityEncoding,undefined);
  assert.equal(compiled.definition.stages.length,oldDefinition.stages.length);
  const historical=await import(pathToFileURL(process.env.REVIEW_HISTORICAL_CORE+'/src/index.ts').href);
  delete process.env.PROJECT_TEST_TOKEN;delete process.env.PROJECT_TEST_SOURCE_KEY;
  const oldRun=await historical.runPipelineV2(platform,oldDefinition,project.runId);
  console.log(JSON.stringify({diagnostic:'historical-source-stage-results',stages:[...oldRun.stages]}));
  for(const file of fs.readdirSync(platform.storageRoot,{recursive:true}).filter(file=>String(file).endsWith('events.jsonl')))console.log(JSON.stringify({diagnostic:'original-events',file,content:fs.readFileSync(path.join(platform.storageRoot,file),'utf8')}));
  assert.equal(oldRun.stages.get('source-preflight').status,'succeeded');
  assert.equal(oldRun.stages.get('blueprint-sync').status,'succeeded');
  assert.equal(oldRun.stages.get('implement-library').status,'blocked');
  fs.writeFileSync(projectFile,JSON.stringify(project));fs.writeFileSync(platformFile,JSON.stringify(platform));
  const runFiles=fs.readdirSync(platform.storageRoot,{recursive:true}).filter(file=>/\/(?:run-snapshot\.json|events\.jsonl)$/.test(String(file))).map(file=>path.join(platform.storageRoot,file));
  const before=runFiles.map(file=>fs.readFileSync(file));
  const unfixedCLI=path.join(root,'skills/nova/project/.review-unfixed-cli-'+process.pid+'.ts');
  try{
    fs.writeFileSync(unfixedCLI,fs.readFileSync(path.join(root,'tests/verification/reliability/fixtures/legacy-source-producer/project/cli.ts.txt')),{flag:'wx'});
    const baseline=spawnSync(process.execPath,[unfixedCLI,'--platform',platformFile,'--project',projectFile,'--recover',project.runId],{cwd:temporary,encoding:'utf8',timeout:30000});
    console.log(JSON.stringify({scope:'original-unfixed-cli-with-new-compiler',status:baseline.status,stderr:baseline.stderr}));
    assert.equal(baseline.status,1);assert.match(baseline.stderr,/RECOVERY_GRAPH_DIGEST_MISMATCH/);
  }finally{fs.rmSync(unfixedCLI,{force:true});}
  const resume=spawnSync(process.execPath,[path.join(runtime,'pipeline.ts'),'--platform',platformFile,'--project',projectFile,'--recover',project.runId],{cwd:temporary,encoding:'utf8',timeout:30000});
  console.log(JSON.stringify({scope:'original-project-legacy-cli-recovery',oldIdentity:oldRun.identity,stageCount:oldDefinition.stages.length,resumeStatus:resume.status,resumeStdout:resume.stdout,resumeStderr:resume.stderr}));
  assert.equal(resume.status,1);
  assert.match(resume.stderr,/RECOVERY_RUN_TERMINAL:run:project-proof:run.blocked/);
  assert.doesNotMatch(resume.stderr,/RECOVERY_GRAPH_DIGEST_MISMATCH/);
  assert.deepEqual(runFiles.map(file=>fs.readFileSync(file)),before);
`;
try{
 fs.writeFileSync(temporary,source.replace(marker,hook+'\n'+marker),{flag:'wx'});
 const result=spawnSync(process.execPath,[temporary],{cwd:root,stdio:'inherit',timeout:120000,env:{...process.env,REVIEW_HISTORICAL_CORE:oldCore}});
 process.exitCode=result.status??1;
}finally{fs.rmSync(temporary,{force:true});fs.rmSync(staging,{recursive:true,force:true});}
