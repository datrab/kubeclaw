import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FileObservabilityAdmissionStore } from '../../../skills/common/plugin-runtime/foundation/observability/durable-delivery.ts';
import { canonicalJson, producerRecordDigest } from '../../../contracts/pipeline-observability/v1/src/index.ts';
const root=await fs.mkdtemp(path.join(os.tmpdir(),'review-admission-'));
try {
 const limits={maximumIngressBytes:10000,maximumRecords:20,maximumBytes:100000,maximumQuarantineRecords:2,maximumQuarantineBytes:20000};
 const unsigned={schemaVersion:'producer-record.v1',recordId:'record:1',producer:{producerId:'producer:1',bootId:'boot:1',producerType:'review'},sequence:1,recordType:'review.fact',occurredAt:'2026-09-06T00:00:00Z',correlation:{pipelineRunId:'run:1',moduleId:null,gateId:null,attemptId:null,claimId:null,claimGeneration:null,traceId:null,parentEventId:null},payload:{state:'failed'}};
 const original={...unsigned,recordDigest:producerRecordDigest(unsigned)};
 await new FileObservabilityAdmissionStore(root,limits).admit(canonicalJson(original));
 const file=path.join(root,'admission.json');const saved=JSON.parse(await fs.readFile(file,'utf8'));
 saved.entries[0].record.payload.state='passed';
 await fs.writeFile(file,canonicalJson(saved));
 const replayed=(await new FileObservabilityAdmissionStore(root,limits).admittedRecords())[0].record;
 assert.equal(replayed.payload.state,'passed');
 assert.notEqual(producerRecordDigest(replayed),replayed.recordDigest);
 console.log('PCR-OBS-001: restarted production admission store returns altered payload with invalid digest and unchanged original wire bytes');
} finally {await fs.rm(root,{recursive:true,force:true});}
