import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {runtimeConsumerContract} from '../docs-runtime-consumer-contracts.mjs';
export const OBSERVER_SEMANTIC_RECEIVERS=Object.freeze([{path:'skills/common/plugins/openclaw-agent-observer/src/config.ts',sha256:'1617f4937214a1b601b66d2525309a780c9202e54666a4ac3ff9135e3216297c'}]);
const source=OBSERVER_SEMANTIC_RECEIVERS[0].path;
const name='OPENCLAW_AGENT_OBSERVER_ENABLED';
const oldEmpty='Empty is rejected. Whitespace-only numeric text becomes zero: hookPriority accepts it; positive values reject it.';
const nextEmpty='The normalizer rejects undefined, null and an empty string. Whitespace-only non-empty text becomes false.';
export function projectRetainedObserverMeaning({runtimeInputs,readSourceText}){
 assert.equal(typeof readSourceText,'function');
 const text=readSourceText(source);assert.equal(createHash('sha256').update(text).digest('hex'),OBSERVER_SEMANTIC_RECEIVERS[0].sha256,'OBSERVER_HISTORICAL_RECEIVER_BODY_DRIFT');
 const runtime=structuredClone(runtimeInputs),entries=runtime.environment.map((value,index)=>({value,index})).filter(({value})=>value.name===name);
 assert.equal(entries.length,1,'OBSERVER_ENABLED_ENTRY_MISSING_OR_AMBIGUOUS');const {value:entry,index:ei}=entries[0];
 const tuples=entry.consumerContracts.map((value,index)=>({value,index})).filter(({value})=>value.path===source);
 assert.equal(tuples.length,1,'OBSERVER_ENABLED_TUPLE_MISSING_OR_AMBIGUOUS');const {value:tuple,index:ci}=tuples[0];
 assert.equal(entry.consumerContracts.length,1,'OBSERVER_ENABLED_AGGREGATE_CHANGED');assert.equal(entry.meaningStatus,'authored-consumer-specific-contract','OBSERVER_ENABLED_CLASSIFICATION_CHANGED');
 assert.equal(tuple.emptyBehavior,oldEmpty,'OBSERVER_ENABLED_OLD_EMPTY_DRIFT');assert.equal(entry.emptyBehavior,oldEmpty,'OBSERVER_ENABLED_OLD_AGGREGATE_DRIFT');
 assert.equal(runtimeConsumerContract(name,source)?.emptyBehavior,nextEmpty,'OBSERVER_CURRENT_EMPTY_OWNER_DRIFT');
 const changes=[];for(const [target,jsonPointer] of [[tuple,`/environment/${ei}/consumerContracts/${ci}/emptyBehavior`],[entry,`/environment/${ei}/emptyBehavior`]]){changes.push({inventory:'runtimeInputs',jsonPointer,owner:'ObserverEnabledBooleanMeaning',oldValue:oldEmpty,newValue:nextEmpty});target.emptyBehavior=nextEmpty;}
 const restored=structuredClone(runtime);restored.environment[ei].consumerContracts[ci].emptyBehavior=oldEmpty;restored.environment[ei].emptyBehavior=oldEmpty;assert.deepEqual(restored,runtimeInputs,'OBSERVER_NONMEANING_RUNTIME_DRIFT');
 return {runtimeInputs:runtime,changes,meaningEvidence:{environment:[{name,path:source,sources:[{path:source,line:5,endLine:5},{path:source,line:39,endLine:45},{path:source,line:83,endLine:111}]}]},preservation:{allOtherRuntimePointersEqual:true,correctedEnvironmentTuples:1,correctedStringPointers:2,notCurrentAcquisition:true,currentProducerQualification:false,currentApiRole:false}};
}
