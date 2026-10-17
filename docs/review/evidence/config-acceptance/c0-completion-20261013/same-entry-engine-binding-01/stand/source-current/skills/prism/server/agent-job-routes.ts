import type { IncomingMessage,ServerResponse } from 'node:http';
import { authorizeProxiedSpiffePeer } from '@kubeclaw/worker-core';
import { agentJob,claimAgentJob,finishAgentRun } from '../control/agent-jobs.ts';
import type { Database } from '../storage/index.ts';

export async function handleAgentJobs(request:IncomingMessage,response:ServerResponse,url:URL,
  options:{db:Database;spiffeEnabled:boolean;trustedAgentId:string;readBody:(request:IncomingMessage)=>Promise<unknown>}) {
  if(!url.pathname.startsWith('/v1/agent/jobs'))return false;
  if(!options.spiffeEnabled)throw new Error('Prism agent jobs require SPIFFE trust');
  authorizeProxiedSpiffePeer(request.headers,request.socket.remoteAddress,new Set([options.trustedAgentId]));
  let result:unknown;
  if(url.pathname==='/v1/agent/jobs/claim' && request.method==='POST'){
    const input=await options.readBody(request) as {runnerId:string};
    result={job:await claimAgentJob(options.db,input.runnerId)};
  }else{
    const match=/^\/v1\/agent\/jobs\/([0-9a-f-]+)(\/finish)?$/u.exec(url.pathname);
    if(!match)throw new Error('unknown agent job route');
    if(request.method==='GET' && !match[2])result={job:await agentJob(options.db,match[1]!)};
    else if(request.method==='POST' && match[2]){
      const input=await options.readBody(request) as {fence:string;outcome:Record<string,unknown>};
      if(!input.outcome || typeof input.outcome!=='object')throw new Error('agent outcome is required');
      result={job:await finishAgentRun(options.db,match[1]!,input.fence,input.outcome)};
    }else throw new Error('unsupported agent job method');
  }
  response.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
  response.end(JSON.stringify(result));return true;
}
