import fs from 'node:fs';import vm from 'node:vm';import Ajv2020 from 'ajv/dist/2020.js';import addFormats from 'ajv-formats';
const base='docs/review/evidence/config-acceptance/c0-completion-20261013/runtime-provider-contracts-02';
const output='docs/review/evidence/config-acceptance/c0-completion-20261013/independent-runtime-provider-contract-review-02';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const ajv=new Ajv2020({strict:true,allowUnionTypes:true,allErrors:true,useDefaults:false,coerceTypes:false,removeAdditional:false});addFormats(ajv);
const owners={},observations=[];
for(const pkg of ['api-flow','http','openapi','network-http']){
 const id='kubeclaw.'+pkg,owner=read(`${base}/config/plugins/${id}.config.json`),schema=read(`${base}/schemas/${id}.schema.json`),validate=ajv.compile(schema);owners[id]=owner;
 for(const [profile,body]of Object.entries(owner.profiles)){
  const p=body.processing;observations.push({check:'every-profile-default-ceiling-relation',packageId:id,profile,default:p.requestTimeoutMs??null,ceiling:p.maximumRequestTimeoutMs??null,admittedByOwnerSchema:validate(owner),semanticRelation:p.maximumRequestTimeoutMs===undefined?null:p.requestTimeoutMs<=p.maximumRequestTimeoutMs});
 }
 if(pkg==='network-http')continue;
 const override=ajv.compile(read(`${base}/schemas/${id}.evidence-override.schema.json`));
 for(const outcome of ['onPass','onFail','onError'])for(const mutation of ['empty','missing-log','unproduced-error-report','duplicate']){
  const body=structuredClone(owner);let list=[...body.profiles.A.declarations.evidenceDefaults[outcome]];
  if(mutation==='empty')list=[];if(mutation==='missing-log')list=list.filter(x=>x!=='log');if(mutation==='unproduced-error-report')list=['log','test-report','screenshot'];if(mutation==='duplicate')list.push('log');
  body.profiles.A.declarations.evidenceDefaults[outcome]=list;
  observations.push({check:'mandatory-baseline-specific-negative',packageId:id,outcome,mutation,ownerRejected:!validate(body),nodeOverrideRejected:!override({[outcome]:list})});
 }
 observations.push({check:'partial-override-absent-keeps-selected-baseline',packageId:id,accepted:override({})});
}
// Reuse the author's exact finite proposed tuple relation predicate, read-only and isolated.
const checker=fs.readFileSync(`${base}/check-corrections.mjs`,'utf8');const start=checker.indexOf('function selectionErrors('),end=checker.indexOf("record('selected-tuple-relations'",start);if(start<0||end<0)throw Error('tuple predicate source span missing');
const context=vm.createContext({owners,baselines:read(`${base}/mandatory-outcome-evidence.json`).baselines});vm.runInContext(checker.slice(start,end)+'\nthis.predicate=selectionErrors;',context);
const root=read(`${base}/config/pipeline.config.json`);
for(const [id,owner]of Object.entries(owners))for(const profile of Object.keys(owner.profiles)){
 const candidate=structuredClone(root);candidate.pluginSelections.find(x=>x.packageId===id).profileId=profile;observations.push({check:'every-supported-profile-selected-root-relation',packageId:id,profile,errors:context.predicate(candidate)});
}
for(const file of fs.readdirSync(`${base}/fixtures/entries`).filter(x=>x.endsWith('.json'))){observations.push({check:'every-authored-whole-entry-selected-relation',file,errors:context.predicate(read(`${base}/fixtures/entries/${file}`))});}
const current=new Ajv2020({strict:true,allowUnionTypes:true,useDefaults:true,allErrors:true});addFormats(current);const cv=current.compile(read('skills/buster/plugins/api-flow/schemas/config.schema.json'));
const invalidRoot={flowFile:'flow-one.json',requestTimeoutMs:0},omittedRoot={flowFile:'flow-one.json'};
observations.push({check:'actual-current-schema-default-injection-and-invalid-root',invalidRootRejected:!cv(invalidRoot),omittedRootAccepted:cv(omittedRoot),resolvedOmittedRoot:omittedRoot});
const ownFlow=ajv.compile(read(`${base}/schemas/api-flow.target-task-file.schema.json`));for(const value of [1,50,500,300000,0,300001]){const task=read(`${base}/task-fixtures/repository/flow-deadline-A.json`);task.steps[0].timeoutMs=value;observations.push({check:'task-deadline-real-domain',value,accepted:ownFlow(task)});}
fs.writeFileSync(`${output}/additional-probe-observations.json`,JSON.stringify({qualification:'Specific independent schema/default/finite authored-predicate probes only; no provider execute/native constructor/adapter activation/network/timer/API/credentials/Eval',node:process.version,observations},null,2)+'\n');
console.log(JSON.stringify({checks:observations.length,invalidDeclaredProfiles:observations.filter(x=>x.check==='every-profile-default-ceiling-relation'&&x.semanticRelation===false),invalidSelectedProfiles:observations.filter(x=>x.check==='every-supported-profile-selected-root-relation'&&x.errors.length),otherSchemaNegativeFailures:observations.filter(x=>x.check==='mandatory-baseline-specific-negative'&&(!x.ownerRejected||!x.nodeOverrideRejected))}));
