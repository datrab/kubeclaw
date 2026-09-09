// Read-only original consumer probes. No gateway, fake ACK or producer replacement.
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=path.resolve(process.cwd());
const moduleURL=relative=>JSON.stringify(pathToFileURL(path.join(root,relative)).href);
const sdk=moduleURL('skills/common/plugin-runtime/sdk/src/values.ts');
const cache=moduleURL('skills/nova/plugins/review/src/review-content-cache.ts');
const review=moduleURL('skills/nova/plugins/review/src/review-stage-input.ts');
const adapter=moduleURL('skills/nova/core/execution/adapter-support.ts');
function run(locale,script,input) {
  const result=spawnSync(process.execPath,['--input-type=module','-e',script],{
    cwd:root,env:{...process.env,LANG:locale,LC_ALL:locale},input:JSON.stringify(input),encoding:'utf8',timeout:30000,
  });
  assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout);
}
const producer=`import {canonicalJson,sha256Text} from ${sdk};import {buildReviewCacheRecord} from ${cache};
  const value={ä:1,z:2},digest=sha256Text(canonicalJson(value));
  const unit={id:'unit:one',digest:'sha256:'+'1'.repeat(64)};
  const identity={policyDigest:'sha256:'+'2'.repeat(64),reviewerProtocol:'review:v1',reviewerModel:'model',reviewerRuntimeIdentityDigest:'sha256:'+'3'.repeat(64),evidenceVersion:'v1'};
  const input={task:{id:'task:one',statement:'Check the code'},revisions:{base:'a'.repeat(40)},scope:{allowedPrefixes:['.']},requirements:[{id:'req:one',statement:'Retain correct evidence'}],evidence:[{kind:'test',digest,content:value}],contextCandidates:[]};
  process.stdout.write(JSON.stringify({locale:Intl.DateTimeFormat().resolvedOptions().locale,input,unit,identity,record:buildReviewCacheRecord(unit,identity,value)}));`;
const produced=run('en_US.UTF-8',producer,null);
const consumer=`import fs from 'node:fs';import {parseReviewInput} from ${review};import {parseReviewCacheRecord} from ${cache};
  const source=JSON.parse(fs.readFileSync(0,'utf8'));let cache;
  try{parseReviewCacheRecord(source.record,source.unit,source.identity);cache={ok:true};}catch(error){cache={ok:false,error:error.message};}
  process.stdout.write(JSON.stringify({locale:Intl.DateTimeFormat().resolvedOptions().locale,review:parseReviewInput(source.input),cache}));`;
const same=run('en_US.UTF-8',consumer,produced),cross=run('sv_SE.UTF-8',consumer,produced);
assert.equal(same.review.ok,true);assert.equal(same.cache.ok,true);
assert.equal(cross.review.ok,false);assert.match(cross.review.error,/digest does not match canonical content/);
assert.equal(cross.cache.ok,false);assert.match(cross.cache.error,/value digest is invalid/);
const dependency=`import {requestDigest} from ${adapter};process.stdout.write(JSON.stringify({digest:requestDigest({operation:'append',resource:{type:'telemetry.stream',canonicalId:'events'},payload:{ä:1,z:2}})}));`;
const dependencyEn=run('en_US.UTF-8',dependency,null),dependencySv=run('sv_SE.UTF-8',dependency,null);
assert.notEqual(dependencyEn.digest,dependencySv.digest);
process.stdout.write(JSON.stringify({producer:produced.locale,input:{ä:1,z:2},digest:produced.input.evidence[0].digest,
  sameLocale:{locale:same.locale,reviewAccepted:same.review.ok,cacheAccepted:same.cache.ok},
  crossLocale:{locale:cross.locale,review:cross.review,cache:cross.cache},
  adapterDependencyRequestDigest:{en:dependencyEn.digest,sv:dependencySv.digest,boundary:'original hash function plus separately inspected durable idempotency-key caller; not a full adapter restart'},
  boundary:'original pure producer/parser contracts; not whole ArtifactStore/review runtime or gateway execution'},null,2)+'\n');
