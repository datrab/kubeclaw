import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {environmentConsumerPurpose,formatLocalHelmMeaning,formatApiOperationalMeaning,versionedApiSchemaContract} from './docs-retained-configuration-formatters.mjs';
import { editorialOwners } from './docs-configuration-editorial-language.mjs';
import { runtimeConsumerContract } from '../docs-runtime-consumer-contracts.mjs';

const canonical=x=>JSON.parse(JSON.stringify(x));
const same=(a,b,label)=>assert.deepEqual(canonical(a),canonical(b),label);
// Compare the complete native modeled return while retaining unknown extension keys.
const sameModeled=(expected,actual,label)=>{const selected={};for(const key of Object.keys(expected))selected[key]=actual[key];same(expected,selected,label);};
const sha256=s=>createHash('sha256').update(s).digest('hex');
const pointer=s=>String(s).replaceAll('~','~0').replaceAll('/','~1');
function envUpdate(binding,editorial){
 if(binding.path==='skills/common/plugins/openclaw-agent-observer/src/config.ts'){
  const current=runtimeConsumerContract(binding.name,binding.path);assert(current,'RETAINED_OBSERVER_OWNER_MISSING');
  const patch={};
  for(const key of ['purpose','acceptedForm','defaultBehavior','emptyBehavior','invalidBehavior','precedence','impact','failure']){
   if(binding.name==='OPENCLAW_AGENT_OBSERVER_ENABLED'&&key==='emptyBehavior')continue;
   assert.equal(typeof current[key],'string','RETAINED_OBSERVER_OWNER_FIELD_MISSING');
   patch[key]=key==='purpose'?environmentConsumerPurpose({...binding.raw,purpose:current.purpose}):current[key];
  }
  return patch;
 }
 switch(binding.name){
 case 'BUSTER_SOURCE_ATTESTATION_PUBLIC_KEY': return {acceptedForm:editorial.ed25519AcceptedForm};
 case 'KUBERNETES_SERVICE_HOST': return {defaultBehavior:editorial.kubernetesHostDefault};
 case 'KUBERNETES_SERVICE_PORT': return {defaultBehavior:editorial.kubernetesPortDefault};
 case 'MCP_ALLOWED_ORIGINS': return {invalidBehavior:editorial.originInvalid};
 default: throw Error('RETAINED_EDITORIAL_OWNER_UNSUPPORTED');
 }
}
export function projectRetainedInventoryLanguage({runtimeInputs,configurationValues,historicalOwners}){
 const originalRuntime=canonical(runtimeInputs),originalValues=canonical(configurationValues);
 const runtime=structuredClone(runtimeInputs),values=structuredClone(configurationValues),changes=[];
 const editorial={...editorialOwners,...historicalOwners.editorialOwners};
 const set=(target,key,value,inventory,path,owner)=>{if(target[key]===value)return;assert.equal(typeof value,'string');changes.push({inventory,jsonPointer:path+'/'+pointer(key),owner,oldValue:target[key],newValue:value});target[key]=value;};
 // Exact historical tuple bootstrap is verified against authenticated artifact by CLI.
 for(const binding of historicalOwners.envBindings){
  const ei=runtime.environment.findIndex(e=>e.name===binding.name);assert(ei>=0,'RETAINED_ENV_OWNER_REMOVED');const e=runtime.environment[ei];
  const matches=e.consumerContracts.map((c,i)=>({c,i})).filter(({c})=>c.path===binding.path);assert.equal(matches.length,1,'RETAINED_ENV_OWNER_AMBIGUOUS');const {c,i}=matches[0];same(c,binding.historicalTuple,'RETAINED_ENV_TUPLE_DRIFT');
  const raw={...binding.raw,owner:c.owner,owningSurface:c.owningSurface,boundary:c.boundary};
  same(environmentConsumerPurpose(raw),c.purpose,'RETAINED_ENV_PURPOSE_RECONSTRUCTION');
  const patch=envUpdate(binding,editorial);
  for(const [key,value] of Object.entries(patch)){
   same(c[key],key==='purpose'?environmentConsumerPurpose(raw):binding.raw[key],'RETAINED_ENV_DECLARATION_DRIFT');
   set(c,key,value,'runtimeInputs',`/environment/${ei}/consumerContracts/${i}`,'ENV:'+binding.name+':'+binding.path);
   // Existing single-consumer aggregate rule copies exactly this contract leaf.
   if(e.meaningStatus==='authored-consumer-specific-contract'&&e.consumerContracts.length===1){const aggregateKey=({purpose:'meaning',precedence:'precedenceExplanation',impact:'changeImpact',failure:'failureMeaning'})[key]??key;same(e[aggregateKey],binding.historicalTuple[key],'RETAINED_ENV_AGGREGATE_RECONSTRUCTION');set(e,aggregateKey,value,'runtimeInputs',`/environment/${ei}`,'ENV-aggregate:'+binding.name);}
  }
 }
 let localCount=0,quantityCount=0;
 for(const [fi,file] of values.files.entries())for(const [di,doc] of file.documents.entries())for(const [xi,field] of doc.fields.entries()){
  const m=field.meaning; if(!m)continue;
  const base=`/files/${fi}/documents/${di}/fields/${xi}`;
  const registered=historicalOwners.registry.files[file.path]?.fields[field.path];
  if(m.status==='local-helm-field-authority'&&registered&&['process-command','linux-capability'].includes(registered.group)){
   same(m.semanticGroup,registered.group,'RETAINED_HELM_GROUP_DRIFT');const declaration=historicalOwners.registry.files[file.path];
   const authority={...registered,chartRoot:declaration.chartRoot,sourceFileSha256:declaration.sourceSha256,semanticAuthorityEvidence:m.semanticAuthorityEvidence,semanticContractEvidence:m.semanticContractEvidence};
   const args={context:{sourcePath:file.path,sourceClass:file.sourceClass,fieldLine:field.sourceLine},authority,semantics:field};
   const old=formatLocalHelmMeaning(args);sameModeled(old,m,'RETAINED_HELM_WHOLE_MEANING_RECONSTRUCTION');
   const key=registered.group==='process-command'?'emptyBehavior':'acceptedValues';authority[key]=registered.group==='process-command'?editorial.commandEmpty:editorial.capabilityAccepted;
   const next=formatLocalHelmMeaning(args);for(const k of ['text','acceptedValues','emptyBehavior'])set(m,k,next[k],'configurationValues',base+'/meaning','localHelm:'+file.path+'#'+field.path);
   // Native field semantics duplicates owner acceptedValues in constraints.
   if(Array.isArray(field.constraints))for(const [ci,constraint] of field.constraints.entries())if(constraint===registered[key])set(field.constraints,ci,authority[key],'configurationValues',base+'/constraints','localHelm:'+file.path+'#'+field.path);
   localCount++;
  }
  const binding=historicalOwners.quantityBindings.find(b=>b.file===file.path&&b.document===doc.index&&b.path===field.path);
  if(binding){
   const normalized=field.path.replace(/^\$\.?/u,'').replace(/\[\d+\]/gu,'[]');assert.match(normalized,/\.containers\[\]\.resources\.(?:requests|limits)\.(?:cpu|memory|ephemeral-storage)$/u);
   const contract={...binding.contract},schemaAuthority=m.apiSchemaAuthority;
   const args={context:{sourcePath:file.path,fieldLine:field.sourceLine},semantics:field,contract,schemaContract:versionedApiSchemaContract(schemaAuthority),schemaAuthority,collectionSchema:m.apiCollectionAuthority,sha256,read:p=>{assert(Object.hasOwn(historicalOwners.sourceTexts,p));return historicalOwners.sourceTexts[p];}};
   const old=formatApiOperationalMeaning(args);sameModeled(old,m,'RETAINED_API_WHOLE_MEANING_RECONSTRUCTION');
   contract.acceptedValues=editorial.quantityAccepted; const next=formatApiOperationalMeaning(args);
   for(const k of ['text','acceptedValues'])set(m,k,next[k],'configurationValues',base+'/meaning','API-resource-quantity:'+file.path+'#'+field.path);
   for(const [ci,c] of field.constraints.entries())if(c===binding.contract.acceptedValues)set(field.constraints,ci,contract.acceptedValues,'configurationValues',base+'/constraints','API-resource-quantity:'+file.path+'#'+field.path);
   quantityCount++;
  }
 }
 assert.equal(quantityCount,historicalOwners.quantityBindings.length,'RETAINED_API_OWNER_REMOVED');
 // Every non-editorial pointer remains intact; reject accidental structural writes.
 const restoredRuntime=structuredClone(runtime),restoredValues=structuredClone(values);
 for(const change of changes){const restored=change.inventory==='runtimeInputs'?restoredRuntime:restoredValues;const parts=change.jsonPointer.slice(1).split('/').map(s=>s.replaceAll('~1','/').replaceAll('~0','~'));const key=parts.pop();let target=restored;for(const p of parts)target=target[p];target[key]=change.oldValue;}
 same(restoredRuntime,originalRuntime,'RETAINED_NONLANGUAGE_RUNTIME_DRIFT');same(restoredValues,originalValues,'RETAINED_NONLANGUAGE_VALUES_DRIFT');same(runtime.secrets,originalRuntime.secrets,'RETAINED_SECRET_DRIFT');
 return {runtimeInputs:runtime,configurationValues:values,changes,preservation:{allNonEditorialPointersEqual:true,secretsEqual:true,envNames:runtime.environment.length,localHelmOwnerFields:localCount,apiQuantityOwnerFields:quantityCount,notCurrentAcquisition:true}};
}
