import assert from 'node:assert/strict';
import { canonicalJson, sha256Text } from '../../../skills/common/plugin-runtime/sdk/src/index.ts';
import { resolveReviewPolicy } from '../../../skills/nova/plugins/review/src/review-policy-resolver.ts';
import { getReviewPolicyProfile } from '../../../skills/nova/plugins/review/src/review-policy-profiles.ts';
import { snapshotReviewBundle } from '../../../skills/nova/plugins/review/src/review-bundle-snapshot.ts';
import { buildReviewReport } from '../../../skills/nova/plugins/review/src/review-report-builder.ts';
import { makeReviewGovernor } from '../../../skills/nova/plugins/review/tests/fixtures/review-governor.mjs';
import { produceSimplificationFacts } from '../../../skills/nova/plugins/review/src/simplification-fact-producer.ts';
import { mineSimplificationCandidates } from '../../../skills/nova/plugins/review/src/simplification-miner.ts';
const base=getReviewPolicyProfile('gate');
const policy=resolveReviewPolicy({builtIn:base,settingsFile:{...base,profile:'custom'}});
const changedPaths=[{path:'src/a.ts',status:'modified'}];
const revision={base:'1'.repeat(40),head:'2'.repeat(40),changedManifestDigest:sha256Text(canonicalJson(changedPaths))};
const snapshot=snapshotReviewBundle({schemaVersion:'review-bundle.v1',task:{id:'TASK-1',statement:'Review.'},revisions:revision,scope:{allowedPrefixes:['src'],changedPaths},requirements:[{id:'REQ-1',statement:'Works.'}],evidence:[{kind:'test',content:'{}',digest:sha256Text('{}')}],context:[{path:'src/a.ts',content:'x',digest:sha256Text('x'),reasons:[{kind:'changed'}]}],selection:{version:'focused-context.v1',candidateManifestDigest:sha256Text('manifest'),expansionRound:0},policyDigest:policy.digest});
assert.equal(policy.policy.profile,'custom');
assert.throws(()=>buildReviewReport({attemptId:'attempt-1',snapshot,policy,parsed:{ok:false,error:'not required'},result:{schemaVersion:'stage-result.v2',outcome:'passed',artifacts:[]},findings:[],governor:makeReviewGovernor(revision.changedManifestDigest,'within_scope',policy.digest)}),/built review report is invalid/);
console.log('CONFIRMED custom settings policy accepted; required report rejected');
const lean=resolveReviewPolicy({builtIn:getReviewPolicyProfile('lean')});
for (const [name,content] of [
 ['legal-dollar-symbol','function good(x) { return target(x); } function $wrap(x) { return target(x); }'],
 ['same-name-in-independent-scopes','function outerA(){function wrap(x) { return target(x); }} function outerB(){function wrap(x) { return target(x); }}'],
]) {
 const evidence=produceSimplificationFacts(revision,[{path:'src/a.ts',content,digest:sha256Text(content),reasons:[{kind:'changed'}]}]);
 const mined=mineSimplificationCandidates({revision,evidence:[evidence],reviewedPaths:['src/a.ts'],policy:lean});
 assert.equal(mined.candidates.length,0);assert.equal(mined.diagnostics[0].code,'malformed_source');
 console.log(JSON.stringify({case:name,generated:JSON.parse(evidence.content).facts.length,candidates:mined.candidates.length,diagnostics:mined.diagnostics}));
}
const comment='/* function ghost(x) { return target(x); } */';
const evidence=produceSimplificationFacts(revision,[{path:'src/a.ts',content:comment,digest:sha256Text(comment),reasons:[{kind:'changed'}]}]);
assert.equal(JSON.parse(evidence.content).facts.length,1);
console.log('CONFIRMED non-executable comment produces high-confidence wrapper fact (advisory candidate, no repair authorization)');
