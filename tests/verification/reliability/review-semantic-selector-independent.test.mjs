// Independent admission checks only: no Core lifecycle or provider success claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {canonicalJson, sha256Text} from '@kubeclaw/plugin-sdk';
import {parseReviewBundle} from '../../../skills/nova/plugins/review/src/review-bundle-parser.ts';
import {snapshotReviewBundle, isReviewBundleSnapshot} from '../../../skills/nova/plugins/review/src/review-bundle-snapshot.ts';
import {isReviewReport} from '../../../skills/nova/plugins/review/src/review-report-contract.ts';
import {makeReviewGovernor} from '../../../skills/nova/plugins/review/tests/fixtures/review-governor.mjs';
import {buildReviewReport} from '../../../skills/nova/plugins/review/src/review-report-builder.ts';
import {resolveReviewPolicy} from '../../../skills/nova/plugins/review/src/review-policy-resolver.ts';
import {getReviewPolicyProfile} from '../../../skills/nova/plugins/review/src/review-policy-profiles.ts';

const historical=JSON.parse(fs.readFileSync(new URL('../../../skills/nova/plugins/review/tests/fixtures/legacy-evidence-encoding.json',import.meta.url),'utf8')).original;
const digest=`sha256:${'a'.repeat(64)}`;
const report={schemaVersion:'review-report.v2',attemptId:'attempt-1',taskId:'TASK-1',profile:'lean',
  policyDigest:digest,bundleDigest:digest,revision:{base:'1'.repeat(40),head:'2'.repeat(40),changedManifestDigest:digest},
  governor:makeReviewGovernor(digest),outcome:'passed',omitted:{blocker:0,advisory:0,follow_up:0,ignored:0},items:{}};

function trapped(value) {
  let calls=0;
  return {value:new Proxy(value,{
    get(target,key,receiver){calls++;return Reflect.get(target,key,receiver);},
    ownKeys(target){calls++;return Reflect.ownKeys(target);},
    getOwnPropertyDescriptor(target,key){calls++;return Reflect.getOwnPropertyDescriptor(target,key);},
    getPrototypeOf(target){calls++;return Reflect.getPrototypeOf(target);},
  }),calls:()=>calls};
}
function getter(value,field) {
  const copied=structuredClone(value),original=copied[field];let calls=0;
  Object.defineProperty(copied,field,{enumerable:true,configurable:true,get(){calls++;return original;}});
  return {value:copied,calls:()=>calls};
}
function outcome(fn,value) {try{return fn(value);}catch(error){return {rejectedByException:error.message};}}

test('independent original archived bundle and original report shape retain accepted legacy bytes',()=>{
  assert.equal(Intl.DateTimeFormat().resolvedOptions().locale,historical.locale,'run this legacy byte gate in its original locale');
  const bundle=structuredClone(historical.snapshot.bundle),before=canonicalJson(bundle);
  const parsed=parseReviewBundle(bundle);assert.equal(parsed.ok,true,JSON.stringify(parsed));
  const snapshot=snapshotReviewBundle(bundle);assert.equal(isReviewBundleSnapshot(snapshot),true);
  assert.equal(snapshot.digest,historical.snapshot.digest);assert.equal(snapshot.digest,sha256Text(canonicalJson(snapshot.bundle)));
  assert.equal(canonicalJson(bundle),before);assert.equal(isReviewReport(report),true);
});

for(const owner of ['bundle','report'])for(const kind of ['proxy','schemaGetter','nestedProxy']) {
  test(`independent ${owner} ${kind} admission rejects before every trap`,()=>{
    const original=owner==='bundle'?historical.snapshot.bundle:report;
    const value=structuredClone(original);let input;
    if(kind==='proxy')input=trapped(value);
    else if(kind==='schemaGetter')input=getter(value,'schemaVersion');
    else {
      const nested=trapped(owner==='bundle'?value.revisions:value.governor);
      if(owner==='bundle')value.revisions=nested.value;else value.governor=nested.value;
      input={value,calls:nested.calls};
    }
    const result=outcome(owner==='bundle'?parseReviewBundle:isReviewReport,input.value);
    assert.equal(input.calls(),0,`${owner}/${kind} executed ${input.calls()} trap(s)`);
    if(owner==='bundle')assert.equal(result.ok,false,JSON.stringify(result));
    else assert.equal(result,false,JSON.stringify(result));
  });
}

function originalReportInput() {
  const policy=resolveReviewPolicy({builtIn:getReviewPolicyProfile('gate')});
  const snapshot=snapshotReviewBundle({...structuredClone(historical.snapshot.bundle),policyDigest:policy.digest});
  return {attemptId:'attempt-original-builder',snapshot,policy,parsed:{ok:false,error:'not needed'},
    result:{schemaVersion:'stage-result.v2',outcome:'passed',artifacts:[]},findings:[],
    governor:makeReviewGovernor(snapshot.bundle.revisions.changedManifestDigest,'within_scope',policy.digest)};
}

test('independent actual owned legacy snapshot remains accepted by original report builder',()=>{
  const input=originalReportInput();
  assert.equal(isReviewBundleSnapshot(input.snapshot),true);
  const value=buildReviewReport(input);
  assert.equal(value.schemaVersion,'review-report.v2');assert.equal(isReviewReport(value),true);
});
for(const kind of ['proxy','schemaGetter','unknownVersion']) {
  test(`independent report builder ${kind} must not silently select legacy semantics`,()=>{
    const input=originalReportInput();
    const copied=structuredClone(input.snapshot.bundle);
    const selected=kind==='proxy'?trapped(copied):kind==='schemaGetter'?getter(copied,'schemaVersion'):
      {value:{...copied,schemaVersion:'review-bundle.future'},calls:()=>0};
    const candidate={...input,snapshot:{...input.snapshot,bundle:selected.value}};
    let rejected=false;let returned;
    try{returned=buildReviewReport(candidate);}catch{rejected=true;}
    assert.equal(selected.calls(),0,`${kind} executed ${selected.calls()} trap(s)`);
    assert.equal(rejected,true,`unsupported owner produced ${returned?.schemaVersion}`);
  });
}
