import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

// Add an execution assertion after all original compile-only assertions.
// No production source, graph stage, adapter or original assertion is replaced.
const root=path.resolve(process.argv[2] ?? '.');
const original=path.join(root,'tests/verification/contracts/check-project-compiler.mts');
const temporary=path.join(path.dirname(original),`.project-cli-execution-${process.pid}.mts`);
const marker='  await checkLegacyProjectImport({ project, platformFile, temporary, runtime, compilerFile });';
const hook=String.raw`
  fs.writeFileSync(projectFile, JSON.stringify(project));
  fs.writeFileSync(platformFile, JSON.stringify(platform));
  const authored=structuredClone(project);
  for(const module of authored.modules){delete module.dependsOn; delete module.blueprint.modulePath;}
  const authoringFile=path.join(temporary,'scaffold-authoring.json');
  fs.writeFileSync(authoringFile,JSON.stringify({schemaVersion:'nova-project-legacy-import.v1',project:authored,moduleIds:{app:'app',library:'library'},gateDecisions:{},acknowledgeLegacyPolicy:true}));
  fs.rmSync(projectFile);
  const imported=spawnSync(process.execPath,[path.join(runtime,'pipeline.ts'),'--import-legacy',path.join(repo,'progress.json'),'--authoring',authoringFile,'--platform',platformFile,'--output',projectFile],{cwd:temporary,encoding:'utf8'});
  console.log(JSON.stringify({scope:'real-scaffold-import-command',status:imported.status,stdout:imported.stdout,stderr:imported.stderr}));
  assert.equal(imported.status,0,imported.stderr);
  assert.deepEqual(compileProject(JSON.parse(fs.readFileSync(projectFile,'utf8'))).definition,compiled.definition);
  const importedGraph=path.join(temporary,'imported-scaffold-graph.json');
  const compiledImport=spawnSync(process.execPath,[path.join(runtime,'pipeline.ts'),'--project',projectFile,'--platform',platformFile,'--compile',importedGraph],{cwd:temporary,encoding:'utf8'});
  assert.equal(compiledImport.status,0,compiledImport.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(importedGraph,'utf8')),compiled.definition);
  console.log(JSON.stringify({scope:'real-imported-scaffold-compile-command',status:compiledImport.status,stdout:compiledImport.stdout,stderr:compiledImport.stderr}));
  const bad=spawnSync(process.execPath,[path.join(runtime,'pipeline.ts'),'--project',projectFile,'--platform',platformFile,'--dry-run'],{cwd:temporary,encoding:'utf8'});
  assert.equal(bad.status,1);assert.match(bad.stderr,/PROJECT_ARGUMENT_INVALID:--dry-run/);
  console.log(JSON.stringify({scope:'obsolete-dry-run-rejected',status:bad.status,stderr:bad.stderr}));
  const executionEnvironment={...process.env};
  delete executionEnvironment.PROJECT_TEST_TOKEN;
  delete executionEnvironment.PROJECT_TEST_SOURCE_KEY;
  const executed=spawnSync(process.execPath,[path.join(runtime,'pipeline.ts'),'--platform',platformFile,'--project',projectFile],
    {cwd:temporary,encoding:'utf8',timeout:60000,env:executionEnvironment});
  console.log(JSON.stringify({scope:'original-project-cli-execution-raw',status:executed.status,signal:executed.signal,stdout:executed.stdout,stderr:executed.stderr,error:executed.error?.message}));
  assert.equal(executed.signal,null);
  const executionResult=JSON.parse(executed.stdout.trim());
  assert.equal(executionResult.runId,project.runId);
  const snapshots=fs.readdirSync(path.join(platform.storageRoot,'runs')).map(name=>path.join(platform.storageRoot,'runs',name,'run-snapshot.json')).filter(file=>fs.existsSync(file));
  assert.equal(snapshots.length,1);
  const snapshot=JSON.parse(fs.readFileSync(snapshots[0],'utf8'));
  assert.equal(snapshot.graph.nodes.length,compiled.definition.stages.length,'the complete compiled graph reaches the original durable run snapshot');
  assert.deepEqual(snapshot.graph.nodes.map(stage=>stage.id).sort(),compiled.definition.stages.map(stage=>stage.id).sort());
  const records=fs.readFileSync(path.join(path.dirname(snapshots[0]),'events.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line).entry);
  console.log(JSON.stringify({scope:'original-project-cli-execution-journal',stages:executionResult.stages,events:records.filter(entry=>['attempt.completed','stage.completed','stage.started'].includes(entry.type))}));
  assert.equal(executionResult.stages['source-preflight'].status,'succeeded');
  assert.equal(executionResult.stages['blueprint-sync'].status,'succeeded');
  for(const stageId of ['source-preflight','blueprint-sync'])assert.ok(records.some(entry=>entry.type==='attempt.completed' && entry.identity.stageId===stageId && entry.payload.result.outcome==='passed' && entry.payload.result.artifacts.length===1));
  const moduleAttempt=records.find(entry=>entry.type==='attempt.completed' && entry.identity.stageId==='implement-library');
  assert.ok(moduleAttempt,'the original first module attempt ran');
  assert.equal(moduleAttempt.payload.result.reason.code,'implementation.effect_reconciliation_required');
  assert.match(moduleAttempt.payload.result.reason.message,/SECRET_UNAVAILABLE:worker$/,'the actual unconfigured external secret boundary is explicit');
  assert.ok(fs.existsSync(moduleAttempt.payload.result.reason.details.workspaceReference.workspacePath),'original Git workspace creation actually completed');
  assert.equal(executionResult.stages['final-test'].status,'pending');
  assert.notEqual(executionResult.status,'succeeded');
  assert.equal(executed.status,1);
  console.log(JSON.stringify({ok:true,scope:'original-project-cli-execution-entry',compiledStageCount:compiled.definition.stages.length,snapshotStageCount:snapshot.graph.nodes.length,sourcePreflight:'passed',blueprintSync:'passed',firstModule:'admitted',applicationExecution:'external-agent-unconfigured',nativeAcceptance:false}));
`;
let source=fs.readFileSync(original,'utf8');
const scaffoldMarker="  execFileSync('git', ['-C', repo, 'add', '.']);";
const scaffoldHook=String.raw`
  const scaffoldRun=(extra=[])=>{
    const run=spawnSync('npm',['run','progress:scaffold','--','--project','proof','--repo',repo,'--swarm',repo,...extra],{cwd:root,encoding:'utf8'});
    console.log(JSON.stringify({scope:'real-scaffold-command',args:extra,status:run.status,stdout:run.stdout,stderr:run.stderr}));
    assert.equal(run.status,0,run.stderr);
  };
  scaffoldRun();
  const scaffoldFile=path.join(repo,'progress.scaffold.json');
  const scaffold=JSON.parse(fs.readFileSync(scaffoldFile,'utf8'));
  scaffold.project='proof'; scaffold.description='Original CLI proof'; scaffold.notes=['Explicit authored provider coverage follows in v2'];
  scaffold.execution_order=['library','app']; scaffold.modules.app.depends_on=['library'];
  fs.writeFileSync(scaffoldFile,JSON.stringify(scaffold));
  scaffoldRun(['--apply']); scaffoldRun(['--check']);
`;
if(source.split(scaffoldMarker).length!==2)throw new Error('SCAFFOLD_HOOK_BOUNDARY_CHANGED');
source=source.replace(scaffoldMarker,scaffoldHook+'\n'+scaffoldMarker);
if(source.split(marker).length!==2)throw new Error('ORIGINAL_HOOK_BOUNDARY_CHANGED');
try{
  fs.writeFileSync(temporary,source.replace(marker,hook+'\n'+marker),{flag:'wx'});
  const result=spawnSync(process.execPath,[temporary],{cwd:root,stdio:'inherit',timeout:120000});
  process.exitCode=result.status??1;
}finally{fs.rmSync(temporary,{force:true});}
