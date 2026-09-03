import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildAndPushImage } from '../src/runtime/services/buildkit.ts';
import { publishSuiteArtifacts } from '../src/runtime/services/quality-artifacts.ts';
import { writeSuiteResults } from '../src/runtime/runners/suite-runner-artifacts.ts';

const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'buster-security-boundaries-'));
try{
  const contextDir=path.join(temporary,'context');
  const dockerfile=path.join(contextDir,'Dockerfile');
  fs.mkdirSync(contextDir);
  fs.writeFileSync(dockerfile,'FROM scratch\n');
  const calls:string[][]=[];
  const execFileAsync=async(_command:string,args:string[])=>{
    calls.push(args);
    const metadataPath=args[args.indexOf('--metadata-file')+1];
    fs.writeFileSync(metadataPath,JSON.stringify({'containerimage.digest':`sha256:${'a'.repeat(64)}`}));
    return {stdout:'',stderr:''};
  };
  const previous=process.env.KUBECLAW_LOCAL_REGISTRY;
  delete process.env.KUBECLAW_LOCAL_REGISTRY;
  await buildAndPushImage({dockerfile,contextDir,image:'registry.example.com/team/app:test',timeoutMs:1000,execFileAsync});
  assert.doesNotMatch(calls.at(-1)?.join(' ')??'',/registry\.insecure=true/u);
  process.env.KUBECLAW_LOCAL_REGISTRY='registry-local.kubeclaw.svc.cluster.local:5001';
  await buildAndPushImage({dockerfile,contextDir,image:'registry-local.kubeclaw.svc.cluster.local:5001/team/app:test',timeoutMs:1000,execFileAsync});
  assert.match(calls.at(-1)?.join(' ')??'',/registry\.insecure=true/u);
  if(previous===undefined)delete process.env.KUBECLAW_LOCAL_REGISTRY;else process.env.KUBECLAW_LOCAL_REGISTRY=previous;

  const pipelineDir=path.join(temporary,'pipeline');
  const logPath=path.join(pipelineDir,'run-test','logs','pipeline.jsonl');
  fs.mkdirSync(path.dirname(logPath),{recursive:true});
  const allowed=path.join(pipelineDir,'report.json');
  const secret=path.join(temporary,'secret.txt');
  fs.writeFileSync(allowed,'allowed');
  fs.writeFileSync(secret,'secret');
  const telemetry={pipelineRunLogPath:logPath,project:'p',runId:'run-test',emitter:'test'};
  const previousResultsDir=process.env.BUSTER_RESULTS_DIR;
  process.env.BUSTER_RESULTS_DIR=path.join(temporary,'not-created-results');
  const artifacts=publishSuiteArtifacts(telemetry,{moduleId:'m',suiteName:'perf',attempt:1,result:{metadata:{report_path:allowed,secret_path:secret}}});
  assert.equal(artifacts.length,2,'verdict and approved report are published');
  if(previousResultsDir===undefined)delete process.env.BUSTER_RESULTS_DIR;else process.env.BUSTER_RESULTS_DIR=previousResultsDir;
  assert.equal(artifacts.some((artifact:any)=>String(artifact.logical_id).endsWith('/secret_path')),false);
  const symlink=path.join(pipelineDir,'report-link.json');
  fs.symlinkSync(secret,symlink);
  const linked=publishSuiteArtifacts(telemetry,{moduleId:'m',suiteName:'perf',attempt:2,result:{metadata:{report_path:symlink}}});
  assert.equal(linked.length,1,'a symlink escaping approved roots is not published');
  if(process.platform!=='win32'){
    const fifo=path.join(pipelineDir,'report.fifo');
    const {execFileSync}=await import('node:child_process');
    execFileSync('mkfifo',[fifo]);
    const started=Date.now();
    const piped=publishSuiteArtifacts(telemetry,{moduleId:'m',suiteName:'perf',attempt:3,result:{metadata:{report_path:fifo}}});
    assert.equal(piped.length,1,'a FIFO is not published');
    assert.ok(Date.now()-started<1000,'a FIFO cannot block artifact publication');
  }
  const swarmResultsDir=path.join(temporary,'swarm-results');
  await writeSuiteResults({suiteMap:{'../../escaped':{} as any},moduleId:'module',project:'project',swarmResultsDir,attempt:1,telemetryContext:null});
  assert.equal(fs.existsSync(path.join(temporary,'escaped-verdict-attempt-1.json')),false);
  assert.equal(fs.readdirSync(swarmResultsDir).some((name)=>name.endsWith('-verdict-attempt-1.json')),true);
}finally{
  fs.rmSync(temporary,{recursive:true,force:true});
}
