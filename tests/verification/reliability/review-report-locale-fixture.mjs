import assert from 'node:assert/strict';
import fs from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import {canonicalJson,sha256Text} from '@kubeclaw/plugin-sdk';
import {buildReviewReport} from '../../../skills/nova/plugins/review/src/review-report-builder.ts';
import {isReviewReport} from '../../../skills/nova/plugins/review/src/review-report-contract.ts';
import {snapshotReviewBundle} from '../../../skills/nova/plugins/review/src/review-bundle-snapshot.ts';
import {resolveReviewPolicy} from '../../../skills/nova/plugins/review/src/review-policy-resolver.ts';
import {getReviewPolicyProfile} from '../../../skills/nova/plugins/review/src/review-policy-profiles.ts';
import {makeReviewGovernor} from '../../../skills/nova/plugins/review/tests/fixtures/review-governor.mjs';
import {coverageReviewPrefixes,coverageReviewRequirements} from '@kubeclaw/pipeline-test-gate-contract';

// Actual original builder, strict report admission, storage producer, Core and
// ArtifactStore. Findings/governor are typed admission fixtures, not independently
// confirmed real project defects; no whole Review stage/provider claim.
const digest=`sha256:${'a'.repeat(64)}`;
export function reportFixture(coverage) {
  const policy=resolveReviewPolicy({builtIn:getReviewPolicyProfile('gate')});
  const changedPaths=[{path:'src/a.ts',status:'modified'}];
  const snapshot=snapshotReviewBundle({schemaVersion:'review-bundle.v1',task:{id:'TASK-1',statement:'Review.'},
    revisions:{base:coverage?.baseRevision??'1'.repeat(40),head:'2'.repeat(40),changedManifestDigest:sha256Text(canonicalJson(changedPaths))},
    scope:{allowedPrefixes:coverage?coverageReviewPrefixes(coverage):['src'],changedPaths},requirements:coverage?coverageReviewRequirements(coverage):[{id:'REQ-1',statement:'Works.'}],
    evidence:coverage?[{kind:'gate-coverage',digest:sha256Text(canonicalJson(coverage)),content:canonicalJson(coverage)}]:[{kind:'test',digest:sha256Text('{}'),content:'{}'}],
    context:[{path:'src/a.ts',content:'x\n',digest:sha256Text('x\n'),reasons:[{kind:'changed'}]}],
    selection:{version:'focused-context.v1',candidateManifestDigest:digest,expansionRound:0},policyDigest:policy.digest});
  const selected=new Map();
  for(let i=0;selected.size<2&&i<100000;i++){
    const fingerprint=sha256Text(`accepted finding fixture ${i}`);
    const id=sha256Text(canonicalJson({version:'review-report-item.v1',origin:'verified_finding',sourceId:fingerprint}));
    const prefix=id.slice(7,9);
    if(['aa','af'].includes(prefix)&&!selected.has(prefix))selected.set(prefix,fingerprint);
  }
  assert.equal(selected.size,2);
  const findings=[...selected.values()].map(fingerprint=>Object.freeze({fingerprint,category:'correctness',priority:coverage?'P3':'P0',
    message:'Admitted fixture.',recommendedFix:'Inspect the fixture.',changeRelation:'introduced',scopeRelation:'inside',
    evidenceStrength:'direct',repairable:true,verified:true}));
  const value=buildReviewReport({attemptId:'attempt-hex',snapshot,policy,parsed:{ok:false,error:'not needed'},
    result:{schemaVersion:'stage-result.v2',outcome:coverage?'passed':'request_fix',reason:{code:'fixture',message:'Typed report fixture.'},artifacts:[]},
    findings,governor:makeReviewGovernor(snapshot.bundle.revisions.changedManifestDigest,'within_scope',policy.digest)});
  assert.equal(isReviewReport(value),true);
  const schema=JSON.parse(fs.readFileSync(new URL('../../../skills/nova/plugins/review/schemas/review-report.v2.schema.json',import.meta.url),'utf8'));
  const validate=new Ajv2020({strict:true}).compile(schema);
  assert.equal(validate(value),true,JSON.stringify(validate.errors));
  assert.deepEqual(Object.keys(value.items).map(x=>x.slice(7,9)).sort(),['aa','af']);
  return {value,snapshot};
}
export function report(){return reportFixture().value;}
