import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
const {FileDurableRecordStore}=await import(path.join(process.cwd(),'skills/common/plugin-runtime/foundation/observability/durable-records.ts'));
const root=fs.mkdtempSync(path.join(os.tmpdir(),'retire-accounting-final-'));
try{
 const limits={maximumRecords:10,maximumBytes:100000,maximumRecordBytes:10000},store=new FileDurableRecordStore(root,limits);
 const {record}=await store.append('stream','key',{text:'x'.repeat(1340)},'run:a');
 const file=path.join(root,'records/store.json'),before=fs.statSync(file).size;
 const intent={operationId:'retire',actor:'operator',owner:'run:a',stream:'stream',records:[{idempotencyKey:'key',payloadDigest:record.payloadDigest}],evidence:{}};
 const result=await store.retire(intent,async()=>{}),actual=before-fs.statSync(file).size;
 assert.equal(result.releasedBytes,actual);assert.ok(actual>0);assert.match(result.releasedBytesHex,/^[0-9a-f]{16}$/);
 const replay=await new FileDurableRecordStore(root,limits).retire(intent,async()=>{});
 assert.equal(replay.newlyRetired,false);assert.equal(replay.releasedBytes,actual);
 console.log(JSON.stringify({payloadTextBytes:1340,releasedBytes:result.releasedBytes,actualFileReduction:actual,replayedWithoutMutation:!replay.newlyRetired}));
}finally{fs.rmSync(root,{recursive:true,force:true});}
