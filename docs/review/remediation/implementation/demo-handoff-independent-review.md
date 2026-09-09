# Independent Demo Handoff Review

Reviewed the shared working tree based on `bbc36de5c288e3a3b6c53f98e72c19291cab45d8` on 2026-09-09. This is a bounded code and recovery review, not a deployment or full pipeline acceptance.

Scope: `skills/nova/plugins/demo-handoff`, `skills/nova/project/demo.ts`, the compiler/CLI/source-policy changes, Core authorization and capability vocabulary, and the original operator-messaging delivery/receipt interaction. The independent reviewer changed none of those files.

## Finding and correction

The new `operator.receipt` capability follows the normal durable-effect path. A process crash after its accepted journal entry but before its completed entry therefore invokes `Adapter.receipt(request)` on recovery. The initial operator adapter routed that method unconditionally through `assertRequest`, which only accepts `operator.request/publish`. Recovery failed with `OPERATOR_OPERATION_UNSUPPORTED` even when the original durable delivery receipt already existed.

The original failure was reproduced with the actual operator adapter, delivery store, reopened FileEffectJournal, and EffectCoordinator: normal lookup returned the original receipt, whereas recovery from the accepted prefix rejected with that error. That initial probe constructed the accepted prefix through original journal APIs; it did not itself kill a process.

The implementation agent corrected the cause by routing `operator.receipt` recovery through the same `lookupReceipt` function used by normal invocation. The run, originating stage, target, original wire payload, delivery ID, terminal receipt and Discord receipt checks remain shared. Recovery performs no send.

The independent reviewer then ran four **actual child-process SIGKILL** counterchecks against the corrected working tree. Each child durably wrote requested and accepted entries with the original FileEffectJournal, announced acceptance, and was killed before producing an effect completion. A newly opened journal and the original EffectCoordinator then performed recovery.

| Case | Observed result |
| --- | --- |
| Original run, stage and payload | Completed with exactly the original receipt |
| Foreign run | Rejected with `OPERATOR_RECEIPT_REQUEST_UNBOUND` |
| Foreign delivery stage | Rejected with `OPERATOR_RECEIPT_REQUEST_UNBOUND` |
| Changed payload | Rejected with `OPERATOR_RECEIPT_REQUEST_UNBOUND` |

## Execution record and reproduction

Working directory: `/workspace/scratch/4e25cf57c177/kubeclaw-fixes`.

The probe ran as `node --input-type=module` with the following stdin. Its temporary stores were deleted in `finally`. There is **no separate filesystem log path**: output was captured by the tool invocation. The output below is a transcription of that captured result, not a newly claimed raw log.

The implementation agent subsequently added a persistent regression to `tests/verification/reliability/discord-delivery-receipt.test.mts`, executable with `node --test tests/verification/reliability/discord-delivery-receipt.test.mts`. Its source change was independently reviewed: it obtains the initial delivery through the original adapter and actual localhost HTTP, constructs four accepted journal prefixes through original APIs, reopens the original AdapterRuntime, and checks successful recovery plus the same identity negatives. That persistent test constructs the crash prefix; the independent probe below additionally performs actual SIGKILL. The implementation agent reported its test run passing; this reviewer did not repeat that suite.

