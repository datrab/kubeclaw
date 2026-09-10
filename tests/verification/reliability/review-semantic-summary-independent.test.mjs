// Direct cross-owner version mapping only; no Core, storage or model acceptance claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import {canonicalJson,portableJson,sha256Text} from '@kubeclaw/plugin-sdk';
import {snapshotReviewBundle} from '../../../skills/nova/plugins/review/src/review-bundle-snapshot.ts';
import {buildReviewReport} from '../../../skills/nova/plugins/review/src/review-report-builder.ts';
import {resolveReviewPolicy} from '../../../skills/nova/plugins/review/src/review-policy-resolver.ts';
import {getReviewPolicyProfile} from '../../../skills/nova/plugins/review/src/review-policy-profiles.ts';
import {isReviewReport} from '../../../skills/nova/plugins/review/src/review-report-contract.ts';
import {makeReviewGovernor} from '../../../skills/nova/plugins/review/tests/fixtures/review-governor.mjs';
import {summaryReviewBundleDigest,summaryReviewSemanticEncoding} from '../../../skills/nova/plugins/project-summary/src/review-semantics.ts';

const semantic='review-semantics.utf16-v1';
const historical=JSON.parse(fs.readFileSync(new URL('../../../skills/nova/plugins/review/tests/fixtures/legacy-evidence-encoding.json',import.meta.url),'utf8')).original;
function pair(portable) {
  const policy=resolveReviewPolicy({builtIn:getReviewPolicyProfile('gate')});
  const snapshot=snapshotReviewBundle({...structuredClone(historical.snapshot.bundle),
    schemaVersion:portable?'review-bundle.v2':'review-bundle.v1',policyDigest:policy.digest});
  const governor=makeReviewGovernor(snapshot.bundle.revisions.changedManifestDigest,'within_scope',policy.digest);
  if(portable){governor.schemaVersion='review-governor.v2';governor.baselineId=sha256Text(portableJson({schemaVersion:governor.schemaVersion,baseline:governor.baseline}));}
  const report=buildReviewReport({attemptId:'attempt-pair',snapshot,policy,governor,findings:[],
    parsed:{ok:false,error:'direct schema fixture'},result:{schemaVersion:'stage-result.v2',outcome:'passed',artifacts:[]}});
  return {snapshot,report};
}
function schema(name) {return new Ajv2020({strict:true}).compile(JSON.parse(fs.readFileSync(
  new URL(`../../../skills/nova/plugins/review/schemas/${name}.schema.json`,import.meta.url),'utf8')));}

for(const mode of [false,true]) test(`independent ${mode?'new':'legacy'} Review and Summary version/digest parity`,()=>{
  const {snapshot,report}=pair(mode);
  assert.equal(isReviewReport(report),true);
  const bundleSchema=schema(mode?'review-bundle.v2':'review-bundle.v1');
  const reportSchema=schema(mode?'review-report.v3':'review-report.v2');
  assert.equal(bundleSchema(snapshot.bundle),true,JSON.stringify(bundleSchema.errors));
  assert.equal(reportSchema(report),true,JSON.stringify(reportSchema.errors));
  assert.equal(summaryReviewBundleDigest(report,snapshot.bundle,mode?semantic:undefined),snapshot.digest);
  assert.throws(()=>summaryReviewBundleDigest(report,snapshot.bundle,mode?undefined:semantic));
  for(const field of ['bundle','report','governor']) {
    const b=structuredClone(snapshot.bundle),r=structuredClone(report);
    (field==='bundle'?b:field==='report'?r:r.governor).schemaVersion='future';
    assert.throws(()=>summaryReviewBundleDigest(r,b,mode?semantic:undefined));
  }
  const corrupt=structuredClone(report);corrupt.governor.baselineId=`sha256:${'0'.repeat(64)}`;
  assert.equal(isReviewReport(corrupt),false);
  assert.throws(()=>summaryReviewBundleDigest(corrupt,snapshot.bundle,mode?semantic:undefined));
});

test('independent Summary retains only exact historical both-unversioned branch',()=>{
  const bundle={revisions:{base:'a',head:'b'}},report={revision:bundle.revisions};
  assert.equal(summaryReviewBundleDigest(report,bundle),sha256Text(canonicalJson(bundle)));
  assert.throws(()=>summaryReviewBundleDigest(report,bundle,semantic));
  assert.throws(()=>summaryReviewBundleDigest({...report,schemaVersion:'review-report.v2'},bundle));
  assert.throws(()=>summaryReviewBundleDigest(report,{...bundle,schemaVersion:'review-bundle.v1'}));
});

test('independent Summary selectors reject Proxy/getter before reflection',()=>{
  const {snapshot,report}=pair(true);
  for(const owner of ['final','bundle','report']) for(const kind of ['proxy','getter']) {
    const input=owner==='final'?{reviewStageId:'final-review',reviewSemanticEncoding:semantic}:
      structuredClone(owner==='bundle'?snapshot.bundle:report);
    let calls=0;let selected=input;
    if(kind==='proxy')selected=new Proxy(input,{get(){calls++;throw Error('trap');},
      getOwnPropertyDescriptor(){calls++;throw Error('trap');},ownKeys(){calls++;throw Error('trap');},
      getPrototypeOf(){calls++;throw Error('trap');}});
    else Object.defineProperty(input,owner==='final'?'reviewSemanticEncoding':'schemaVersion',
      {enumerable:true,get(){calls++;return 'future';}});
    assert.throws(()=>owner==='final'?summaryReviewSemanticEncoding(selected):
      summaryReviewBundleDigest(owner==='report'?selected:report,owner==='bundle'?selected:snapshot.bundle,semantic));
    assert.equal(calls,0,`${owner}/${kind}`);
  }
  for(const bad of [null,undefined,'future',{},[]])assert.throws(()=>summaryReviewSemanticEncoding({reviewStageId:'final-review',reviewSemanticEncoding:bad}));
  assert.throws(()=>summaryReviewSemanticEncoding({reviewSemanticEncoding:semantic}));
  assert.equal(summaryReviewSemanticEncoding({}),undefined);
});
