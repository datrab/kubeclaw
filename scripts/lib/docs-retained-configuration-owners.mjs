import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {historicalEnvironmentDeclarations,historicalQuantityContract} from './docs-retained-owner-constructors.mjs';
export const HISTORICAL_SOURCE_REVISION='6fa4830a48244d29655104a5be58957d5fa87d2f';
export const HISTORICAL_ARTIFACT_REVISION='145da1d0b30fb3b636c4b03fb3d3252819ee2bf5';
export const REQUIRED_SOURCE_FILES=Object.freeze(['scripts/docs-configuration-inventory.mjs']);
export const REQUIRED_ARTIFACT_FILES=Object.freeze(['scripts/docs-local-helm-field-authorities.json']);
// Exact entire byte grammar is intentionally stricter than structural AST equality.
// It binds every literal, tuple, branch, constructor and potential side effect.
export const HISTORICAL_OWNER_SOURCE_SHA256='6a1e669d9287225ef0c7b9e572326d6cbc71c1eb2f4e460c6237dc5acc1f4831';
const canonical=x=>JSON.parse(JSON.stringify(x));
const sha256=s=>createHash('sha256').update(s).digest('hex');
export function requiredHistoricalOwnerFiles(configurationValues){
 const sourceFiles=[...REQUIRED_SOURCE_FILES];
 for(const file of configurationValues.files)for(const doc of file.documents)for(const field of doc.fields){
  const normalized=field.path.replace(/^\$\.?/u,'').replace(/\[\d+\]/gu,'[]');
  if(/\.containers\[\]\.resources\.(?:requests|limits)\.(?:cpu|memory|ephemeral-storage)$/u.test(normalized)&&field.meaning?.status==='deployment-operational-authority'&&!sourceFiles.includes(file.path))sourceFiles.push(file.path);
 }
 return {sourceFiles,artifactFiles:[...REQUIRED_ARTIFACT_FILES]};
}
/** Pure bounded bootstrap: readers are supplied by authenticated native CLI.
 * readSourceText reads source6fa; readArtifactJson reads artifact145.
 * No input source bytes are evaluated, compiled, imported or executed.
 */
export function buildHistoricalOwners({runtimeInputs,configurationValues,readSourceText,readArtifactJson}){
 assert.equal(typeof readSourceText,'function');assert.equal(typeof readArtifactJson,'function');
 const ownerText=readSourceText(REQUIRED_SOURCE_FILES[0]);assert.equal(typeof ownerText,'string');
 assert.equal(sha256(ownerText),HISTORICAL_OWNER_SOURCE_SHA256,'HISTORICAL_OWNER_WHOLE_SOURCE_GRAMMAR_DRIFT');
 const envBindings=historicalEnvironmentDeclarations();
 for(const binding of envBindings){
  const entries=runtimeInputs.environment.filter(e=>e.name===binding.name);assert.equal(entries.length,1,'HISTORICAL_ENV_ENTRY_MISSING_OR_AMBIGUOUS');
  const tuples=entries[0].consumerContracts.filter(c=>c.path===binding.path);assert.equal(tuples.length,1,'HISTORICAL_ENV_TUPLE_MISSING_OR_AMBIGUOUS');const tuple=tuples[0];
  for(const [key,value] of Object.entries(binding.raw)){
   if(['purpose','evidence'].includes(key))continue;
   assert.deepEqual(canonical(tuple[key]),canonical(value),'HISTORICAL_ENV_OWNER_LITERAL_DRIFT:'+binding.name+':'+key);
  }
  binding.historicalTuple=structuredClone(tuple);
 }
 const quantityBindings=[],sourceTexts={};
 for(const file of configurationValues.files)for(const doc of file.documents)for(const field of doc.fields){
  const normalized=field.path.replace(/^\$\.?/u,'').replace(/\[\d+\]/gu,'[]');
  if(!/\.containers\[\]\.resources\.(?:requests|limits)\.(?:cpu|memory|ephemeral-storage)$/u.test(normalized)||field.meaning?.status!=='deployment-operational-authority')continue;
  assert(doc.resource&&typeof doc.resource.apiVersion==='string'&&typeof doc.resource.kind==='string','HISTORICAL_QUANTITY_RESOURCE_MISSING');
  const contract=historicalQuantityContract(doc.resource);
  quantityBindings.push({file:file.path,document:doc.index,path:field.path,contract});
  if(!Object.hasOwn(sourceTexts,file.path)){sourceTexts[file.path]=readSourceText(file.path);assert.equal(typeof sourceTexts[file.path],'string');}
 }
 const registry=readArtifactJson(REQUIRED_ARTIFACT_FILES[0]);assert(registry?.files&&registry?.charts,'HISTORICAL_LOCAL_REGISTRY_INVALID');
 return {artifactRevision:HISTORICAL_ARTIFACT_REVISION,sourceRevision:HISTORICAL_SOURCE_REVISION,envBindings:canonical(envBindings),quantityBindings:canonical(quantityBindings),sourceTexts,registry:structuredClone(registry)};
}
