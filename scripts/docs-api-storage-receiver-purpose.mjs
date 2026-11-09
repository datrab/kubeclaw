// Fixed original storage receiving purpose; raw DATA/API identity is unchanged.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {deriveNativeOperationFacts,nativeOperationFactDigest,storageReceiverRoleProof} from './docs-api-output-role-classification.mjs';
const authorityPath='scripts/docs-api-storage-receiver-purpose-authority.json';
const authoritySha256='afab0fa8e16c0a23eb33295bf6f2190e95ffc23b78e0bcecc9b2bbbc1c4090e8';
const acquired=new WeakMap(),hash=b=>createHash('sha256').update(b).digest('hex');
const identity=p=>JSON.stringify(['source','export','class','method','inputParameter'].map(k=>p[k]??null));
function read(root,source){assert(typeof source==='string'&&!path.isAbsolute(source)&&path.posix.normalize(source)===source&&!source.split('/').includes('..'),'STORAGE_PURPOSE_PATH');const file=path.join(root,source);assert(fs.realpathSync(file)===file&&fs.lstatSync(file).isFile(),'STORAGE_PURPOSE_PHYSICAL');return fs.readFileSync(file);}
const storageOwnerSources=Object.freeze(["skills/buster/engine/test-gates/artifacts.ts", "skills/common/plugin-runtime/foundation/config/published-pair.ts", "skills/common/plugin-runtime/foundation/observability/durable-delivery.ts", "skills/common/plugin-runtime/foundation/observability/durable-records.ts", "skills/common/plugins/runtime-dispatch/src/result-persistence.ts", "skills/prism/storage/artifacts.ts"]);
export function checkedStorageReceiverPurposes(root,sources=null){
 // Absence from the actual selected scope is not a fabricated purpose.
 if(sources!==null&&(!Array.isArray(sources)||!storageOwnerSources.every(source=>sources.includes(source))))return null;
 assert(path.isAbsolute(root)&&fs.realpathSync(root)===root,'STORAGE_PURPOSE_ROOT');
 const bytes=read(root,authorityPath);assert.equal(hash(bytes),authoritySha256,'STORAGE_PURPOSE_AUTHORITY');
 const authority=JSON.parse(bytes),pins=new Map([[authorityPath,authoritySha256]]),units=new Map(),receivers=new Map();
 assert.equal(authority.receivers.length,7);assert.equal(Object.keys(authority.sourcePins).length,6);
 for(const [source,sha]of Object.entries(authority.sourcePins)){assert.equal(hash(read(root,source)),sha,'STORAGE_PURPOSE_OWNER');pins.set(source,sha);}
 for(const receiver of authority.receivers){
  assert(!receivers.has(identity(receiver)),'STORAGE_PURPOSE_DUPLICATE');receivers.set(identity(receiver),receiver);
  for(const operation of receiver.operations){
   const facts=deriveNativeOperationFacts(root,operation.source,operation.selectors);
   assert.equal(nativeOperationFactDigest(facts),operation.factsDigest,'STORAGE_PURPOSE_OPERATION');
   for(const fact of facts){pins.set(fact.source,hash(read(root,fact.source)));if(fact.source===receiver.source&&fact.kind!=='source-input'){if(!units.has(fact.source))units.set(fact.source,new Set());units.get(fact.source).add(fact.sha256);}}
  }
 }
 const recheck=()=>{for(const [source,sha]of pins)assert.equal(hash(read(root,source)),sha,'STORAGE_PURPOSE_CHANGED_INPUT:'+source);};recheck();
 const receipt=Object.freeze({purpose:'Source-owned-original-storage-receiving-family',contentIdentity:'unresolved-DATA',witnessDigest:authoritySha256,inputDigest:hash(JSON.stringify([...pins])),dependencies:Object.freeze([...pins.keys()]),runtimeExecutionAuthorized:false,apiApplyAuthorized:false,callerPayloadsQualified:false});acquired.set(receipt,{root,pins,units,receivers,recheck});return receipt;
}
export function selectedStorageReceiverPurpose(source,role,receipt){
 if(!receipt||role.role!=='unknown')return null;
 const record=acquired.get(receipt);assert(record,'STORAGE_PURPOSE_UNACQUIRED');
 const proof=storageReceiverRoleProof(record.root,source,role);if(!proof)return null;
 record.recheck();
 if(proof.receiver){
  if(!record.receivers.has(identity(proof.receiver))||proof.writerSha256!==record.pins.get(proof.writerSource))return null;
  if(proof.provenance==='imported-interface-contract'){
   if(proof.writerSource!=='skills/buster/engine/test-gates/artifacts.ts'||proof.receiver.class!=='FileEvidenceStore'||proof.receiver.method!=='store')return null;
   return Object.freeze({...receipt,purpose:'imported-EvidenceStore-interface-receiving-contract',actualNativeReceiverProven:false,runtimeEffectsUnobserved:true});
  }
  if(proof.provenance!=='resolved-native-declaration')return null;
  return Object.freeze({...receipt,purpose:'resolved-native-declaration-storage-receiving-contract',actualNativeReceiverProven:true,runtimeEffectsUnobserved:true});
 }
 if(!proof.terminal||proof.sourceSha256!==record.pins.get(source)||!proof.units.some(unit=>record.units.get(source)?.has(unit)))return null;
 return Object.freeze({...receipt,purpose:'reviewed-operative-native-storage-terminal-receiver',runtimeEffectsUnobserved:true});
}
