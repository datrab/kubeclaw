import fs from 'node:fs';
import path from 'node:path';
import { publishArtifact } from '../portable-artifacts.ts';
import { readBusterEnvironment } from '../buster-environment.ts';

const FILE_METADATA_KEYS: Readonly<Record<string, ReadonlySet<string>>> = Object.freeze({});

function within(candidate:string,root:string):boolean{
  const relative=path.relative(root,candidate);
  return relative===''||(!relative.startsWith(`..${path.sep}`)&&relative!=='..'&&!path.isAbsolute(relative));
}

function approvedArtifactFiles(suiteName:string,metadata:Record<string,unknown>,pipelineDir:string):Array<[string,Buffer]>{
  const keys=FILE_METADATA_KEYS[suiteName]??new Set<string>();
  const roots=[pipelineDir,readBusterEnvironment('BUSTER_RESULTS_DIR'),readBusterEnvironment('BUSTER_BUILD_OUTPUT_DIR')]
    .filter((value):value is string=>typeof value==='string'&&value.length>0)
    .filter((value)=>fs.existsSync(value))
    .map((value)=>fs.realpathSync(value));
  const approved:Array<[string,Buffer]>=[];
  for(const [name,value] of Object.entries(metadata)){
    if(!keys.has(name)||typeof value!=='string'||!fs.existsSync(value))continue;
    // Reject symlinks and special files before open; O_NONBLOCK prevents a race
    // that replaces a regular file with a FIFO from stalling the pipeline.
    if(!fs.lstatSync(value).isFile())continue;
    const descriptor=fs.openSync(value,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW|fs.constants.O_NONBLOCK);
    try{
      const opened=fs.fstatSync(descriptor);
      if(!opened.isFile())continue;
      let canonical:string;
      try{canonical=fs.realpathSync(value);}catch{continue;}
      if(!roots.some((root)=>within(canonical,root)))continue;
      const current=fs.statSync(canonical);
      if(current.dev!==opened.dev||current.ino!==opened.ino)continue;
      approved.push([name,fs.readFileSync(descriptor)]);
    }finally{fs.closeSync(descriptor);}
  }
  return approved;
}

export function publishSuiteArtifacts(telemetry:any,{moduleId,gateId,suiteName,result,attempt}:any){
  const pipelineRunLogPath=telemetry?.pipelineRunLogPath;
  if(typeof pipelineRunLogPath!=='string'||!pipelineRunLogPath)return[];
  const pipelineDir=path.dirname(path.dirname(path.dirname(pipelineRunLogPath)));
  const workId=gateId ? gateId : moduleId;
  const correlation={project:telemetry.project,run_id:telemetry.runId,work_id:workId,work_type:gateId?'gate':'module',gate_id:gateId,attempt,dispatch_id:telemetry.dispatchId,session_id:telemetry.sessionKey,source:'buster',producer:telemetry.emitter};
  const config={run_id:telemetry.runId,pipeline_dir:pipelineDir};
  const artifacts=[];
  artifacts.push(publishArtifact(config,{logical_id:`quality/${workId}/${attempt}/${suiteName}/verdict`,kind:'suite-verdict',media_type:'application/json',bytes:JSON.stringify(result),producer:telemetry.emitter,content_class:'artifact',correlation}));
  const files=approvedArtifactFiles(suiteName,result.metadata||{},pipelineDir);
  for(const[name,bytes]of files)artifacts.push(publishArtifact(config,{logical_id:`quality/${workId}/${attempt}/${suiteName}/${name}`,kind:'suite-artifact',media_type:'application/octet-stream',bytes,producer:telemetry.emitter,content_class:'artifact',correlation}));
  return artifacts;
}
