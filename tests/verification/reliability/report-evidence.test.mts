import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { createReportHistory } from './report-identity-fixture.mjs';
import { buildRegistry, discoverPackages } from '@kubeclaw/nova-core';
import { readRunEvidence } from '../../../skills/nova/core/state/read-run-evidence.ts';
import { FileJournal } from '../../../skills/nova/core/state/journal.ts';
import { runRoot } from '../../../skills/nova/core/execution/run-root.ts';
import { activate as evidenceAdapter } from '../../../skills/nova/plugins/pipeline-review/src/evidence-adapter.ts';
import { activate as artifactAdapter } from '../../../skills/common/plugins/artifact-store/src/adapter.ts';
import { canonicalJson, sha256Text } from '@kubeclaw/plugin-sdk';
import type { EvidenceSelection } from '../../../skills/nova/plugins/pipeline-review/src/evidence-bundle.ts';

// Real Git/Core source producers and original artifact reads. No model factuality claim.
test('historical report source authority rejects foreign, stale, missing and changed actual evidence', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'report-evidence-'));
  try {
    const first = await createReportHistory(root,'run:evidence-A','history-a') as EvidenceSelection;
    const second = await createReportHistory(root,'run:evidence-B','history-b') as EvidenceSelection;
    assert.notEqual(first.sourceRevision,second.sourceRevision);
    const auditFile=path.join(runRoot(path.join(root,'history-a/state'),first.runId),'events.jsonl');
    const audit=fs.readFileSync(auditFile,'utf8').trimEnd().split('\n').map(line=>JSON.parse(line).entry);
    assert.ok(audit.some(event=>event.type==='effect.requested'&&event.payload.capability==='secrets.read'&&event.payload.resource.canonicalId==='[confidential]'),'genuine original policy-owned confidential source flow');
    assert.ok(audit.some(event=>event.type==='effect.requested'&&event.payload.capability==='network.http'&&event.payload.executionMode==='confidential'),'genuine original runtime-dispatch explicit confidential flow');
    const roots=['common','nova'].map(role=>path.resolve('skills',role,'plugins'));
    const registry=buildRegistry(discoverPackages({installationRoots:roots,trustPolicy:{trustedBuiltinRoots:roots,allowedSourceDigests:new Map(),verifiedAttestations:new Map(),verifierId:'report-evidence-test'}}));
    const unavailable=async()=>{throw new Error('UNEXPECTED_TEST_DEPENDENCY');};
    const store = artifactAdapter({config:{artifactRoot:path.join(root,'artifacts')},registration:registry.adapters.get('kubeclaw.artifact-store:artifact-store')!.provenance,
      invoke:unavailable,invokeConfidential:unavailable,emit:unavailable});
    const config = { storageRoot:path.join(root,'history-a/state'),orchestratorIssuerId:'nova',maximumJournalBytes:16*1024*1024,maximumArtifactBytes:4*1024*1024,maximumBundleBytes:4*1024*1024 };
    const owner = {runId:'run:report',stageId:'report',attemptId:'attempt:report',attemptNumber:1};
    let afterArtifactRead = () => {};
    const adapter = evidenceAdapter({config,registration:registry.adapters.get('kubeclaw.pipeline-review:evidence')!.provenance,
      invokeConfidential:unavailable,emit:unavailable,invoke:async(capability,request)=>{const response=await store.invoke({confidential:true,signal:new AbortController().signal,
      request:{...request,schemaVersion:'effect-request.v2',effectId:'effect:artifact-read',requestedAt:'2026-09-09T00:00:00Z',capability,attempt:owner,idempotencyKey:'read:actual-source'}});afterArtifactRead();return response;}});
    const read = (selection:EvidenceSelection) => adapter.invoke({confidential:true,signal:new AbortController().signal,
      request:{schemaVersion:'effect-request.v2',effectId:'effect:source-read',requestedAt:'2026-09-09T00:00:00Z',capability:'report.evidence.read',operation:'snapshot',resource:{type:'pipeline.run',canonicalId:selection.runId},payload:JSON.parse(canonicalJson(selection)),attempt:owner,idempotencyKey:'report:source'}});
    const successful=await read(first);
    const bundle=successful.bundle as Record<string,any>;
    assert.equal(bundle.facts[0].sourceRevision,first.sourceRevision);
    assert.equal(bundle.terminal,'run.succeeded');
    assert.equal(bundle.digest,sha256Text(canonicalJson(Object.fromEntries(Object.entries(bundle).filter(([key])=>key!=='digest')))));
    assert.ok(bundle.coverage.omittedContentClasses.includes('credentials'));
    assert.ok(!canonicalJson(bundle).includes('report-transport-secret-canary'));
    assert.ok(!canonicalJson(bundle).includes('native-private-test'));
    assert.ok(!canonicalJson(bundle).includes('NOVA_SOURCE_APPROVAL_TEST_TOKEN'));
    await t.test('cross-run, duplicate, nonexistent and stale source selections reject',async()=>{
      for(const source of [
        {...first,artifacts:second.artifacts},
        {...first,artifacts:[...first.artifacts,...first.artifacts]},
        {...first,artifacts:first.artifacts.map(ref=>({...ref,artifactId:'missing'}))},
        {...first,sourceRevision:second.sourceRevision},
        {...first,journalHead:second.journalHead},
        {...first,snapshotDigest:second.snapshotDigest},
      ]) await assert.rejects(read(source));
    });
    await t.test('actual blob loss and changed bytes reject; preserved store reads original bytes after repair',async()=>{
      const ref=first.artifacts[0]!;
      const file=path.join(root,'artifacts/blobs/sha256',ref.digest.slice(7,9),ref.digest.slice(9));
      const bytes=fs.readFileSync(file);
      try {
        fs.unlinkSync(file);await assert.rejects(read(first),/ARTIFACT_NOT_FOUND/);
        fs.writeFileSync(file,Buffer.alloc(bytes.length));await assert.rejects(read(first),/ARTIFACT_INTEGRITY_FAILED/);
      } finally {fs.writeFileSync(file,bytes);}
      assert.deepEqual(await read(first),successful);
    });
    await t.test('incomplete and nonterminal real journal prefixes reject without repair',()=>{
      const originalRoot=runRoot(config.storageRoot,first.runId);
      const originalFile=path.join(originalRoot,'events.jsonl');const full=fs.readFileSync(originalFile);
      const options={storageRoot:config.storageRoot,maximumBytes:config.maximumJournalBytes,orchestratorIssuerId:'nova'};
      try {
        fs.writeFileSync(originalFile,Buffer.concat([full,Buffer.from('{incomplete')]));
        assert.throws(()=>readRunEvidence(first,options),/JOURNAL_RECORD_INCOMPLETE/);
        assert.equal(fs.statSync(originalFile).size,full.length+11);
        const lines=full.toString().trimEnd().split('\n');const stop=lines.findIndex(line=>JSON.parse(line).entry.type==='run.started');
        assert.ok(stop>=0);
        fs.writeFileSync(originalFile,`${lines.slice(0,stop+1).join('\n')}\n`);
        assert.throws(()=>readRunEvidence({...first,journalHead:JSON.parse(lines[stop]!).hash},options),/RUN_EVIDENCE_NOT_COMPLETED/);
      } finally {fs.writeFileSync(originalFile,full);}
      assert.equal(readRunEvidence(first,options).journalHead,first.journalHead);
    });
    await t.test('original requested-effect prefix cannot be mistaken for completed run evidence',()=>{
      const file=path.join(runRoot(config.storageRoot,first.runId),'effects.jsonl');const full=fs.readFileSync(file);
      try {
        const lines=full.toString().trimEnd().split('\n');
        const index=lines.findIndex(line=>JSON.parse(line).entry.type==='requested');assert.ok(index>=0);
        fs.writeFileSync(file,`${lines.slice(0,index+1).join('\n')}\n`);
        assert.throws(()=>readRunEvidence(first,{storageRoot:config.storageRoot,maximumBytes:config.maximumJournalBytes,orchestratorIssuerId:'nova'}),/EFFECT_UNRESOLVED/);
      } finally {fs.writeFileSync(file,full);}
    });
    await t.test('empty and completed effect prefixes cannot satisfy the pinned lifecycle',()=>{
      const file=path.join(runRoot(config.storageRoot,first.runId),'effects.jsonl');const full=fs.readFileSync(file);
      const options={storageRoot:config.storageRoot,maximumBytes:config.maximumJournalBytes,orchestratorIssuerId:'nova'};
      try {
        fs.writeFileSync(file,'');assert.throws(()=>readRunEvidence(first,options),/EFFECT_AUDIT_MISMATCH/);
        const lines=full.toString().trimEnd().split('\n');const pending=new Set<string>();let end=-1;
        for(let index=0;index<lines.length-1;index++) {
          const entry=JSON.parse(lines[index]!).entry;
          if(entry.request)pending.add(entry.request.idempotencyKey);else pending.delete(entry.receipt.idempotencyKey);
          if(pending.size===0){end=index;break;}
        }
        assert.ok(end>=0,'real complete effect prefix must exist');
        fs.writeFileSync(file,`${lines.slice(0,end+1).join('\n')}\n`);
        assert.throws(()=>readRunEvidence(first,options),/EFFECT_AUDIT_MISMATCH/);
      } finally {fs.writeFileSync(file,full);}
      assert.equal(readRunEvidence(first,options).journalHead,first.journalHead);
    });
    await t.test('ordinary effect cannot impersonate a policy-owned confidential audit triplet',()=>{
      const run=runRoot(config.storageRoot,first.runId);const eventsFile=path.join(run,'events.jsonl');const effectsFile=path.join(run,'effects.jsonl');
      const eventBytes=fs.readFileSync(eventsFile);const effectBytes=fs.readFileSync(effectsFile);
      const events=eventBytes.toString().trimEnd().split('\n').map(line=>JSON.parse(line).entry);
      const effects=effectBytes.toString().trimEnd().split('\n').map(line=>JSON.parse(line).entry);
      const request=effects.find(entry=>entry.type==='requested'&&entry.request.capability!=='secrets.read'
        &&events.some(event=>event.type==='effect.completed'&&event.identity.effectId===entry.request.effectId))!.request;
      const rewrite=(file:string,entries:unknown[])=>{fs.unlinkSync(file);const journal=new FileJournal<unknown>(file);for(const entry of entries)journal.append(entry);return journal.records().at(-1)!.hash;};
      try {
        for(const event of events.filter(event=>event.identity.effectId===request.effectId)) {
          if(event.type==='effect.requested')event.payload.resource.canonicalId='[confidential]';
          if(event.type==='effect.completed')event.payload.result={confidential:true};
        }
        const journalHead=rewrite(eventsFile,events);
        rewrite(effectsFile,effects.filter(entry=>(entry.request??entry.receipt).idempotencyKey!==request.idempotencyKey));
        assert.throws(()=>readRunEvidence({...first,journalHead},{storageRoot:config.storageRoot,maximumBytes:config.maximumJournalBytes,orchestratorIssuerId:'nova'}),/EFFECT_AUDIT_MISMATCH/);
      } finally {fs.writeFileSync(eventsFile,eventBytes);fs.writeFileSync(effectsFile,effectBytes);}
      assert.equal(readRunEvidence(first,{storageRoot:config.storageRoot,maximumBytes:config.maximumJournalBytes,orchestratorIssuerId:'nova'}).journalHead,first.journalHead);
    });
    await t.test('ambiguous historical producer version and inconsistent claimed execution mode reject',()=>{
      const run=runRoot(config.storageRoot,first.runId);const snapshotFile=path.join(run,'run-snapshot.json');const eventsFile=path.join(run,'events.jsonl');
      const originalSnapshot=fs.readFileSync(snapshotFile);const originalEvents=fs.readFileSync(eventsFile);
      const options={storageRoot:config.storageRoot,maximumBytes:config.maximumJournalBytes,orchestratorIssuerId:'nova'};
      try {
        const snapshot=JSON.parse(originalSnapshot.toString());delete snapshot.registry.effectAuditVersion;
        const {digest:_old,...unsigned}=snapshot;snapshot.digest=sha256Text(canonicalJson(unsigned));
        fs.writeFileSync(snapshotFile,JSON.stringify(snapshot));
        assert.throws(()=>readRunEvidence({...first,snapshotDigest:snapshot.digest},options),/EFFECT_MODE_UNVERIFIABLE/);
        fs.writeFileSync(snapshotFile,originalSnapshot);
        const entries=originalEvents.toString().trimEnd().split('\n').map(line=>JSON.parse(line).entry);
        const accepted=entries.find(event=>event.type==='effect.accepted'&&event.payload.executionMode==='durable');
        assert.ok(accepted);accepted.payload.executionMode='confidential';
        fs.unlinkSync(eventsFile);const journal=new FileJournal<unknown>(eventsFile);for(const entry of entries)journal.append(entry);
        assert.throws(()=>readRunEvidence({...first,journalHead:journal.records().at(-1)!.hash},options),/EFFECT_AUDIT_MISMATCH/);
      } finally {fs.writeFileSync(snapshotFile,originalSnapshot);fs.writeFileSync(eventsFile,originalEvents);}
    });
    await t.test('source mutation during actual artifact read rejects the snapshot',async()=>{
      const file=path.join(runRoot(config.storageRoot,first.runId),'events.jsonl');const full=fs.readFileSync(file);
      afterArtifactRead=()=>fs.appendFileSync(file,'{changed');
      try {await assert.rejects(read(first),/JOURNAL_RECORD_INCOMPLETE/);}
      finally {afterArtifactRead=()=>{};fs.writeFileSync(file,full);}
      assert.deepEqual(await read(first),successful);
      assert.throws(()=>readRunEvidence(first,{storageRoot:config.storageRoot,maximumBytes:1,orchestratorIssuerId:'nova'}),/BUDGET/);
    });
    await t.test('bounded legacy FIFO cannot hang the original resolver',()=>{
      const storage=path.join(root,'legacy');const legacy=path.join(storage,'runs/run_fifo');fs.mkdirSync(legacy,{recursive:true});
      execFileSync('mkfifo',[path.join(legacy,'events.jsonl')]);
      const module=path.resolve('skills/nova/core/execution/run-root.ts');
      const code=`import {runRoot} from ${JSON.stringify(module)}; try {runRoot(process.argv[1],'run:fifo',{maximumLegacyBytes:1024});process.exit(2);} catch(error){if(error.message!=='LEGACY_SCAN_BYTE_LIMIT')throw error;}`;
      const child=spawnSync(process.execPath,['--input-type=module','-e',code,storage],{encoding:'utf8',timeout:5000,killSignal:'SIGKILL'});
      assert.equal(child.status,0,child.error?.message??child.stderr);
    });
    await adapter.shutdown(new AbortController().signal);await store.shutdown(new AbortController().signal);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});
