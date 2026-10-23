import fs from 'node:fs';
import path from 'node:path';
import { canonicalJson, type ArtifactRef, type AttemptIdentity, type EffectRequest, type EffectReceipt, type RegistrationProvenance, type LifecycleEvent, type PipelineDefinition, type PluginDomainEvent, type StageAttempt, type StageResult } from '@kubeclaw/plugin-sdk';
import { validateContractValue } from '@kubeclaw/plugin-foundation/registry/schema';
import { validEffectIdentity } from '../effects/identity.ts';
import { runRoot } from '../execution/run-root.ts';
import { assertRunSnapshot, type RunSnapshot } from '../execution/engine-snapshots.ts';
import { recoverStageStates } from '../lifecycle/recovery.ts';
import { parseJournalRecords, type JournalRecord } from './journal.ts';

export interface RunEvidenceSelection {
  readonly runId: string;
  readonly journalHead: string;
  readonly snapshotDigest: string;
}
export interface RunEvidenceProjection extends RunEvidenceSelection {
  readonly schemaVersion: 'run-evidence-projection.v1';
  readonly pipelineId: string;
  readonly terminal: string;
  readonly eventCount: number;
  readonly effectsHead: string | null;
  readonly stages: readonly { readonly stageId: string; readonly stageType: string; readonly status: string; readonly attempts: number }[];
  readonly attempts: readonly { readonly identity: AttemptIdentity; readonly outcome: StageResult['outcome']; readonly eventHash: string }[];
  readonly artifacts: readonly ArtifactRef[];
}
interface ReadOptions {
  readonly storageRoot: string;
  readonly maximumBytes: number;
  readonly orchestratorIssuerId: string;
}
function sameFile(a: fs.Stats, b: fs.Stats): boolean {
  return a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
}
function readFile(file: string, maximumBytes: number): { bytes: Buffer; stat: fs.Stats } {
  const descriptor = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile() || stat.size > maximumBytes) throw new Error('RUN_EVIDENCE_FILE_OR_BUDGET_INVALID');
    const bytes = Buffer.alloc(stat.size + 1);
    let total = 0;
    while (total < bytes.length) {
      const count = fs.readSync(descriptor, bytes, total, bytes.length - total, total);
      if (!count) break;
      total += count;
    }
    if (total !== stat.size || !sameFile(stat, fs.fstatSync(descriptor))) throw new Error('RUN_EVIDENCE_CHANGED');
    return { bytes: bytes.subarray(0, total), stat };
  } finally { fs.closeSync(descriptor); }
}
function directories(root: string): Map<string, fs.Stats> {
  const pinned = new Map<string, fs.Stats>();
  let cursor = path.parse(root).root;
  for (const component of root.slice(cursor.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, component);
    const stat = fs.lstatSync(cursor);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('RUN_EVIDENCE_ROOT_INVALID');
    pinned.set(cursor, stat);
  }
  return pinned;
}
function checkedAttempt(entry: LifecycleEvent, runId: string, open: Map<string,AttemptIdentity>): StageAttempt {
  const attempt=entry.payload.attempt as StageAttempt;
  validateContractValue('stageAttempt',attempt);
  if (attempt.identity.attemptId !== entry.identity.attemptId || attempt.identity.runId !== runId
    || attempt.identity.stageId !== entry.identity.stageId || open.has(attempt.identity.attemptId)) throw new Error('RUN_EVIDENCE_ATTEMPT_INVALID');
  return attempt;
}
interface EffectEvidence { request: EffectRequest; accepted: boolean; receipt?: EffectReceipt }
function effectRecords(file: string, maximumBytes: number) {
  const read=readFile(file,maximumBytes);
  const records: JournalRecord<{type:string;request?:EffectRequest;receipt?:EffectReceipt}>[]=[];
  parseJournalRecords(read.bytes,records,file);
  const effects=new Map<string,EffectEvidence>();
  for(const {entry} of records) {
    if(entry.type==='requested') {
      const request=entry.request!; if(request.schemaVersion!=='effect-request.v2'||!validEffectIdentity(request))throw new Error('RUN_EVIDENCE_EFFECT_INVALID');
      if(effects.has(request.idempotencyKey))throw new Error('RUN_EVIDENCE_EFFECT_INVALID');
      effects.set(request.idempotencyKey,{request,accepted:false});
    } else completeEffectEntry(effects,entry);
  }
  if([...effects.values()].some(effect=>!effect.receipt))throw new Error('RUN_EVIDENCE_EFFECT_UNRESOLVED');
  return {...read,head:records.at(-1)?.hash??null,effects};
}
function completeEffectEntry(effects: Map<string,EffectEvidence>, entry: {type:string;request?:EffectRequest;receipt?:EffectReceipt}): void {
  const key=entry.request?.idempotencyKey??entry.receipt?.idempotencyKey;
  const effect=effects.get(key!);
  if(!effect||effect.receipt)throw new Error('RUN_EVIDENCE_EFFECT_INVALID');
  if(entry.type==='accepted') {
    if(effect.accepted||canonicalJson(entry.request)!==canonicalJson(effect.request))throw new Error('RUN_EVIDENCE_EFFECT_INVALID');
    effect.accepted=true;return;
  }
  if(!['completed','completed-reference'].includes(entry.type)||!effect.accepted)throw new Error('RUN_EVIDENCE_EFFECT_INVALID');
  validateContractValue('effectReceipt',entry.receipt);
  if(entry.receipt!.effectId!==effect.request.effectId)throw new Error('RUN_EVIDENCE_EFFECT_INVALID');
  effect.receipt=entry.receipt!;
}
function matchesAudit(event: LifecycleEvent, effect: EffectEvidence): boolean {
  const request=effect.request;
  if(event.payload.executionMode!=='durable')return false;
  if(event.identity.runId!==request.attempt.runId||event.identity.stageId!==request.attempt.stageId
    ||event.identity.attemptId!==request.attempt.attemptId)return false;
  if(event.type==='effect.requested')return canonicalJson(event.payload)===canonicalJson({executionMode:'durable',capability:request.capability,operation:request.operation,resource:request.resource});
  if(event.type==='effect.accepted')return effect.accepted;
  const expected=effect.receipt!.status==='completed'?'effect.completed':'effect.failed';
  return event.type===expected&&canonicalJson(event.payload.adapter)===canonicalJson(effect.receipt!.adapter);
}
function pinnedConfidentialProvider(requested: LifecycleEvent, completed: LifecycleEvent, registry: RunSnapshot['registry']): boolean {
  const capability=requested.payload.capability;
  if(typeof capability!=='string'||!Array.isArray(registry.selectedProviders))return false;
  const selected=registry.selectedProviders as {capability:string;provider:RegistrationProvenance}[];
  const provider=selected.find(entry=>entry.capability===capability)?.provider;
  if(!provider)return false;
  return canonicalJson(completed.payload.adapter)===canonicalJson({...provider.package.package,registrationId:provider.registrationId});
}
function confidentialAudit(events: readonly LifecycleEvent[], registry: RunSnapshot['registry']): boolean {
  const requested=events.find(event=>event.type==='effect.requested');
  const accepted=events.find(event=>event.type==='effect.accepted');
  const completed=events.find(event=>event.type==='effect.completed'||event.type==='effect.failed');
  if(events.length!==3||!requested||!accepted||!completed)return false;
  if(events[0]!==requested||events[1]!==accepted||events[2]!==completed
    ||events.some(event=>event.payload.executionMode!=='confidential'||canonicalJson(event.identity)!==canonicalJson(requested.identity)))return false;
  if(!pinnedConfidentialProvider(requested,completed,registry))return false;
  const resource=requested.payload.resource as Record<string,unknown>;
  const result=completed.payload.result as Record<string,unknown>|undefined;
  const error=completed.payload.error as Record<string,unknown>|undefined;
  return resource?.canonicalId==='[confidential]'&&(result?.confidential===true||error?.code==='adapter.confidential_effect_failed');
}
function reconcileEffects(records: readonly JournalRecord<LifecycleEvent | PluginDomainEvent>[], effects: Map<string,EffectEvidence>, registry: RunSnapshot['registry']): void {
  const byId=new Map([...effects.values()].map(effect=>[effect.request.effectId,effect]));
  if(byId.size!==effects.size)throw new Error('RUN_EVIDENCE_EFFECT_INVALID');
  const audit=new Map<string,LifecycleEvent[]>();
  for(const {entry} of records) {
    if(entry.schemaVersion!=='lifecycle-event.v2'||!entry.type.startsWith('effect.'))continue;
    const id=entry.identity.effectId!;
    audit.set(id,[...(audit.get(id)??[]),entry]);
  }
  for(const [id,events] of audit) {
    const effect=byId.get(id);
    if(!effect) {
      if(!confidentialAudit(events,registry))throw new Error('RUN_EVIDENCE_EFFECT_AUDIT_MISMATCH');
    } else if(events.some(event=>!matchesAudit(event,effect)))throw new Error('RUN_EVIDENCE_EFFECT_AUDIT_MISMATCH');
  }
  for(const effect of effects.values()) {
    if(effect.request.attempt.attemptId.startsWith('observer:'))continue;
    const events=audit.get(effect.request.effectId)??[];
    if(!events.some(event=>event.type==='effect.requested')||!events.some(event=>event.type==='effect.completed'||event.type==='effect.failed'))throw new Error('RUN_EVIDENCE_EFFECT_AUDIT_MISMATCH');
  }
}
function inspectEffects(file: string, records: readonly JournalRecord<LifecycleEvent | PluginDomainEvent>[], maximumBytes: number, registry: RunSnapshot['registry']) {
  if(!fs.existsSync(file)) {
    reconcileEffects(records,new Map(),registry);return null;
  }
  const effects=effectRecords(file,maximumBytes);
  reconcileEffects(records,effects.effects,registry);
  if(!sameFile(effects.stat,fs.lstatSync(file)))throw new Error('RUN_EVIDENCE_CHANGED');
  return effects.head;
}
function validateSelection(selection: RunEvidenceSelection, options: ReadOptions): void {
  if (!Number.isSafeInteger(options.maximumBytes) || options.maximumBytes < 1) throw new Error('RUN_EVIDENCE_BUDGET_INVALID');
  if (!path.isAbsolute(options.storageRoot) || !/^sha256:[a-f0-9]{64}$/u.test(selection.journalHead)
    || !/^sha256:[a-f0-9]{64}$/u.test(selection.snapshotDigest)) throw new Error('RUN_EVIDENCE_SELECTION_INVALID');
}
function verifyDirectories(pinned: Map<string,fs.Stats>): void {
  for (const [directory, stat] of pinned) {
    const current = fs.lstatSync(directory);
    if (!current.isDirectory() || stat.dev !== current.dev || stat.ino !== current.ino) throw new Error('RUN_EVIDENCE_CHANGED');
  }
}
function attemptArtifacts(records: readonly JournalRecord<LifecycleEvent | PluginDomainEvent>[], runId: string) {
  const open = new Map<string, AttemptIdentity>();
  const attempts: RunEvidenceProjection['attempts'][number][] = [];
  const artifacts: ArtifactRef[] = [];
  for (const { entry, hash } of records) {
    if (entry.identity.runId !== runId) throw new Error('RUN_EVIDENCE_RUN_MISMATCH');
    if (entry.schemaVersion !== 'lifecycle-event.v2') continue;
    validateContractValue('lifecycleEvent', entry);
    if (entry.type === 'attempt.created') {
      const attempt = checkedAttempt(entry,runId,open);
      open.set(attempt.identity.attemptId, attempt.identity);
    }
    if (!['attempt.completed', 'attempt.cancelled', 'attempt.timed_out'].includes(entry.type)) continue;
    const identity = open.get(entry.identity.attemptId!);
    if (!identity || identity.stageId !== entry.identity.stageId) throw new Error('RUN_EVIDENCE_ATTEMPT_INVALID');
    const result = entry.payload.result as StageResult;
    validateContractValue('stageResult', result);
    for (const artifact of result.artifacts) {
      if (canonicalJson(artifact.producer) !== canonicalJson(identity)) throw new Error('RUN_EVIDENCE_ARTIFACT_OWNER_INVALID');
      if (!artifacts.some(ref => canonicalJson(ref) === canonicalJson(artifact))) artifacts.push(artifact);
    }
    attempts.push({ identity, outcome: result.outcome, eventHash: hash });
    open.delete(identity.attemptId);
  }
  if (open.size) throw new Error('RUN_EVIDENCE_ATTEMPT_UNFINISHED');
  return { attempts, artifacts };
}

