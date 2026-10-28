import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {runtimeConsumerContract,prismPostgresqlSecretConsumerAuthority} from '../docs-runtime-consumer-contracts.mjs';
import {prismHelmScalarCorrection} from './docs-prism-helm-semantic-corrections.mjs';
import {environmentConsumerPurpose,formatEnvironmentAggregate,formatLocalHelmMeaning} from './docs-retained-configuration-formatters.mjs';
import {projectRetainedInventoryLanguage} from './docs-retained-configuration-projection.mjs';
import {buildHistoricalOwners} from './docs-retained-configuration-owners.mjs';
import {historicalPrismEnvironmentDeclarations} from './docs-retained-prism-historical-models.mjs';

// Version2 finite semantic projection. Historical artifact/source identities do not become current discovery.
export const PRISM_SEMANTIC_OWNER_FILES=Object.freeze(['scripts/lib/docs-retained-prism-semantics.mjs','scripts/lib/docs-retained-prism-historical-models.mjs','scripts/docs-runtime-consumer-contracts.mjs','scripts/lib/docs-prism-helm-semantic-corrections.mjs','scripts/lib/docs-retained-configuration-formatters.mjs','scripts/lib/docs-retained-configuration-projection.mjs','scripts/lib/docs-retained-configuration-owners.mjs','scripts/lib/docs-retained-owner-constructors.mjs','scripts/lib/docs-configuration-editorial-language.mjs']);
export const PRISM_HISTORICAL_SOURCE_FILES=Object.freeze(['scripts/docs-configuration-inventory.mjs','scripts/docs-runtime-consumer-contracts.mjs','skills/prism/package.json']);
export const PRISM_HISTORICAL_ARTIFACT_FILES=Object.freeze(['docs/generated/inventory/configuration-runtime-inputs.json','docs/generated/inventory/configuration-values.json','scripts/docs-local-helm-field-authorities.json']);
export const PRISM_SEMANTIC_RECEIVERS=Object.freeze([
  {
    "path": "skills/prism/config/native-worker.ts",
    "sha256": "00296097bfd5eaf337bb4782191f0d219008f890985f90a0e9a528ee15060367"
  },
  {
    "path": "skills/worker/core/worker/native-pool-policy.ts",
    "sha256": "3b64878629a5ee897e8dd71ae6b592bc1c89df36677fc2860f8d7f4bb4227307"
  },
  {
    "path": "skills/prism/server/native-worker-host.ts",
    "sha256": "485118712479bd2991724c4787acb4bf111ddd56866d0d584f608482a3b4ba34"
  },
  {
    "path": "skills/prism/server/worker-artifacts.ts",
    "sha256": "01590555f760fde93addcaccefe6d7fec3c38415e5e37e17086f82748a01e950"
  },
  {
    "path": "skills/prism/control/product-decisions.ts",
    "sha256": "65a172a7867a3ff4635956d3c02fd1ecae837fd9b25f913826b0d12fdca3f1a2"
  },
  {
    "path": "skills/prism/server/product-controller.ts",
    "sha256": "1b2ccc2bbe84e204b5ca40f749c3faf5308bad4e5052228a3ba40550d1bb77b1"
  },
  {
    "path": "skills/prism/server/control-config.ts",
    "sha256": "9da649103dd1bf2c1a95f533725942bd760e80f1353d4e0db924c4053c8dcd7a"
  },
  {
    "path": "skills/prism/server/studio-config.ts",
    "sha256": "fe231f8ab35b6dce042f237a56e44d08814405af5349c1f6106987ef776a7d18"
  },
  {
    "path": "skills/prism/server/studio-request.ts",
    "sha256": "efca0f821ef3da9f441e9c6c5458a33d8c525f8e7db3a63aea1a8e7f37e93bbb"
  },
  {
    "path": "skills/prism/control/session.ts",
    "sha256": "0d4f5e3842275055aaf928b51580f3879655538584dfd607ff80b31fc2aef77b"
  },
  {
    "path": "skills/prism/server/control-server.ts",
    "sha256": "c165fb6b20bc6b608ae2bc859f52fc5700856e6cea3798916df921dcac5ce8ac"
  },
  {
    "path": "skills/prism/server/worker-config.ts",
    "sha256": "03d8f233f98575392d58d3dc2c8a15fef681d06c51db61e6f748fc16ac96ab99"
  },
  {
    "path": "skills/prism/server/worker.ts",
    "sha256": "b8e882d4c0a5ea6001c5882a73c5a48ce079514ca758dacac7a623c529c4c376"
  },
  {
    "path": "skills/prism/server/worker-readiness.ts",
    "sha256": "b760fe315ee28b214d1309cb6ac85e16256581168d1bb27070de29ac956d233e"
  },
  {
    "path": "skills/prism/server/internal-artifacts.ts",
    "sha256": "16750a5eecea51781dc67e271cfc331550f1a0a03460917133226cd9c975dab8"
  },
  {
    "path": "skills/prism/server/bootstrap-database.ts",
    "sha256": "4cacc0a24266f58196bd6f6a74abeeb4f7bb95f833312fe691e9f6c0a76d28ee"
  },
  {
    "path": "skills/prism/server/migrate.ts",
    "sha256": "19eeb8571e604ec548334b4f4ea75bfb65975a6499dabef18052bc02f5a7cb18"
  },
  {
    "path": "skills/prism/server/database-roles.ts",
    "sha256": "f9b1b0048c2cc881969e33d7db58a74293a311079a50c8d391827996eaf5ae3a"
  },
  {
    "path": "skills/prism/config/database-bootstrap.ts",
    "sha256": "23b7078c1fe9304ab60d0fa7742dc5fe543a75da8a3367bb508a9ce8dc649625"
  },
  {
    "path": "skills/prism/server/ingestion.ts",
    "sha256": "bbee6795991e601600e6442927e483bcd5a87c798b66a42ed5606bb496354717"
  },
  {
    "path": "skills/prism/server/worker-lifecycle.ts",
    "sha256": "d166a6ec6fd21c6b28c5bbeb0a1494dd3b81c61bbae588846250347917f5318a"
  },
  {
    "path": "skills/worker/core/worker/native-worker-process.ts",
    "sha256": "d43bc3ce05976d77579dbc624cae8be1d3209732b023124e3eb6f0a8fd9860da"
  },
  {
    "path": "skills/worker/core/worker/native-attempt-executor.ts",
    "sha256": "bddc68aa370648c86e7b7301f4f31a083504217dd89bac7694c36c344a8e23a3"
  },
  {
    "path": "skills/worker/core/worker/native-attempt-journal.ts",
    "sha256": "9115ef644c440d5024745149613f63b971ba444ac54147b750f405e1ac2167e4"
  },
  {
    "path": "charts/prism/values.schema.json",
    "sha256": "8fecbef39b64b952a273b004e49106fb50e51d2fdfdad3f62a0b0892b2bb348f"
  },
  {
    "path": "charts/prism/templates/workloads.yaml",
    "sha256": "9bb2865f5d232b2cc5fac39259c8957e573decc891d2c9b25d7554da01148739"
  },
  {
    "path": "charts/prism/templates/ingestion.yaml",
    "sha256": "73f19bc39066d2f6f0944846c2784c193a4d1e59202ed737d3a6c6ff8ec77f98"
  },
  {
    "path": "charts/prism/templates/configmap-worker-trust.yaml",
    "sha256": "61d7e98c21c7f9ae69fc7a5bbeec145fff6c8c85123763cb8cdd8fb562c1ebd6"
  },
  {
    "path": "charts/prism/templates/jobs.yaml",
    "sha256": "ed074c7d460591a458e2bfe3967e93ea4632588f460500d2e7965d68324140da"
  },
  {
    "path": "charts/prism/templates/postgresql.yaml",
    "sha256": "e81248bfa623695e0e79f36ddf347ad75a1d7bc449a4250287a96a80e17742c1"
  },
  {
    "path": "charts/prism/templates/backup.yaml",
    "sha256": "8b22353f1a790233a269e462ee52fd72d8fc1faec73885f7fbe5ffddf0e7a406"
  },
  {
    "path": "charts/prism/files/prism-backup.sh",
    "sha256": "6823dff4e65d056a82676d7970474921d55cd9573960a82344f15dd0eeaffece"
  },
  {
    "path": "skills/prism/server/control.ts",
    "sha256": "b99be63fc90f0096a6acfef54c26c86b247ae7b1ad85066df064abca60600cd3"
  }
].map(Object.freeze));
const HISTORICAL_SOURCE_HASHES=Object.freeze({
  "scripts/docs-configuration-inventory.mjs": "6a1e669d9287225ef0c7b9e572326d6cbc71c1eb2f4e460c6237dc5acc1f4831",
  "scripts/docs-runtime-consumer-contracts.mjs": "7cc530f43693188691d2485e5bdef0c57de9307696b957c060ef6356a021dfaa",
  "skills/prism/package.json": "19457da92aed9c48e1bc81e082463bba0e406c662adeaff7699e0c674b45709c"
});
const ARTIFACT_MODEL_HASHES=Object.freeze({
  "docs/generated/inventory/configuration-runtime-inputs.json": "6b9bd1d3f88c5c9270174073462c9424b3232bb6bdf513f2f7c5adbe7394a6e2",
  "docs/generated/inventory/configuration-values.json": "49b45368acc5c44bac6796b97951d026c2b1e37b211c60dda733ad0dfd897338",
  "scripts/docs-local-helm-field-authorities.json": "325d83c936f438bf6729e7f52acaee940344178837d9754babe3b091568d7321"
});
const ENV_IDENTITIES=Object.freeze([
  [
    "PRISM_WORKER_SECRET",
    "skills/prism/config/native-worker.ts"
  ],
  [
    "PRISM_NATIVE_POOL_POLICY_FILE",
    "skills/prism/config/native-worker.ts"
  ],
  [
    "PRISM_PRODUCT_ORIGIN",
    "skills/prism/control/product-decisions.ts"
  ],
  [
    "PRISM_PRODUCT_CONTROLLER_URL",
    "skills/prism/control/product-decisions.ts"
  ],
  [
    "PRISM_PRODUCT_OPERATORS",
    "skills/prism/control/product-decisions.ts"
  ],
  [
    "PRISM_PRODUCT_ISSUER",
    "skills/prism/control/product-decisions.ts"
  ],
  [
    "PRISM_PRODUCT_CONTROLLER_CA_FILE",
    "skills/prism/control/product-decisions.ts"
  ],
  [
    "PRISM_PRODUCT_CONTROLLER_TOKEN_FILE",
    "skills/prism/control/product-decisions.ts"
  ],
  [
    "PRISM_INGRESS_SECRET",
    "skills/prism/server/control-config.ts"
  ],
  [
    "PRISM_INGRESS_SECRET",
    "skills/prism/server/studio-config.ts"
  ],
  [
    "PRISM_DISPATCH_SECRET",
    "skills/prism/server/control-config.ts"
  ]
].map(Object.freeze));
const HELM_IDENTITIES=Object.freeze([
  [
    "charts/prism/values.yaml",
    "$.ingestion.quarantineTtlMs"
  ],
  [
    "charts/prism/values.yaml",
    "$.ingestion.resources.limits.cpu"
  ],
  [
    "charts/prism/values.yaml",
    "$.ingestion.resources.limits.memory"
  ],
  [
    "charts/prism/values.yaml",
    "$.ingestion.resources.requests.cpu"
  ],
  [
    "charts/prism/values.yaml",
    "$.ingestion.resources.requests.memory"
  ],
  [
    "charts/prism/values.yaml",
    "$.worker.native.closeTimeoutMs"
  ],
  [
    "charts/prism/values.yaml",
    "$.worker.shutdownTimeoutMs"
  ],
  [
    "charts/prism/values.yaml",
    "$.worker.terminationGracePeriodSeconds"
  ],
  [
    "charts/prism/values.yaml",
    "$.workerTrust.spiffe.agentServiceAccount"
  ],
  [
    "charts/prism/values.yaml",
    "$.workerTrust.spiffe.csiDriver"
  ],
  [
    "charts/prism/values.yaml",
    "$.workerTrust.spiffe.envoy.pullPolicy"
  ],
  [
    "charts/prism/values.yaml",
    "$.workerTrust.spiffe.novaServiceAccount"
  ],
  [
    "charts/prism/values.yaml",
    "$.workerTrust.spiffe.socketPath"
  ],
  [
    "charts/prism/values.yaml",
    "$.workerTrust.spiffe.trustDomain"
  ],
  [
    "my-values/prism-values.yaml",
    "$.workerTrust.spiffe.agentServiceAccount"
  ],
  [
    "my-values/prism-values.yaml",
    "$.workerTrust.spiffe.trustDomain"
  ]
].map(Object.freeze));
const DB_IDENTITIES=Object.freeze([
  [
    "charts/prism/ci-values.yaml",
    8,
    "$.postgresql.existingSecret",
    "reference",
    "prism-postgresql-auth",
    null,
    null
  ],
  [
    "charts/prism/templates/backup.yaml",
    59,
    "template line 59 secretKeyRef",
    "helm-template-key-reference",
    "<configured prism $.postgresql.existingSecret>",
    "password",
    null
  ],
  [
    "charts/prism/templates/jobs.yaml",
    32,
    "template line 32 secretKeyRef",
    "helm-template-key-reference",
    "prism-postgresql-auth",
    "admin-url",
    null
  ],
  [
    "charts/prism/templates/jobs.yaml",
    36,
    "template line 36 secretKeyRef",
    "helm-template-key-reference",
    "prism-postgresql-auth",
    "migrator-password",
    null
  ],
  [
    "charts/prism/templates/jobs.yaml",
    50,
    "template line 50 secretKeyRef",
    "helm-template-key-reference",
    "prism-postgresql-auth",
    "migrator-url",
    null
  ],
  [
    "charts/prism/templates/jobs.yaml",
    38,
    "template line 38 secretKeyRef",
    "helm-template-key-reference",
    "prism-postgresql-auth",
    "readonly-password",
    null
  ],
  [
    "charts/prism/templates/jobs.yaml",
    34,
    "template line 34 secretKeyRef",
    "helm-template-key-reference",
    "prism-postgresql-auth",
    "runtime-password",
    null
  ],
  [
    "charts/prism/templates/postgresql.yaml",
    50,
    "template line 50 secretKeyRef",
    "helm-template-key-reference",
    "<required Prism PostgreSQL Secret>",
    "migrator-password",
    null
  ],
  [
    "charts/prism/templates/postgresql.yaml",
    46,
    "template line 46 secretKeyRef",
    "helm-template-key-reference",
    "<required Prism PostgreSQL Secret>",
    "password",
    null
  ],
  [
    "charts/prism/templates/postgresql.yaml",
    52,
    "template line 52 secretKeyRef",
    "helm-template-key-reference",
    "<required Prism PostgreSQL Secret>",
    "readonly-password",
    null
  ],
  [
    "charts/prism/templates/postgresql.yaml",
    48,
    "template line 48 secretKeyRef",
    "helm-template-key-reference",
    "<required Prism PostgreSQL Secret>",
    "runtime-password",
    null
  ],
  [
    "charts/prism/templates/workloads.yaml",
    102,
    "template line 102 secretKeyRef",
    "helm-template-key-reference",
    "prism-postgresql-auth",
    "runtime-url",
    null
  ],
  [
    "charts/prism/templates/workloads.yaml",
    125,
    "template line 125 secretKeyRef",
    "helm-template-key-reference",
    "prism-postgresql-auth",
    "runtime-url",
    null
  ],
  [
    "my-values/prism-values.yaml",
    30,
    "$.postgresql.existingSecret",
    "reference",
    "prism-postgresql-auth",
    null,
    null
  ],
  [
    "scripts/deploy.sh",
    1646,
    "<shell function cmd_prism_secrets>",
    "declared-keys-in-script",
    "prism-postgresql-auth",
    null,
    [
      "admin-url",
      "migrator-password",
      "migrator-url",
      "password",
      "readonly-password",
      "readonly-url",
      "runtime-password",
      "runtime-url"
    ]
  ]
].map(Object.freeze));
const HISTORICAL_DB_AUTHORITY="Prism migration, control, studio, ingestion, and read-only paths read the role-specific passwords or URLs selected by their workload bindings.";
const sha256=value=>createHash('sha256').update(value).digest('hex');
const ordered=value=>Array.isArray(value)?value.map(ordered):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,ordered(value[key])])):value;
const same=(left,right,label)=>assert.deepEqual(ordered(left),ordered(right),label);
const digest=value=>sha256(JSON.stringify(ordered(value)));
const ptr=value=>String(value).replaceAll('~','~0').replaceAll('/','~1');
const identityKey=value=>JSON.stringify(value);
const dbIdentity=fact=>['path','line','fieldPath','kind','name','key','keys'].map(key=>fact[key]??null);
const ENV_SEMANTIC_KEYS=Object.freeze(['purpose','acceptedForm','defaultBehavior','emptyBehavior','invalidBehavior','precedence','impact','failure','required']);
const ENV_AGGREGATE_KEYS=Object.freeze(['meaningStatus','meaning','meaningEvidence','acceptedForm','required','defaultBehavior','emptyBehavior','invalidBehavior','precedenceExplanation','changeImpact','failureMeaning','blockerOwner','closureCondition']);
const HELM_MEANING_KEYS=Object.freeze(['text','acceptedValues','emptyBehavior']);
function unique(items,predicate,label){const matches=items.map((value,index)=>({value,index})).filter(({value})=>predicate(value));assert.equal(matches.length,1,label);return matches[0];}
function locateField(values,sourcePath,fieldPath){
 const {value:file,index:fi}=unique(values.files,file=>file.path===sourcePath,'PRISM_HELM_SOURCE_MISSING_OR_AMBIGUOUS');
 const matches=[];for(const [di,document] of file.documents.entries())for(const [xi,field] of document.fields.entries())if(field.path===fieldPath)matches.push({file,document,field,fi,di,xi});
 assert.equal(matches.length,1,'PRISM_HELM_FIELD_MISSING_OR_AMBIGUOUS');return matches[0];
}
function purpose(raw,tuple){return environmentConsumerPurpose({...raw,owner:tuple.owner,owningSurface:tuple.owningSurface,boundary:tuple.boundary});}
function assertOldTuple(raw,tuple,path){
 // The original native caller supplies these metadata defaults only for fallback declarations.
 same(tuple.owner,raw.owner??'@kubeclaw/prism','PRISM_HISTORICAL_ENV_OWNER_DRIFT');
 same(tuple.owningSurface,raw.owningSurface??`The receiving setting or command in ${path}; see the exact source and its producer bindings.`,'PRISM_HISTORICAL_ENV_SETTING_DRIFT');
 same(tuple.boundary,raw.boundary??'checked-in receiving source','PRISM_HISTORICAL_ENV_BOUNDARY_DRIFT');
 for(const key of ENV_SEMANTIC_KEYS) same(tuple[key],key==='purpose'?purpose(raw,tuple):raw[key],`PRISM_HISTORICAL_ENV_MODEL_DRIFT:${key}`);
 if(Object.hasOwn(raw,'evidence'))same(tuple.evidence,raw.evidence,'PRISM_HISTORICAL_ENV_EVIDENCE_DRIFT');
}
function authorityFor(registry,located){
 const declaration=registry.files[located.file.path];const registered=declaration?.fields?.[located.field.path];
 assert(registered&&declaration.chartRoot==='charts/prism','PRISM_HISTORICAL_HELM_AUTHORITY_MISSING');
 return {...registered,chartRoot:declaration.chartRoot,sourceFileSha256:declaration.sourceSha256,semanticAuthorityEvidence:located.field.meaning.semanticAuthorityEvidence,semanticContractEvidence:located.field.meaning.semanticContractEvidence};
}
function helmMeaning(located,authority){return formatLocalHelmMeaning({context:{sourcePath:located.file.path,sourceClass:located.file.sourceClass,fieldLine:located.field.sourceLine},authority,semantics:located.field});}
function helmConstraints(field,authority){return [...new Set([...field.consumers.flatMap(consumer=>consumer.constraints??[]),authority.acceptedValues,`empty/omitted: ${authority.emptyBehavior}`])];}
function normalizedSources(sources){
 const result=[],seen=new Set();for(const source of sources){assert(source&&typeof source.path==='string'&&Number.isInteger(source.line)&&source.line>=1,'PRISM_MEANING_SOURCE_INVALID');const item={path:source.path,line:source.line,endLine:source.endLine??source.line};assert(item.endLine>=item.line&&item.endLine-item.line<60,'PRISM_MEANING_SOURCE_RANGE_INVALID');assert(PRISM_SEMANTIC_RECEIVERS.some(receiver=>receiver.path===item.path),'PRISM_MEANING_SOURCE_NOT_REVIEWED');const key=JSON.stringify(item);if(!seen.has(key)){seen.add(key);result.push(item);}}
 return result;
}
/** Input must be the exact complete native-v1 projection of authenticated145 data.
 * Source readers retain source6fa; current semantic receivers are separately
 * authenticated by the native bundle owner against PRISM_SEMANTIC_RECEIVERS.
 * This module never reads current sources, executes input source, or grants
 * producer/API roles. Historical observations/evidence remain unchanged.
 */
