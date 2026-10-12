// Actual registered consumer + original Core/HTTP adapter/journal; disposable local receiver.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {once} from 'node:events';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';

export function createHarness(sourceRoot=path.resolve(process.cwd())) {
const root=fs.mkdtempSync(path.join(os.tmpdir(),'adapter-locale-'));
const received=[];
const server=http.createServer(async(request,response)=>{
  const chunks=[];for await(const chunk of request)chunks.push(chunk);
  const rawBody=Buffer.concat(chunks).toString();const body=JSON.parse(rawBody);
  received.push({url:request.url,body,rawBody});
  fs.appendFileSync(path.join(root,'receiver.jsonl'),JSON.stringify(received.at(-1))+'\n');
  response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify({accepted:true}));
});
const consumer=`export function activate(context){
  const call=()=>context.invoke('network.http',{operation:'request',resource:{type:'network.url',canonicalId:context.config.endpoint},payload:{method:'POST',body:{ä:1,z:2}}});
  return {async ready(){},async shutdown(){},async invoke({fence}){fence.assertCurrent();const result=await call();process.kill(process.pid,'SIGKILL');return result;},async receipt(){return call();}};
}`;
function fixture(name,origin) {
  const directory=path.join(root,name),pluginRoot=path.join(directory,'plugins'),plugin=path.join(pluginRoot,'consumer');fs.mkdirSync(plugin,{recursive:true});
  const write=(file,value)=>fs.writeFileSync(path.join(plugin,file),typeof value==='string'?value:JSON.stringify(value));
  write('plugin.json',{id:'test.locale-dependency',apiVersion:'pipeline-plugin-v2',packageVersion:'1.0.0',observers:[],
    stages:[{id:'stage',type:'test.locale',module:'stage.mjs',export:'execute',requiredCapabilities:['runtime.dispatch'],configSchema:'empty.json',inputSchema:'empty.json',resultSchema:'result.json'}],
    adapters:[{id:'consumer',module:'adapter.mjs',export:'activate',providesCapabilities:['runtime.dispatch'],requiredCapabilities:['network.http'],configSchema:'config.json'}]});
  write('adapter.mjs',consumer);write('stage.mjs',`export async function execute(input,context){await context.invoke('runtime.dispatch',{operation:'dispatch',resource:{type:'runtime.agent',canonicalId:'probe'},payload:{}});return {schemaVersion:'stage-result.v2',outcome:'passed',artifacts:[]};}`);
  write('empty.json',{type:'object',additionalProperties:false});
  write('result.json',{$schema:'https://json-schema.org/draft/2020-12/schema',$ref:'https://kubeclaw.dev/contracts/plugin-system/v2/plugin-system-v2.schema.json#/$defs/stageResult'});
  write('config.json',{type:'object',properties:{endpoint:{type:'string'}},required:['endpoint'],additionalProperties:false});
  const roots=[path.join(sourceRoot,'skills/common/plugins'),pluginRoot],adapter='test.locale-dependency:consumer';
  const platform={schemaVersion:'pipeline-platform.v2',shutdownTimeoutMs:1000,administrativeDecisionIssuers:[],storageRoot:path.join(directory,'state'),installationRoots:roots,trustedBuiltinRoots:roots,
    externalTrust:{allowedSourceDigests:{},verifiedAttestations:{}},orchestratorIssuerId:'test:operator',activeAdapters:[],observers:{},
    providers:{'runtime.dispatch':adapter,'network.http':'kubeclaw.network-http:http'},
    grants:{'test.locale-dependency:stage':{'runtime.dispatch':{allowedAgents:['probe']}},[adapter]:{'network.http':{allowedOrigins:[origin]}}},
    adapters:{[adapter]:{endpoint:origin+'/'+name},'kubeclaw.network-http:http':{allowedOrigins:[origin],allowedMethods:['POST']}}};
  const definition={schemaVersion:'pipeline-definition.v2',id:'locale-test',maxConcurrency:1,stages:[{id:'one',type:'test.locale',dependsOn:[],input:{},config:{},execution:{maxAttempts:1,maxRemediationCycles:0,timeoutMs:10000}}]};
  fs.writeFileSync(path.join(directory,'fixture.json'),JSON.stringify({platform,definition}));return directory;
}
async function subprocess(directory,locale,runtimeRoot=sourceRoot) {
const core=JSON.stringify(pathToFileURL(path.join(runtimeRoot,'skills/nova/core/src/index.ts')).href);
const engine=JSON.stringify(pathToFileURL(path.join(runtimeRoot,'skills/nova/core/execution/engine-runtime.ts')).href);
const worker=`import fs from 'node:fs';import path from 'node:path';import * as core from ${core};import {prepareRuntime} from ${engine};
  const directory=process.argv[1],{platform,definition}=JSON.parse(fs.readFileSync(path.join(directory,'fixture.json'))),prepared=await prepareRuntime(platform,definition);
  const runtime=new core.AdapterRuntime({granted:prepared.granted,activated:prepared.activated,configs:new Map(Object.entries(platform.adapters)),shutdownTimeoutMs:1000,
    async emitDomainEvent(){throw new Error('UNEXPECTED_DOMAIN_EVENT');},effects:new core.EffectCoordinator(new core.FileEffectJournal(path.join(directory,'effects.jsonl')),undefined,undefined,new core.FileResourceLockManager(path.join(directory,'locks')),1000)});
  await runtime.start();try{const result=await runtime.invoke('runtime.dispatch',{runId:'run:locale',stageId:'one',attemptId:'attempt:one',attemptNumber:1},'parent:one',{operation:'dispatch',resource:{type:'runtime.agent',canonicalId:'probe'},payload:{}},new AbortController().signal);process.stdout.write(JSON.stringify({locale:Intl.DateTimeFormat().resolvedOptions().locale,result}));}finally{await runtime.shutdown();}`;

  const child=spawn(process.execPath,['--input-type=module','-e',worker,directory],{cwd:runtimeRoot,env:{...process.env,LANG:locale,LC_ALL:locale},stdio:['ignore','pipe','pipe']});
  let out='',err='';child.stdout.on('data',chunk=>out+=chunk);child.stderr.on('data',chunk=>err+=chunk);
  const timer=setTimeout(()=>child.kill('SIGKILL'),30000);const [code,signal]=await once(child,'exit');clearTimeout(timer);return {code,signal,out,err};
}
  return {root, received, server, fixture, subprocess,
    async listen(){server.listen(0,'127.0.0.1');await once(server,'listening');return `http://127.0.0.1:${server.address().port}`;},
    async close(){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));fs.rmSync(root,{recursive:true,force:true});}};
}
