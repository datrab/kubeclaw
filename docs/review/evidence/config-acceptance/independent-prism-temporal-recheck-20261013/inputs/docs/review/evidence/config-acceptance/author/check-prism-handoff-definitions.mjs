// Proposed documentation schemas/specimens only; no productive target behavior.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import Ajv from 'ajv';
const path='docs/review/evidence/config-acceptance/author/prism-handoff-target-contracts-20261013.json';
const raw=readFileSync(path), doc=JSON.parse(raw);
const ajv=new Ajv({strict:true,allowUnionTypes:true,allErrors:true});
const validators=Object.fromEntries(Object.entries(doc.proposedSchemas).map(([k,s])=>[k,ajv.compile(s)]));
const results=[];
function canonical(value){
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
 return value;
}
const sha=value=>'sha256:'+createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
for(const [name,profile] of Object.entries(doc.profiles)){
 for(const [schema,field,digestField] of [['designBinding','roundBinding','bindingDigest'],['nativeProvenance','nativeProvenance','provenanceDigest']]){
  const value=profile[field];assert.ok(validators[schema](value),JSON.stringify(validators[schema].errors));
  const unsigned=structuredClone(value);delete unsigned[digestField];assert.equal(value[digestField],sha(unsigned));
  results.push({case:name+'-'+schema+'-structural-and-canonical-digest',passed:true});
 }
 assert.equal(profile.roundBinding.controlConfigDigest,sha(profile.completeSixOwnerDocuments['prism-control.config.json']));
 assert.equal(profile.roundBinding.intentDigest,sha(profile.originalIntent));
 assert.equal(profile.nativeProvenance.config.digest,sha(profile.completeSixOwnerDocuments['prism-worker.config.json']));
 assert.equal(profile.nativeProvenance.installationManifestDigest,sha(profile.installationManifest));
 results.push({case:name+'-complete-definition-reference-concordance',passed:true});
 assert.ok(validators.inputSpool(profile.inputSpool));
 const inputBytes=Buffer.from(profile.ownedInputDefinitionBytesUtf8);
 const inputDigest='sha256:'+createHash('sha256').update(inputBytes).digest('hex');
 assert.equal(profile.inputSpool.contentDigest,inputDigest);
 assert.equal(profile.inputSpool.artifactId,'artifact:'+inputDigest);
 assert.equal(profile.inputSpool.sizeBytes,inputBytes.length);
 assert.deepEqual(profile.nativeProvenance.runtime,profile.installationManifest.runtime);
 results.push({case:name+'-planned-input-and-runtime-manifest-concordance',passed:true});
}
for(const [name,mutate] of [
 ['missing-count',v=>delete v.count],['count-one',v=>v.count=1],
 ['count-four',v=>v.count=4],['count-string',v=>v.count='2'],
 ['unknown-author',v=>v.latestPolicy=true]]){
 const value=structuredClone(doc.profiles.A.roundBinding);mutate(value);
 assert.equal(validators.designBinding(value),false);
 results.push({case:name+'-schema-reject',passed:true,errors:structuredClone(validators.designBinding.errors)});
}
const role=structuredClone(doc.profiles.A.nativeProvenance);role.role='untrusted-task-role';
assert.equal(validators.nativeProvenance(role),false);results.push({case:'wrong-role-schema-reject',passed:true});
assert.equal(new Set(doc.futureCases.map(c=>c.id)).size,37);
for(const test of doc.futureCases){
 const unsigned=structuredClone(test);delete unsigned.specificationSha256;
 assert.equal(test.specificationSha256,sha(unsigned));
 assert.equal(test.result,'not-run');assert.equal(test.implementationResult,'not-run');
 assert.equal(test.proposedInvocation.requiredCollection.expectedCaseId,test.id);
 assert.ok(test.command.includes(test.id));
}
results.push({case:'37-future-spec-identities-not-runtime-results',passed:true});
const receipt={scope:'Documentation specimen/schema/hash controls only, NOT F-MUT, installed image, task intent, grant or runtime acceptance.',
 specificationSha256:createHash('sha256').update(raw).digest('hex'),
 testSha256:createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex'),results};
writeFileSync('docs/review/evidence/config-acceptance/author/prism-handoff-definition-controls-20261013.json',JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({passed:results.length,futureCases:doc.futureCases.length,scope:receipt.scope}));