/** Bounded, read-only projection of the original completed journal. Never repairs a tail. */
export function readRunEvidence(input: RunEvidenceSelection, configured: ReadOptions): RunEvidenceProjection {
  const selection = { runId: input.runId, journalHead: input.journalHead, snapshotDigest: input.snapshotDigest };
  const options = structuredClone(configured);
  validateSelection(selection,options);
  directories(options.storageRoot);
  const root = runRoot(options.storageRoot, selection.runId, { maximumLegacyBytes: options.maximumBytes });
  const pinned = directories(root);
  const eventsFile = path.join(root, 'events.jsonl'); const snapshotFile = path.join(root, 'run-snapshot.json');
  const events = readFile(eventsFile, options.maximumBytes);
  const snapshotRead = readFile(snapshotFile, options.maximumBytes - events.bytes.length);
  const snapshot = JSON.parse(snapshotRead.bytes.toString()) as RunSnapshot; assertRunSnapshot(snapshot);
  if(snapshot.registry.effectAuditVersion!=='coordinator-mode.v1')throw new Error('RUN_EVIDENCE_EFFECT_MODE_UNVERIFIABLE:historical snapshot predates coordinator mode evidence; automatic migration is unsupported');
  if (snapshot.digest !== selection.snapshotDigest) throw new Error('RUN_EVIDENCE_SNAPSHOT_MISMATCH');
  const records: JournalRecord<LifecycleEvent | PluginDomainEvent>[] = [];
  parseJournalRecords(events.bytes, records, eventsFile);
  if (!records.length || records.at(-1)!.hash !== selection.journalHead) throw new Error('RUN_EVIDENCE_HEAD_MISMATCH');
  const terminal = records.filter(({ entry }) => entry.schemaVersion === 'lifecycle-event.v2' && entry.type.startsWith('run.')).at(-1)?.entry.type;
  if (!terminal || !['run.succeeded', 'run.failed', 'run.cancelled'].includes(terminal)) throw new Error('RUN_EVIDENCE_NOT_COMPLETED');
  const definition: PipelineDefinition = { schemaVersion: 'pipeline-definition.v2', id: snapshot.graph.pipelineId,
    maxConcurrency: snapshot.graph.maxConcurrency, stages: [...snapshot.graph.nodes] as PipelineDefinition['stages'] };
  validateContractValue('pipelineDefinition', definition);
  const states = recoverStageStates(definition, records, selection.runId, options.orchestratorIssuerId);
  const sources = attemptArtifacts(records, selection.runId);
  if (!sameFile(events.stat, fs.lstatSync(eventsFile)) || !sameFile(snapshotRead.stat, fs.lstatSync(snapshotFile))) throw new Error('RUN_EVIDENCE_CHANGED');
  verifyDirectories(pinned);
  const effectsFile=path.join(root,'effects.jsonl');
  const effectsHead=inspectEffects(effectsFile,records,options.maximumBytes-events.bytes.length-snapshotRead.bytes.length,snapshot.registry);
  if (!sameFile(events.stat, fs.lstatSync(eventsFile)) || !sameFile(snapshotRead.stat, fs.lstatSync(snapshotFile))) throw new Error('RUN_EVIDENCE_CHANGED');
  verifyDirectories(pinned);
  return structuredClone({ schemaVersion: 'run-evidence-projection.v1', ...selection, pipelineId: definition.id, terminal,
    eventCount: records.length, effectsHead, stages: definition.stages.map(stage => ({ stageId: stage.id, stageType: stage.type,
      status: states.get(stage.id)!.status, attempts: states.get(stage.id)!.attemptNumber })), ...sources });
}
