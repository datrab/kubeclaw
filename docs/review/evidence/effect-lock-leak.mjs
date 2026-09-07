import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EffectCoordinator } from '../../../skills/nova/core/effects/coordinator.ts';
import { FileEffectJournal } from '../../../skills/nova/core/effects/journal.ts';
import { FileResourceLockManager } from '../../../skills/nova/core/effects/locks.ts';
import { stableEffectId } from '../../../skills/nova/core/effects/identity.ts';
import { activate } from '../../../skills/common/plugins/artifact-store/src/adapter.ts';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'review-effect-lock-'));
try {
 const file = path.join(root, 'effects.jsonl');
 const journal = new FileEffectJournal(file);
 const concurrentJournal = new FileEffectJournal(file);
 const locks = new FileResourceLockManager(path.join(root, 'locks'));
 const adapter = activate({config:{artifactRoot:path.join(root,'artifacts')}});
 const owner = {pluginId:'kubeclaw.artifact-store',apiVersion:'pipeline-plugin-v2',packageVersion:'1.0.0',contentDigest:'sha256:'+'a'.repeat(64),registrationId:'main'};
 const invocation = {idempotencyKey:'race:key',attempt:{runId:'run:review',stageId:'write',attemptId:'attempt:review',attemptNumber:1},capability:'artifacts.write',operation:'put_json',resource:{type:'artifact.object',canonicalId:'review:object'},payload:{namespace:'review',mediaType:'application/json',value:{left:true}}};
 const coordinator = new EffectCoordinator(journal,undefined,undefined,locks,5);
 const pending = coordinator.invoke(adapter,owner,invocation,new AbortController().signal);
 // A second original journal publishes between the first read and locked recheck.
 await concurrentJournal.requested({...invocation,payload:{...invocation.payload,value:{right:true}},schemaVersion:'effect-request.v2',effectId:stableEffectId(invocation),requestedAt:new Date().toISOString()});
 await assert.rejects(pending,/EFFECT_IDEMPOTENCY_CONFLICT/);
 await new Promise(resolve=>setTimeout(resolve,20));
 assert.throws(()=>locks.acquire(invocation.resource,'other:owner',1000),/RESOURCE_LOCKED/);
 const ownerFiles=fs.readdirSync(path.join(root,'locks')).filter(name=>name.endsWith('.active'));
 assert.equal(ownerFiles.length,1);
 console.log('Original concurrent journal conflict leaves resource locked after TTL while owner process lives');
 await adapter.shutdown(new AbortController().signal);
} finally { fs.rmSync(root,{recursive:true,force:true}); }
