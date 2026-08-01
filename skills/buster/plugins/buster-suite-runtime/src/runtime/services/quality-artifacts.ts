import fs from 'node:fs';
import path from 'node:path';
import { publishArtifact } from '../portable-artifacts.js';

export function publishSuiteArtifacts(telemetry:any,{moduleId,gateId,suiteName,result,attempt}:any){
  const pipelineRunLogPath=telemetry?.pipelineRunLogPath;
  if(typeof pipelineRunLogPath!=='string'||!pipelineRunLogPath)return[];
  const pipelineDir=path.dirname(path.dirname(path.dirname(pipelineRunLogPath)));
  const workId=gateId ? gateId : moduleId;
  const correlation={project:telemetry.project,run_id:telemetry.runId,work_id:workId,work_type:gateId?'gate':'module',gate_id:gateId,attempt,dispatch_id:telemetry.dispatchId,session_id:telemetry.sessionKey,source:'buster',producer:telemetry.emitter};
  const config={run_id:telemetry.runId,pipeline_dir:pipelineDir};
  const artifacts=[];
  artifacts.push(publishArtifact(config,{logical_id:`quality/${workId}/${attempt}/${suiteName}/verdict`,kind:'suite-verdict',media_type:'application/json',bytes:JSON.stringify(result),producer:telemetry.emitter,content_class:'artifact',correlation}));
  const files=Object.entries(result.metadata||{}).filter(([,value])=>typeof value==='string'&&fs.existsSync(value)&&fs.statSync(value).isFile());
  for(const[name,file]of files)artifacts.push(publishArtifact(config,{logical_id:`quality/${workId}/${attempt}/${suiteName}/${name}`,kind:suiteName==='visual-reg'?'visual-evidence':'suite-artifact',media_type:'application/octet-stream',bytes:fs.readFileSync(file as string),producer:telemetry.emitter,content_class:'artifact',correlation}));
  return artifacts;
}
