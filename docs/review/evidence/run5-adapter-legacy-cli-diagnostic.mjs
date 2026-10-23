import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {materializeHistoricalRuntime} from '../../../tests/fixtures/historical-runtime-producers.mjs';
const root=path.resolve(process.argv[2]);
const started=performance.now();
const phase=name=>console.error(JSON.stringify({diagnostic:'legacy-cli-phase',phase:name,elapsedMs:Math.round(performance.now()-started)}));
phase('verify-original-provenance');
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
// Materialize the complete hash-verified original runtime and dependency closure,
// never combine archived snapshots with the current CONFIG engine.
phase('materialize-original-runtime');
const oldCore=materializeHistoricalRuntime(staging,'projectCli',root);
phase('original-runtime-materialized');
for(const entry of provenance.files.filter(entry=>entry.sourcePath.startsWith('skills/nova/core/'))){
 fs.copyFileSync(path.join(archive,entry.archivePath),path.join(oldCore,entry.sourcePath.slice('skills/nova/core/'.length)));
}
const original=path.join(root,'tests/verification/contracts/check-project-compiler.mts');
const temporary=path.join(path.dirname(original),`.legacy-resume-cutover-${process.pid}.mts`);
// Run against the clean baseline before the authoring test writes progress.json.
const marker='  await checkLegacyProjectImport({ project, platformFile, temporary, runtime, compilerFile });';
const originalSource=fs.readFileSync(original,'utf8');
const childImport="import { execFileSync, spawnSync } from 'node:child_process';";
if(originalSource.split(childImport).length!==2)throw new Error('ORIGINAL_SPAWN_BOUNDARY_CHANGED');
// Publish the parent's already-compiled modules before synchronous children start.
// Node normally flushes on exit, too late for this still-running parent to share.
const source=originalSource.replace(childImport,`import { execFileSync, spawnSync as originalSpawnSync } from 'node:child_process';
import { flushCompileCache } from 'node:module';
const spawnSync = (...args) => { flushCompileCache(); return originalSpawnSync(...args); };`);
if(source.split(marker).length!==2)throw new Error('ORIGINAL_HOOK_BOUNDARY_CHANGED');
const hook=String.raw`
  const legacyStarted=performance.now();
  const legacyPhase=phase=>console.error(JSON.stringify({diagnostic:'legacy-cli-hook-phase',phase,elapsedMs:Math.round(performance.now()-legacyStarted)}));
  legacyPhase('prepare-historical-project');
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
  // Original engine discovery must use its own original packages, not current CONFIG manifests.
  const historicalRoots=['common','nova'].map(role=>path.resolve(process.env.REVIEW_HISTORICAL_CORE,'../..',role,'plugins'));
  const historicalPlatform={...platform,installationRoots:historicalRoots,trustedBuiltinRoots:historicalRoots};
  delete historicalPlatform.corePolicySelection;
  historicalPlatform.adapters=structuredClone(platform.adapters);
  // byteProfile belongs to the current transport schema; the original producer predates it.
  for(const target of Object.values(historicalPlatform.adapters['kubeclaw.runtime-dispatch:runtime'].targets))delete target.byteProfile;
  legacyPhase('historical-pipeline');
  const oldRun=await historical.runPipelineV2(historicalPlatform,oldDefinition,project.runId);
  console.log(JSON.stringify({diagnostic:'historical-source-stage-results',stages:[...oldRun.stages]}));
  for(const file of fs.readdirSync(platform.storageRoot,{recursive:true}).filter(file=>String(file).endsWith('events.jsonl')))console.log(JSON.stringify({diagnostic:'original-events',file,content:fs.readFileSync(path.join(platform.storageRoot,file),'utf8')}));
  assert.equal(oldRun.stages.get('source-preflight').status,'succeeded');
  assert.equal(oldRun.stages.get('blueprint-sync').status,'succeeded');
  assert.equal(oldRun.stages.get('implement-library').status,'blocked');
  fs.writeFileSync(projectFile,JSON.stringify(project));fs.writeFileSync(platformFile,JSON.stringify(platform));
  const runFiles=fs.readdirSync(platform.storageRoot,{recursive:true}).filter(file=>/\/(?:run-snapshot\.json|events\.jsonl)$/.test(String(file))).map(file=>path.join(platform.storageRoot,file));
  const before=runFiles.map(file=>fs.readFileSync(file));
  const historicalProject=path.resolve(process.env.REVIEW_HISTORICAL_CORE,'../project');
  const historicalPlatformFile=path.join(temporary,'historical-platform.json');
  fs.writeFileSync(historicalPlatformFile,JSON.stringify(historicalPlatform));
  const unfixedCLI=path.join(historicalProject,'.review-unfixed-cli-'+process.pid+'.ts');
  try{
    fs.writeFileSync(unfixedCLI,fs.readFileSync(path.join(root,'tests/verification/reliability/fixtures/legacy-source-producer/project/cli.ts.txt')),{flag:'wx'});
    legacyPhase('unfixed-cli');
    const baseline=spawnSync(process.execPath,[unfixedCLI,'--platform',historicalPlatformFile,'--project',projectFile,'--recover',project.runId],{cwd:temporary,encoding:'utf8',timeout:30000});
    console.log(JSON.stringify({scope:'original-unfixed-cli-with-new-compiler',status:baseline.status,stderr:baseline.stderr}));
    assert.equal(baseline.status,1);assert.match(baseline.stderr,/RECOVERY_GRAPH_DIGEST_MISMATCH/);
  }finally{fs.rmSync(unfixedCLI,{force:true});}
  legacyPhase('original-cli-resume');
  const resume=spawnSync(process.execPath,[path.join(historicalProject,'cli.ts'),'--platform',historicalPlatformFile,'--project',projectFile,'--recover',project.runId],{cwd:temporary,encoding:'utf8',timeout:30000});
  console.log(JSON.stringify({scope:'original-project-legacy-cli-recovery',oldIdentity:oldRun.identity,stageCount:oldDefinition.stages.length,resumeStatus:resume.status,resumeStdout:resume.stdout,resumeStderr:resume.stderr}));
  assert.equal(resume.status,1);
  assert.match(resume.stderr,/RECOVERY_RUN_TERMINAL:run:project-proof:run.blocked/);
  assert.doesNotMatch(resume.stderr,/RECOVERY_GRAPH_DIGEST_MISMATCH/);
  assert.deepEqual(runFiles.map(file=>fs.readFileSync(file)),before);
  // Maintained CONFIG must still deny missing original Core policy; no latest-policy fallback.
  legacyPhase('maintained-cli-denial');
  const maintained=spawnSync(process.execPath,[path.join(runtime,'pipeline.ts'),'--platform',platformFile,'--project',projectFile,'--recover',project.runId],{cwd:temporary,encoding:'utf8',timeout:30000});
  assert.equal(maintained.status,1);assert.match(maintained.stderr,/RECOVERY_CORE_POLICY_MISSING/);
  assert.deepEqual(runFiles.map(file=>fs.readFileSync(file)),before);
  legacyPhase('legacy-hook-complete');
`;
try{
 fs.writeFileSync(temporary,source.replace(marker,hook+'\n'+marker),{flag:'wx'});
 phase('execute-original-contract-with-legacy-hook');
 // All CLI descendants share only this run-owned bytecode cache. Node keys it by
 // runtime and source bytes; original sources, import-audit permissions and the
 // existing 120-second deadlines remain unchanged. Cleanup removes it with staging.
 const result=spawnSync(process.execPath,[temporary],{cwd:root,stdio:'inherit',timeout:120000,env:{...process.env,NODE_COMPILE_CACHE:path.join(staging,'compile-cache'),REVIEW_HISTORICAL_CORE:oldCore}});
 console.error(JSON.stringify({diagnostic:'legacy-cli-phase',phase:'original-contract-terminal',elapsedMs:Math.round(performance.now()-started),status:result.status,signal:result.signal,errorCode:result.error?.code??null}));
 process.exitCode=result.status??1;
}finally{fs.rmSync(temporary,{force:true});fs.rmSync(staging,{recursive:true,force:true});}