```js
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {once} from 'node:events';import {pathToFileURL} from 'node:url';
import {activate} from './skills/common/plugins/operator-messaging/src/adapter.ts';
import {reserveDelivery,completeDelivery} from './skills/common/plugins/operator-messaging/src/delivery-records.ts';
import {discordWebhookPayload} from './skills/common/plugins/operator-messaging/src/discord-payload.ts';
import {discordReceipt} from './skills/common/plugins/operator-messaging/src/discord-receipt.ts';
import {FileDurableRecordStore} from './skills/common/plugin-runtime/foundation/observability/durable-records.ts';
import {FileEffectJournal} from './skills/nova/core/effects/journal.ts';
import {EffectCoordinator,MemoryResourceLockManager} from './skills/nova/core/effects/coordinator.ts';
import {stableEffectId} from './skills/nova/core/effects/identity.ts';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'receipt-recovery-review-'));
try {
const dir=path.join(root,'deliveries'),records=new FileDurableRecordStore(dir,{maximumRecords:100000,maximumBytes:256*1024**2,maximumRecordBytes:2*1048576+65536});
const payload={type:'demo.access',summary:'https://example.test/'},wire=discordWebhookPayload(payload);
const attempt={runId:'review-run',stageId:'demo-delivery',attemptId:'delivery-attempt',attemptNumber:1};
const sent={schemaVersion:'effect-request.v2',effectId:'effect:fixture-delivery',idempotencyKey:'send',deliveryId:'demo:fixture',attempt,capability:'operator.request',operation:'publish',resource:{type:'operator.target',canonicalId:'operators'},payload,requestedAt:new Date().toISOString()};
const reservation=await reserveDelivery(records,sent,wire,false),expected=discordReceipt(sent,wire,{status:200,body:{id:'123456789012345678'}});await completeDelivery(records,sent,reservation,expected);
const adapter=activate({config:{deliveryRoot:dir,targets:{operators:{endpoint:'http://127.0.0.1:1/unused',tokenSecret:'test.webhook',format:'discord_webhook'}}}});
const base={idempotencyKey:'lookup',attempt:{...attempt,stageId:'demo-ready',attemptId:'ready-attempt'},capability:'operator.receipt',operation:'lookup',resource:sent.resource,payload:{deliveryId:sent.deliveryId,stageId:'demo-delivery',payload}};
const cases=[['good',base,null],['foreign-run',{...base,attempt:{...base.attempt,runId:'other'}},/OPERATOR_RECEIPT_REQUEST_UNBOUND/],['foreign-stage',{...base,payload:{...base.payload,stageId:'other'}},/OPERATOR_RECEIPT_REQUEST_UNBOUND/],['changed-payload',{...base,payload:{...base.payload,payload:{...payload,summary:'https://other.test/'}}},/OPERATOR_RECEIPT_REQUEST_UNBOUND/]];
for(const [name,invocation,expectedError] of cases){
const request={...invocation,schemaVersion:'effect-request.v2',effectId:stableEffectId(invocation),requestedAt:new Date().toISOString()},journalPath=path.join(root,name+'.jsonl');
const code=`import {FileEffectJournal} from ${JSON.stringify(pathToFileURL(path.resolve('skills/nova/core/effects/journal.ts')).href)};const j=new FileEffectJournal(${JSON.stringify(journalPath)});const r=${JSON.stringify(request)};await j.requested(r);await j.accepted(r);process.stdout.write('accepted\\n');setInterval(()=>{},1000);`;
const child=spawn(process.execPath,['--input-type=module','-e',code],{stdio:['ignore','pipe','pipe']});let error='';child.stderr.on('data',x=>error+=x);const done=once(child,'exit');const marker=await once(child.stdout,'data');assert.equal(marker[0].toString(),'accepted\n',error);child.kill('SIGKILL');const [exit,signal]=await done;assert.equal(signal,'SIGKILL');
const coordinator=new EffectCoordinator(new FileEffectJournal(journalPath),undefined,undefined,new MemoryResourceLockManager());const operation=coordinator.invoke(adapter,{packageId:'kubeclaw.operator-messaging',packageVersion:'1.0.0',registrationId:'operator'},invocation,new AbortController().signal);
if(expectedError)await assert.rejects(operation,expectedError);else{const result=await operation;assert.equal(result.status,'completed');assert.deepEqual(result.result,expected);}
console.log(name+': native SIGKILL after durable accepted + original recovery passed');
}
console.log('Independent recovery regression passed: one valid lookup + three identity negatives. Original disk stores/coordinator, no HTTP; delivery receipt is explicit local contract vector.');
}finally{fs.rmSync(root,{recursive:true,force:true});}
```

Captured output, exit code 0:

```text
good: native SIGKILL after durable accepted + original recovery passed
foreign-run: native SIGKILL after durable accepted + original recovery passed
foreign-stage: native SIGKILL after durable accepted + original recovery passed
changed-payload: native SIGKILL after durable accepted + original recovery passed
Independent recovery regression passed: one valid lookup + three identity negatives. Original disk stores/coordinator, no HTTP; delivery receipt is explicit local contract vector.
```

## Other reviewed boundaries and limits

No additional blocker was found in the reviewed scope. Candidate/manifest reads bind run, producer, namespace and exact digest. The existing verified-evidence projection checks the source-image/manifest links, generated credential identity and observed exposure generation. Ready requires the original stored delivery receipt and controller confirmation; repeated readiness requests query status without renewing the retention period. Completed-run recovery is rejected by the original Core `RECOVERY_RUN_TERMINAL` path, as covered by the author's handoff regression reviewed here.

The delivery receipt in the independent probe is an explicit **local contract vector**, produced with original delivery-store APIs. No Discord endpoint, Kubernetes API, model, cluster or deployment was exercised by this reviewer. Real private Discord delivery, native source/build/deployment/browser/Tailnet execution, installed service-account permissions, human acceptance and authenticated extension remain outside this approval. The shared working tree still needs the orchestrator's immutable integration check. The separate historical serializer-portability finding is not closed by this review.
