import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import https from 'node:https';
import {sha256Text} from '@kubeclaw/plugin-sdk';
import {object,exact,text,retention,type Value} from './protocol.ts';
export interface ClientConfig {readonly endpoint:string;readonly tokenPath:string;readonly caPath:string;}
async function boundedFile(file:string,limit:number,signal:AbortSignal):Promise<Buffer> {
  signal.throwIfAborted();
  const handle=await fs.open(file,constants.O_RDONLY|constants.O_NONBLOCK);
  try {const stat=await handle.stat();signal.throwIfAborted();if(!stat.isFile()||stat.size<1||stat.size>limit)throw new Error('DEMO_READY_CREDENTIAL_FILE_INVALID');
    const buffer=Buffer.alloc(limit+1);let size=0;
    while(size<buffer.length){signal.throwIfAborted();const read=await handle.read(buffer,size,buffer.length-size,null);if(read.bytesRead===0)break;size+=read.bytesRead;}
    signal.throwIfAborted();if(size>limit)throw new Error('DEMO_READY_CREDENTIAL_FILE_INVALID');return buffer.subarray(0,size);
  }finally{await handle.close();}
}
export async function post(config:ClientConfig,body:string,status:boolean,signal:AbortSignal):Promise<Value> {
  if(Buffer.byteLength(body)>16384)throw new Error('DEMO_READY_REQUEST_TOO_LARGE');
  const ca=await boundedFile(config.caPath,1024**2,signal),token=(await boundedFile(config.tokenPath,16384,signal)).toString('utf8').trim();
  if(!token||/[\s\u0000-\u001f]/u.test(token))throw new Error('DEMO_READY_TOKEN_INVALID');
  const url=new URL(config.endpoint);if(status)url.pathname+='/status';
  return new Promise((resolve,reject)=>{
    const request=https.request(url,{method:'POST',ca,signal,headers:{authorization:`Bearer ${token}`,'content-type':'application/json','content-length':Buffer.byteLength(body)}},response=>{
      const chunks:Buffer[]=[];let size=0;
      response.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>16384){request.destroy(new Error('DEMO_READY_RESPONSE_TOO_LARGE'));return;}chunks.push(chunk);});
      response.on('error',()=>reject(new Error('DEMO_READY_RESPONSE_UNRESOLVED')));
      response.on('end',()=>{
        if(signal.aborted){reject(new Error('DEMO_READY_CANCELLED'));return;}
        if(response.statusCode!==200){reject(new Error(`DEMO_READY_HTTP_${response.statusCode??0}:unresolved`));return;}
        try{resolve(object(JSON.parse(Buffer.concat(chunks).toString('utf8'))));}catch{reject(new Error('DEMO_READY_RESPONSE_INVALID'));}
      });
    });
    request.on('error',()=>reject(new Error('DEMO_READY_TRANSPORT_UNRESOLVED')));request.end(body);
  });
}
export function validateResponse(value:Value,request:Value,body:string):Value {
  exact(value,['schemaVersion','leaseName','leaseUID','requestId','state','readyAt','expiresAt','requestDigest','retentionSeconds']);
  const ready=Date.parse(text(value.readyAt)),expires=Date.parse(text(value.expiresAt));
  if(value.schemaVersion!=='demo-ready-response.v1'||value.state!=='ready-for-acceptance'||value.requestDigest!==sha256Text(body)
    ||['leaseName','leaseUID','requestId'].some(key=>value[key]!==request[key])||!Number.isFinite(ready)||value.retentionSeconds!==retention(request.retentionSeconds)||expires!==ready+retention(request.retentionSeconds)*1000
    ||expires<=Date.now()||ready<Date.parse(text(request.observedAt)))throw new Error('DEMO_READY_RESPONSE_UNBOUND');
  return value;
}
