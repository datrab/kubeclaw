import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {once} from 'node:events';
import {TEST_CORE_POLICY} from '../../fixtures/core-runtime-policy.mjs';
import {loadCoreRuntimePolicy,captureCoreRuntimePolicy} from '../../../skills/common/plugin-runtime/foundation/config/core-runtime-policy.ts';
import {selectedAdapterConfigurations} from '../../../skills/nova/core/execution/engine-runtime.ts';
import {activatePublisher,activateTelemetry} from '../../../skills/common/plugins/redis-transport/src/adapter.ts';
import {exchange} from '../../../skills/common/plugins/redis-transport/src/exchange.ts';
import {ReplyDecoder} from '../../../skills/common/plugins/redis-transport/src/resp.ts';
const ids=['kubeclaw.redis-transport:publisher','kubeclaw.redis-transport:telemetry'];
test('selected Redis budgets control both actual publishers and preserve captured A after source removal',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'redis-policy-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 let received=0;
 const server=net.createServer(socket=>{socket.on('error',()=>{});socket.once('data',()=>{received++;socket.end('+OK\r\n$3\r\n1-1\r\n');});});
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise<void>(resolve=>server.close(()=>resolve())));
 const address=server.address();assert(address&&typeof address!=='string');
 const file=path.join(root,'core.json');
 const publish=(n:number)=>fs.writeFileSync(file,JSON.stringify({schemaVersion:'nova-core-runtime-policy.v1',profiles:{selected:{settings:{...TEST_CORE_POLICY,redisTransport:{maximumPayloadBytes:n,maximumReplyBulkBytes:n,maximumReplyHeaderBytes:n}}}}}));
 const read=()=>loadCoreRuntimePolicy({file,profile:'selected'});
 publish(8);const original=captureCoreRuntimePolicy(read());publish(64);const current=read();fs.unlinkSync(file);
 const raw={url:`redis://127.0.0.1:${address.port}`,passwordSecret:'redis.password',streamPrefix:'fixture',maxLen:1000,dedupTtlMs:60000,timeoutMs:1000};
 const invoke=(adapter:any,payload:any,kind:string)=>adapter.invoke({request:{idempotencyKey:'key',capability:kind==='publisher'?'transport.publish':'telemetry.emit',operation:kind==='publisher'?'publish':'append',resource:{type:kind==='publisher'?'transport.target':'telemetry.event',canonicalId:'event'},payload},signal:new AbortController().signal,fence:{assertCurrent(){}}});
 for(const [index,activate] of [activatePublisher,activateTelemetry].entries()){
  const id=ids[index]!;
  const make=(policy:any)=>activate({config:selectedAdapterConfigurations({[id]:raw},policy)[id],async invoke(){return {value:'secret'};}} as any);
  const a=make(original),b=make(current);t.after(async()=>{await a.shutdown(new AbortController().signal);await b.shutdown(new AbortController().signal);});
  await assert.rejects(invoke(a,{value:'too long'},index?'telemetry':'publisher'),/PAYLOAD_SIZE/);
  assert.equal((await invoke(b,{value:'too long'},index?'telemetry':'publisher')).entryId,'1-1');
  assert.equal((await invoke(a,{},index?'telemetry':'publisher')).entryId,'1-1');
 }
 assert.equal(received,4);assert.throws(read,/ENOENT/);
});
test('selected Redis reply budgets reach actual socket decoder with restored positive and fragmented input',async t=>{
 let response='+OK\r\n$5\r\n12345\r\n';
 const server=net.createServer(socket=>{socket.on('error',()=>{});socket.once('data',()=>socket.end(response));});server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise<void>(resolve=>server.close(()=>resolve())));
 const address=server.address();assert(address&&typeof address!=='string');
 const run=(bulk:number,header:number)=>exchange({url:new URL(`redis://127.0.0.1:${address.port}`),timeoutMs:1000,maximumReplyBulkBytes:bulk,maximumReplyHeaderBytes:header},'secret',['PING'],new AbortController().signal);
 await assert.rejects(run(4,32),/RESPONSE_INVALID/);assert.equal(await run(5,32),'12345');
 response='+OK\r\n+123456\r\n';await assert.rejects(run(32,4),/HEADER_LIMIT/);assert.equal(await run(32,8),'123456');
 const limits={maximumReplyBulkBytes:4,maximumReplyHeaderBytes:8};const decoder=new ReplyDecoder(limits);limits.maximumReplyBulkBytes=1;
 assert.equal(decoder.push(Buffer.from('+OK\r\n$4\r\nab')),undefined);assert.deepEqual(decoder.push(Buffer.from('cd\r\n')),{value:'abcd'});
});
test('Redis missing invalid and competing limits reject before network connection',()=>{
 for(const key of Object.keys(TEST_CORE_POLICY.redisTransport)){
  for(const value of [undefined,null,0,-1,1.5,'8',16777217]){
   const limits={...TEST_CORE_POLICY.redisTransport,[key]:value};
   assert.throws(()=>captureCoreRuntimePolicy({...TEST_CORE_POLICY,redisTransport:limits}),/INVALID/);
   assert.throws(()=>activatePublisher({config:{url:'redis://127.0.0.1:1',passwordSecret:'redis.password',streamPrefix:'fixture',maxLen:1,dedupTtlMs:1000,timeoutMs:1,...limits}} as any),/CONFIG_INVALID/);
  }
  for(const id of ids)assert.throws(()=>selectedAdapterConfigurations({[id]:{[key]:8}},TEST_CORE_POLICY),/REDIS_TRANSPORT_POLICY_COMPETING_AUTHOR/);
 }
 assert.throws(()=>new ReplyDecoder({} as any),/CONFIG_INVALID/);
});
