import { createServer } from 'node:http';
import { AgentJobRunner,controlRequest } from './agent-job-runner.mjs';

const port=Number(process.env.PORT || 18080);
const controlUrl=process.env.PRISM_CONTROL_URL || 'http://127.0.0.1:28080';
const runner=new AgentJobRunner(controlUrl);
async function readJson(request){
  const chunks=[];let size=0;
  for await(const chunk of request){size+=chunk.length;if(size>2_000_000)throw new Error('request too large');chunks.push(chunk);}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function send(response,status,value){response.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});response.end(JSON.stringify(value));}
async function dispatch(request,payload,response){
  const persisted=await fetch(new URL('/v1/dispatch',controlUrl),{method:'POST',headers:{'content-type':'application/json','idempotency-key':String(request.headers['idempotency-key']||'')},body:JSON.stringify(payload),signal:AbortSignal.timeout(30_000),redirect:'error'});
  const text=await persisted.text();
  response.writeHead(persisted.status,{'content-type':persisted.headers.get('content-type')||'application/json','cache-control':'no-store'});response.end(text);
}
const server=createServer(async(request,response)=>{
  try{
    if(request.url==='/health'||request.url==='/ready')return send(response,200,{status:'ready'});
    if(request.method!=='POST')return send(response,404,{error:'not found'});
    const payload=await readJson(request);
    if(request.url==='/v1/dispatch')return await dispatch(request,payload,response);
    if(request.url==='/v1/design-set'||request.url==='/v1/revise'){
      if(typeof payload.jobId!=='string')throw new Error('a durable Control jobId is required; bridge payloads cannot admit agent work');
      const {job}=await controlRequest(controlUrl,`/v1/agent/jobs/${encodeURIComponent(payload.jobId)}`,undefined,AbortSignal.timeout(10_000));
      return send(response,202,{jobId:job.id,generationId:job.id,status:job.state==='needs_nova'?'NeedsNova':job.state,result:job.result,outcome:job.outcome});
    }
    return send(response,404,{error:'not found'});
  }catch(error){return send(response,422,{error:error instanceof Error?error.message:String(error)});}
});
const tick=()=>{void runner.tick().catch(error=>console.error('Prism durable agent runner:',error));};
const poll=setInterval(tick,1000);
server.listen(port,'127.0.0.1',tick);
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{
  clearInterval(poll);server.close();void runner.stop().catch(error=>console.error('Prism agent shutdown:',error));
});
