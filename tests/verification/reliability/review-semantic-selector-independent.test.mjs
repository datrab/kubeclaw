// Independent admission checks only: no Core lifecycle or provider success claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {canonicalJson, sha256Text} from '@kubeclaw/plugin-sdk';
import {parseReviewBundle} from '../../../skills/nova/plugins/review/src/review-bundle-parser.ts';
import {snapshotReviewBundle, isReviewBundleSnapshot} from '../../../skills/nova/plugins/review/src/review-bundle-snapshot.ts';
import {isReviewReport} from '../../../skills/nova/plugins/review/src/review-report-contract.ts';
import {makeReviewGovernor} from '../../../skills/nova/plugins/review/tests/fixtures/review-governor.mjs';

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