export function projectRetainedPrismSemantics({runtimeInputs,configurationValues,historicalOwners,readSourceText,readArtifactJson}){
 assert.equal(typeof readSourceText,'function');assert.equal(typeof readArtifactJson,'function');
 for(const [path,hash] of Object.entries(HISTORICAL_SOURCE_HASHES)){const text=readSourceText(path);assert.equal(typeof text,'string');assert.equal(sha256(text),hash,`PRISM_HISTORICAL_SOURCE_GRAMMAR_DRIFT:${path}`);}
 assert.equal(JSON.parse(readSourceText('skills/prism/package.json')).name,'@kubeclaw/prism','PRISM_HISTORICAL_COMPONENT_OWNER_DRIFT');
 const loaded={};for(const path of PRISM_HISTORICAL_ARTIFACT_FILES){loaded[path]=readArtifactJson(path);assert.equal(digest(loaded[path]),ARTIFACT_MODEL_HASHES[path],`PRISM_HISTORICAL_ARTIFACT_MODEL_DRIFT:${path}`);}
 const baselineRuntime=loaded[PRISM_HISTORICAL_ARTIFACT_FILES[0]],baselineValues=loaded[PRISM_HISTORICAL_ARTIFACT_FILES[1]],registry=loaded[PRISM_HISTORICAL_ARTIFACT_FILES[2]];
 assert.equal(historicalOwners.sourceRevision,'6fa4830a48244d29655104a5be58957d5fa87d2f','PRISM_HISTORICAL_SOURCE_REVISION_DRIFT');
 assert.equal(historicalOwners.artifactRevision,'145da1d0b30fb3b636c4b03fb3d3252819ee2bf5','PRISM_HISTORICAL_ARTIFACT_REVISION_DRIFT');
 same(historicalOwners.registry,registry,'PRISM_HISTORICAL_OWNER_REGISTRY_DRIFT');
 const reconstructedOwners=buildHistoricalOwners({runtimeInputs:baselineRuntime,configurationValues:baselineValues,readSourceText,readArtifactJson});
 same(historicalOwners,reconstructedOwners,'PRISM_COMPLETE_HISTORICAL_OWNERS_DRIFT');
 const v1=projectRetainedInventoryLanguage({runtimeInputs:baselineRuntime,configurationValues:baselineValues,historicalOwners:reconstructedOwners});
 same(runtimeInputs,v1.runtimeInputs,'PRISM_COMPLETE_V1_RUNTIME_INPUT_DRIFT');same(configurationValues,v1.configurationValues,'PRISM_COMPLETE_V1_VALUES_INPUT_DRIFT');
 const runtime=structuredClone(runtimeInputs),values=structuredClone(configurationValues),changes=[],meaningEvidence={environment:[],helm:[],secrets:[]};
 const set=(target,key,newValue,inventory,jsonPointer,owner)=>{if(JSON.stringify(target[key])===JSON.stringify(newValue))return;assert(Object.hasOwn(target,key),'PRISM_SEMANTIC_PROPERTY_ADDITION_REFUSED');assert.equal(typeof newValue,'string','PRISM_NONSTRING_SEMANTIC_WRITE_REFUSED');changes.push({inventory,jsonPointer:`${jsonPointer}/${ptr(key)}`,owner,oldValue:structuredClone(target[key]),newValue:structuredClone(newValue)});target[key]=structuredClone(newValue);};
 const declarations=historicalPrismEnvironmentDeclarations();same(declarations.map(({name,path})=>[name,path]).sort(),ENV_IDENTITIES.map(tuple=>[...tuple]).sort(),'PRISM_HISTORICAL_ENV_DECLARATION_SET_DRIFT');
 const affectedEntries=new Set();
 for(const [name,path] of ENV_IDENTITIES){
  const {value:entry,index:ei}=unique(runtime.environment,entry=>entry.name===name,'PRISM_ENV_ENTRY_MISSING_OR_AMBIGUOUS');
  const baseline=unique(baselineRuntime.environment,entry=>entry.name===name,'PRISM_OLD_ENV_ENTRY_MISSING_OR_AMBIGUOUS').value;
  const {value:tuple,index:ci}=unique(entry.consumerContracts,tuple=>tuple.path===path,'PRISM_ENV_TUPLE_MISSING_OR_AMBIGUOUS');
  const oldTuple=unique(baseline.consumerContracts,tuple=>tuple.path===path,'PRISM_OLD_ENV_TUPLE_MISSING_OR_AMBIGUOUS').value;
  same(tuple,oldTuple,'PRISM_COMPLETE_OLD_ENV_TUPLE_DRIFT');
  const oldRaw=unique(declarations,declaration=>declaration.name===name&&declaration.path===path,'PRISM_ENV_OLD_OWNER_MISSING_OR_AMBIGUOUS').value.raw;
  assertOldTuple(oldRaw,oldTuple,path);
  const raw=runtimeConsumerContract(name,path);assert(raw,'PRISM_CURRENT_ENV_OWNER_MISSING');
  for(const key of ENV_SEMANTIC_KEYS){assert.equal(typeof raw[key],'string',`PRISM_CURRENT_ENV_OWNER_PROPERTY_MISSING:${key}`);set(tuple,key,key==='purpose'?purpose(raw,tuple):raw[key],'runtimeInputs',`/environment/${ei}/consumerContracts/${ci}`,`PrismENV:${name}:${path}`);}
  meaningEvidence.environment.push({name,path,sources:normalizedSources(raw.evidence??[])});assert(meaningEvidence.environment.at(-1).sources.length,'PRISM_CURRENT_ENV_EVIDENCE_MISSING');
  affectedEntries.add(ei);
 }
 for(const ei of affectedEntries){
  const entry=runtime.environment[ei],baseline=unique(baselineRuntime.environment,old=>old.name===entry.name,'PRISM_OLD_AGGREGATE_MISSING').value;
  const oldAggregate=formatEnvironmentAggregate(baseline,{contract:null});
  for(const key of ENV_AGGREGATE_KEYS)same(oldAggregate[key],baseline[key],`PRISM_OLD_ENV_AGGREGATE_MODEL_DRIFT:${key}`);
  const next=formatEnvironmentAggregate(entry,{contract:null});
  for(const key of ENV_AGGREGATE_KEYS){
   // Classification, source coordinates and blocker state are historical facts,
   // not an authorization to repair unrelated status/custody in this datatype.
   if(['meaningStatus','meaningEvidence','blockerOwner','closureCondition'].includes(key)){same(next[key],entry[key],`PRISM_ENV_NONSEMANTIC_AGGREGATE_DRIFT:${key}`);continue;}
   set(entry,key,next[key],'runtimeInputs',`/environment/${ei}`,`PrismENV-aggregate:${entry.name}`);
  }
 }
 for(const [sourcePath,path] of HELM_IDENTITIES){
  const old=locateField(baselineValues,sourcePath,path),located=locateField(values,sourcePath,path);same(located.field,old.field,'PRISM_COMPLETE_OLD_HELM_FIELD_DRIFT');
  const authority=authorityFor(registry,old),modeled=helmMeaning(old,authority),oldMeaning={};for(const key of Object.keys(modeled))oldMeaning[key]=old.field.meaning[key];same(modeled,oldMeaning,'PRISM_OLD_HELM_WHOLE_MEANING_MODEL_DRIFT');
  same(old.field.constraints,helmConstraints(old.field,authority),'PRISM_OLD_HELM_CONSTRAINTS_MODEL_DRIFT');same(old.field.changeImpact,authority.impact,'PRISM_OLD_HELM_IMPACT_MODEL_DRIFT');same(old.field.failureMeaning,authority.failure,'PRISM_OLD_HELM_FAILURE_MODEL_DRIFT');
  const correction=prismHelmScalarCorrection({sourcePath,path});assert(correction,'PRISM_CURRENT_HELM_OWNER_MISSING');for(const key of Object.keys(correction))assert(['purpose','acceptedValues','emptyBehavior','impact','failure'].includes(key),'PRISM_HELM_UNAUTHORIZED_OWNER_PROPERTY');
  const nextAuthority={...authority,...correction},next=helmMeaning(old,nextAuthority);const base=`/files/${located.fi}/documents/${located.di}/fields/${located.xi}`;
  for(const key of HELM_MEANING_KEYS)set(located.field.meaning,key,next[key],'configurationValues',base+'/meaning',`PrismHelm:${sourcePath}#${path}`);
  const nextConstraints=helmConstraints(old.field,nextAuthority);assert.equal(nextConstraints.length,located.field.constraints.length,'PRISM_HELM_CONSTRAINT_STRUCTURE_DRIFT');
  for(const [index,constraint] of nextConstraints.entries())set(located.field.constraints,index,constraint,'configurationValues',base+'/constraints',`PrismHelm:${sourcePath}#${path}`);
  set(located.field,'changeImpact',nextAuthority.impact,'configurationValues',base,`PrismHelm:${sourcePath}#${path}`);set(located.field,'failureMeaning',nextAuthority.failure,'configurationValues',base,`PrismHelm:${sourcePath}#${path}`);
  const schemaRange=path==='$.ingestion.quarantineTtlMs'?[334,338]:path.startsWith('$.ingestion.resources.')?[349,376]:path.startsWith('$.workerTrust.spiffe.')?[393,440]:[280,317];
  const sources=[{path:'charts/prism/values.schema.json',line:schemaRange[0],endLine:schemaRange[1]},...old.field.consumers.map(consumer=>({path:consumer.path,line:consumer.line,endLine:consumer.line}))];
  if(path.startsWith('$.ingestion.resources.'))sources.push({path:'charts/prism/values.schema.json',line:30,endLine:58});
  if(path==='$.workerTrust.spiffe.envoy.pullPolicy')sources.push({path:'charts/prism/values.schema.json',line:440,endLine:472});
  if(path==='$.ingestion.quarantineTtlMs')sources.push({path:'skills/prism/server/ingestion.ts',line:14,endLine:20},{path:'skills/prism/server/ingestion.ts',line:74,endLine:79});
  if(path.startsWith('$.worker.')&&!path.startsWith('$.workerTrust'))sources.push({path:'skills/prism/server/worker-lifecycle.ts',line:66,endLine:105},{path:'skills/prism/server/worker-config.ts',line:32,endLine:38},{path:'skills/worker/core/worker/native-worker-process.ts',line:86,endLine:113});
  meaningEvidence.helm.push({sourcePath,path,sources:normalizedSources(sources)});
 }
 const dbAuthority=prismPostgresqlSecretConsumerAuthority();assert.equal(typeof dbAuthority,'string');assert.notEqual(dbAuthority,HISTORICAL_DB_AUTHORITY,'PRISM_CURRENT_DB_OWNER_NOT_CORRECTED');
 const dbSources=normalizedSources([
  {
    "path": "charts/prism/templates/postgresql.yaml",
    "line": 1,
    "endLine": 20
  },
  {
    "path": "charts/prism/templates/postgresql.yaml",
    "line": 38,
    "endLine": 61
  },
  {
    "path": "charts/prism/templates/jobs.yaml",
    "line": 26,
    "endLine": 52
  },
  {
    "path": "skills/prism/config/database-bootstrap.ts",
    "line": 1,
    "endLine": 11
  },
  {
    "path": "skills/prism/server/bootstrap-database.ts",
    "line": 1,
    "endLine": 20
  },
  {
    "path": "skills/prism/server/database-roles.ts",
    "line": 8,
    "endLine": 58
  },
  {
    "path": "skills/prism/server/migrate.ts",
    "line": 1,
    "endLine": 8
  },
  {
    "path": "charts/prism/templates/workloads.yaml",
    "line": 100,
    "endLine": 125
  },
  {
    "path": "skills/prism/server/control-config.ts",
    "line": 58,
    "endLine": 61
  },
  {
    "path": "skills/prism/server/control.ts",
    "line": 1,
    "endLine": 9
  },
  {
    "path": "skills/prism/server/worker.ts",
    "line": 16,
    "endLine": 27
  },
  {
    "path": "skills/prism/server/worker-config.ts",
    "line": 3,
    "endLine": 14
  },
  {
    "path": "skills/prism/server/worker-readiness.ts",
    "line": 36,
    "endLine": 50
  },
  {
    "path": "charts/prism/templates/backup.yaml",
    "line": 60,
    "endLine": 70
  },
  {
    "path": "charts/prism/files/prism-backup.sh",
    "line": 86,
    "endLine": 106
  },
  {
    "path": "charts/prism/files/prism-backup.sh",
    "line": 150,
    "endLine": 175
  },
  {
    "path": "skills/prism/server/studio-config.ts",
    "line": 1,
    "endLine": 18
  },
  {
    "path": "skills/prism/server/ingestion.ts",
    "line": 1,
    "endLine": 60
  },
  {
    "path": "skills/prism/server/ingestion.ts",
    "line": 61,
    "endLine": 97
  }
]);
 const expectedDb=new Set(DB_IDENTITIES.map(identityKey));assert.equal(expectedDb.size,15,'PRISM_DB_IDENTITY_SET_AMBIGUOUS');
 const selected=runtime.secrets.filter(fact=>expectedDb.has(identityKey(dbIdentity(fact))));assert.equal(selected.length,15,'PRISM_DB_FACT_MISSING_OR_AMBIGUOUS');
 for(const identity of DB_IDENTITIES){
  const {value:fact,index}=unique(runtime.secrets,fact=>identityKey(dbIdentity(fact))===identityKey(identity),'PRISM_DB_FACT_MISSING_OR_AMBIGUOUS');
  const old=unique(baselineRuntime.secrets,fact=>identityKey(dbIdentity(fact))===identityKey(identity),'PRISM_OLD_DB_FACT_MISSING_OR_AMBIGUOUS').value;same(fact,old,'PRISM_COMPLETE_OLD_DB_FACT_DRIFT');same(old.consumerAuthority,HISTORICAL_DB_AUTHORITY,'PRISM_OLD_DB_AUTHORITY_MODEL_DRIFT');
  set(fact,'consumerAuthority',dbAuthority,'runtimeInputs',`/secrets/${index}`,'PrismPostgresqlSecretConsumerAuthority');meaningEvidence.secrets.push({identity:{path:fact.path,fieldPath:fact.fieldPath??null,kind:fact.kind,name:fact.name,key:fact.key??null,keys:fact.keys??null},sources:dbSources});
 }
 const restoredRuntime=structuredClone(runtime),restoredValues=structuredClone(values);
 for(const change of [...changes].reverse()){
  const parts=change.jsonPointer.slice(1).split('/').map(value=>value.replaceAll('~1','/').replaceAll('~0','~'));const key=parts.pop();let target=change.inventory==='runtimeInputs'?restoredRuntime:restoredValues;for(const part of parts)target=target[part];target[key]=structuredClone(change.oldValue);
 }
 same(restoredRuntime,runtimeInputs,'PRISM_NONSEMANTIC_RUNTIME_DRIFT');same(restoredValues,configurationValues,'PRISM_NONSEMANTIC_VALUES_DRIFT');same(restoredRuntime.secrets,runtimeInputs.secrets,'PRISM_ALL123_SECRET_REVERSE_DRIFT');
 assert.equal(runtime.environment.length,435,'PRISM_ENV_NAME_COUNT_DRIFT');assert.equal(runtime.secrets.length,123,'PRISM_SECRET_COUNT_DRIFT');assert.equal(values.files.flatMap(file=>file.documents.flatMap(document=>document.fields)).length,3913,'PRISM_HELM_FIELD_COUNT_DRIFT');
 return {runtimeInputs:runtime,configurationValues:values,changes,preservation:{allNonSemanticPointersEqual:true,all123SecretFactsReverseEqual:true,environmentTuples:11,helmFieldIdentities:16,secretFacts:15,environmentNames:435,helmFields:3913,notCurrentAcquisition:true,currentProducerQualification:false,currentApiRole:false},meaningEvidence};
}
