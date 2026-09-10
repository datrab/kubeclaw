import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {prepareRuntime, createAdapterRuntime} from '../../../skills/nova/core/execution/engine-runtime.ts';
import {assertEffectRecoverySafe} from '../../../skills/nova/core/execution/effect-recovery.ts';
import {FileJournal} from '../../../skills/nova/core/state/journal.ts';
import {FileEffectJournal} from '../../../skills/nova/core/effects/journal.ts';
import {verifiedArchitectureValue} from '../../../skills/nova/plugins/prism-design/src/architecture.ts';
import {sha256Text} from '@kubeclaw/plugin-sdk';

function crossLocaleCompletedRead(file,runDirectory,read,ref,expected) {
  const producerLocale=new Intl.Collator().resolvedOptions().locale;
  for(const [locale,resolved] of [['en_US.UTF-8','en-US'],['sv_SE.UTF-8','sv-SE'],['da_DK.UTF-8','da-DK'],['tr_TR.UTF-8','tr-TR']]) {
    const output=execFileSync(process.execPath,[fileURLToPath(new URL('./prism-reader-consumer.mjs',import.meta.url)),file,runDirectory,read.idempotencyKey],{env:{...process.env,LANG:locale,LC_ALL:locale},encoding:'utf8'});
    const consumed=JSON.parse(output);assert.equal(consumed.locale,resolved);
    if(ref.encoding)assert.equal(consumed.accepted,true,output);
    else {
      assert.equal(consumed.accepted,consumed.originalLegacyVerifierMatches,output);
      if(Object.hasOwn(expected.contract.policy,'å')&&['en-US','sv-SE'].includes(resolved)&&resolved!==producerLocale) {
        assert.equal(consumed.accepted,false,output);assert.equal(consumed.error,'PRISM_DESIGN_ARCHITECTURE_PROOF_INVALID');
      }
    }
    assert.equal(consumed.originalJournalUnchanged,true);console.log(JSON.stringify({crossLocaleOriginalCompletedRead:consumed,producerLocale}));
  }
}

/** Byte-exact genuine journal prefixes, original coordinator and registered adapters.
 * This proves original effect recovery, not administrative package-upgrade approval.
 */
export async function replayOriginalRead({platform,definition,runId,directory,runDirectory,ref,expected,bytes,read,effectsFile}) {
  const lines=fs.readFileSync(effectsFile,'utf8').trimEnd().split('\n');
  const entries=lines.map(line=>JSON.parse(line).entry);
  const runtime=await prepareRuntime(platform,definition);
  for(const phase of ['requested','accepted','completed']) {
    const end=entries.findIndex(row=>row.type===phase&&(row.request?.effectId??row.receipt?.effectId)===read.effectId);
    assert(end>=0);
    const root=path.join(directory,`replay-${phase}`);fs.mkdirSync(root);
    const file=path.join(root,'effects.jsonl'),prefix=lines.slice(0,end+1).join('\n')+'\n';
    fs.writeFileSync(file,prefix);
    const events=new FileJournal(path.join(runDirectory,'events.jsonl'));
    const gate=()=>assertEffectRecoverySafe(root,runId,definition,events);
    if(phase==='accepted')await assert.rejects(gate,/RECOVERY_EFFECT_OUTCOME_UNRESOLVED/);
    else await gate();
    const adapters=createAdapterRuntime(platform,root,runtime,new FileJournal(path.join(root,'replay-audit.jsonl')));
    await adapters.start();
    try {
      const invoke=()=>adapters.invoke(read.capability,read.attempt,read.idempotencyKey,
        {operation:read.operation,resource:read.resource,payload:read.payload},new AbortController().signal);
      if(phase==='accepted') {
        await assert.rejects(invoke,/EFFECT_RECOVERY_RECEIPT_UNAVAILABLE/);
        assert.equal(await new FileEffectJournal(file).receipt(read.idempotencyKey),undefined);
        assert.equal(fs.readFileSync(file,'utf8'),prefix);
      } else {
        const result=await invoke();assert.deepEqual(result.artifact,ref);
        assert.deepEqual(verifiedArchitectureValue(result,ref),expected);
        const reopened=new FileEffectJournal(file);
        assert.deepEqual(await reopened.request(read.idempotencyKey),read);
        assert.deepEqual((await reopened.receipt(read.idempotencyKey)).result,result);
        if(phase==='completed')assert.equal(fs.readFileSync(file,'utf8'),prefix);
        else assert(fs.readFileSync(file,'utf8').startsWith(prefix));
        const snapshot=fs.readFileSync(file,'utf8');assert.deepEqual(await invoke(),result);
        assert.equal(fs.readFileSync(file,'utf8'),snapshot);
        if(phase==='completed')crossLocaleCompletedRead(file,runDirectory,read,ref,expected);
      }
      console.log(JSON.stringify({originalReadReplay:phase,effectId:read.effectId,originalPrefixDigest:sha256Text(prefix),sameOperation:read.operation,samePayload:read.payload,
        sameAttemptAndKey:true,acceptedUncertaintyPreserved:phase==='accepted',completedReadNoNewJournalRecord:phase==='completed',realRegisteredArtifactStore:true,fullPipelinePackageUpgradeClaimed:false}));
    } finally {await adapters.shutdown();}
  }

  // Real latest-record ambiguity: same logical ID and exact bytes, different
  // existing pipeline attempt owner. No synthetic returned ArtifactRef/provider.
  const root=path.join(directory,'wrong-owner');fs.mkdirSync(root);
  const adapters=createAdapterRuntime(platform,root,runtime,new FileJournal(path.join(root,'audit.jsonl')));
  await adapters.start();
  try {
    const invoke=(capability,key,request)=>adapters.invoke(capability,read.attempt,key,request,new AbortController().signal);
    const written=await invoke('artifacts.write',`${read.idempotencyKey}:wrong-owner`,{
      operation:'put_json',resource:read.resource,payload:{namespace:ref.namespace,mediaType:ref.mediaType,value:expected,...(ref.encoding?{encoding:ref.encoding}:{})}});
    assert.equal(written.artifact.digest,ref.digest);assert.equal(written.artifact.sizeBytes,Buffer.byteLength(bytes));
    assert.notDeepEqual(written.artifact.producer,ref.producer);
    const result=await invoke(read.capability,`${read.idempotencyKey}:latest-owner`,{operation:read.operation,resource:read.resource,payload:read.payload});
    assert.deepEqual(result.artifact,written.artifact);
    assert.throws(()=>verifiedArchitectureValue(result,ref),/PRISM_DESIGN_ARCHITECTURE_REFERENCE_INVALID/);
    console.log(JSON.stringify({latestWrongOwner:'actual store result rejected',originalDigest:ref.digest,originalOwner:ref.producer,returnedOwner:result.artifact.producer,unchangedReadOperation:read.operation}));
  } finally {await adapters.shutdown();}
}
