// Independent direct owner checks; not Core, stored ArtifactStore, or model proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalJson,portableJson,PORTABLE_JSON_ENCODING,sha256Text} from '@kubeclaw/plugin-sdk';
import {resolveReviewPolicy,isVerifiedReviewPolicy,digestReviewPolicy} from '../../../skills/nova/plugins/review/src/review-policy-resolver.ts';
import {getReviewPolicyProfile} from '../../../skills/nova/plugins/review/src/review-policy-profiles.ts';
import {produceSimplificationFacts} from '../../../skills/nova/plugins/review/src/simplification-fact-producer.ts';
import {buildSimplificationCandidateManifest,isCertifiedSimplificationManifest} from '../../../skills/nova/plugins/review/src/simplification-manifest.ts';
import {mineSimplificationCandidates} from '../../../skills/nova/plugins/review/src/simplification-miner.ts';
import {snapshotReviewBundle} from '../../../skills/nova/plugins/review/src/review-bundle-snapshot.ts';
import {assertReviewPolicyBundle} from '../../../skills/nova/plugins/review/src/review-policy-resolver.ts';
import {certifyReviewReductionInput,isCertifiedReductionPolicy} from '../../../skills/nova/plugins/review/src/review-reduction-state.ts';
import {reduceReviewDecision} from '../../../skills/nova/plugins/review/src/review-reducer.ts';
import {verifyEchoReviewForReduction} from '../../../skills/nova/plugins/review/src/review-stage-verification.ts';
import {preflightEchoReviewProposals} from '../../../skills/nova/plugins/review/src/review-proposal-preflight.ts';
import {buildReviewGovernorSnapshot,buildInvalidReviewGovernorSnapshot} from '../../../skills/nova/plugins/review/src/review-governor.ts';

const mode='review-semantics.utf16-v1';
const revision={base:'1'.repeat(40),head:'2'.repeat(40),changedManifestDigest:sha256Text('manifest')};
const content='export function load(id: string) { return repository.load(id); }\n';
function context(){return [{path:'src/service.ts',content,digest:sha256Text(content),reasons:[{kind:'changed'}]}];}
function policy(encoding){return resolveReviewPolicy({builtIn:getReviewPolicyProfile('lean')},encoding);}
function miningInput(encoding){return {revision,evidence:[produceSimplificationFacts(revision,context(),encoding)],reviewedPaths:['src/service.ts'],policy:policy(encoding)};}
function trapped(value){let count=0;return {value:new Proxy(value,{get(t,p,r){count++;return Reflect.get(t,p,r);},ownKeys(t){count++;return Reflect.ownKeys(t);},getOwnPropertyDescriptor(t,p){count++;return Reflect.getOwnPropertyDescriptor(t,p);},getPrototypeOf(t){count++;return Reflect.getPrototypeOf(t);}}),count:()=>count};}
function getter(value,key){let count=0;const original=value[key];Object.defineProperty(value,key,{enumerable:true,configurable:true,get(){count++;return original;}});return {value,count:()=>count};}

test('independent policy selected/all provenance modes and precedence remain privately bound',()=>{
  for(const profile of ['gate','lean','audit'])for(const encoding of [undefined,mode]){
    const builtIn=getReviewPolicyProfile(profile),settings={...getReviewPolicyProfile(profile),profile:'custom.settings'},override={...getReviewPolicyProfile(profile),profile:'custom.override'};
    const input={builtIn,settingsFile:settings,runOverride:{authorized:true,policy:override}};
    const value=resolveReviewPolicy(input,encoding),serialize=encoding?portableJson:canonicalJson;
    assert.equal(value.selectedSource,'run_override');assert.equal(value.policy.profile,'custom.override');
    assert.equal(value.digest,sha256Text(serialize(value.policy)));assert.equal(digestReviewPolicy(value.policy,encoding),value.digest);
    assert.deepEqual(value.sources.map(x=>x.kind),['built_in','settings_file','run_override']);
    [builtIn,settings,override].forEach((p,i)=>assert.equal(value.sources[i].digest,sha256Text(serialize(p))));
    assert.equal(Object.isFrozen(value),true);assert.equal(Object.isFrozen(value.sources),true);
    assert.equal(isVerifiedReviewPolicy(value,encoding),true);assert.equal(isVerifiedReviewPolicy(value,encoding?undefined:mode),false);
    assert.equal(isVerifiedReviewPolicy({...value},encoding),false);
    assert.equal(isVerifiedReviewPolicy({...value,reviewSemanticEncoding:mode},mode),false);
    assert.throws(()=>resolveReviewPolicy({...input,runOverride:{authorized:false,policy:override}},encoding));
  }
});

test('independent generated evidence preserves logical values, candidate IDs and authentic certificates',()=>{
  const old=miningInput(),fresh=miningInput(mode);
  assert.equal(Object.hasOwn(old.evidence[0],'encoding'),false);assert.equal(fresh.evidence[0].encoding,PORTABLE_JSON_ENCODING);
  assert.deepEqual(JSON.parse(old.evidence[0].content),JSON.parse(fresh.evidence[0].content));
  const a=buildSimplificationCandidateManifest(old),b=buildSimplificationCandidateManifest(fresh,mode);
  assert.equal(a.manifest.candidates.length,1);assert.equal(b.manifest.candidates.length,1);
  assert.equal(a.manifest.candidates[0].candidateId,b.manifest.candidates[0].candidateId);
  assert.equal(b.manifest.candidates[0].source.digest,fresh.evidence[0].digest);
  assert.equal(b.evidence.content,portableJson(b.manifest));assert.equal(b.evidence.digest,sha256Text(b.evidence.content));
  assert.equal(b.evidence.encoding,PORTABLE_JSON_ENCODING);assert.equal(Object.hasOwn(a.evidence,'encoding'),false);
  assert.equal(isCertifiedSimplificationManifest(a.manifest,revision,old.policy),true);
  assert.equal(isCertifiedSimplificationManifest(b.manifest,revision,fresh.policy,mode),true);
  assert.equal(isCertifiedSimplificationManifest(b.manifest,revision,fresh.policy),false);
  assert.equal(isCertifiedSimplificationManifest({...b.manifest},revision,fresh.policy,mode),false);
  assert.equal(isCertifiedSimplificationManifest(b.manifest,{...revision},fresh.policy,mode),false);
  assert.throws(()=>buildSimplificationCandidateManifest(old,mode));assert.throws(()=>buildSimplificationCandidateManifest(fresh));
});

for(const owner of ['facts-context','facts-revision','manifest-input','miner-input'])for(const kind of ['proxy','getter']){
  test(`independent ${owner}/${kind} rejects without trap execution`,()=>{
    let selected,call;
    if(owner==='facts-context'){
      const c=context();selected=kind==='proxy'?trapped(c):getter(c[0],'content');
      call=()=>produceSimplificationFacts(revision,kind==='proxy'?selected.value:c,mode);
    }else if(owner==='facts-revision'){
      selected=kind==='proxy'?trapped({...revision}):getter({...revision},'head');
      call=()=>produceSimplificationFacts(selected.value,context(),mode);
    }else{
      const input=miningInput(mode);selected=kind==='proxy'?trapped(input):getter(input,'policy');
      call=()=>owner==='manifest-input'?buildSimplificationCandidateManifest(selected.value,mode):mineSimplificationCandidates(selected.value,mode);
    }
    let rejected=false;try{call();}catch{rejected=true;}
    assert.equal(selected.count(),0,`${owner}/${kind} executed ${selected.count()} traps`);assert.equal(rejected,true);
  });
}

test('independent original generated facts cannot certify a candidate using a substituted source digest',()=>{
  const input=miningInput(mode);input.evidence=[{...input.evidence[0],digest:`sha256:${'0'.repeat(64)}`}];
  const result=mineSimplificationCandidates(input,mode);
  assert.equal(result.candidates.length,0,'mining admitted a source digest that does not identify its actual content');
  assert.equal(result.diagnostics[0]?.code,'malformed_source');
});

function realSnapshot() {
  const resolved=policy(mode),changedPaths=[{path:'src/service.ts',status:'modified'}];
  const rev={...revision,changedManifestDigest:sha256Text(canonicalJson(changedPaths))};
  const facts=produceSimplificationFacts(rev,context(),mode);
  const manifest=buildSimplificationCandidateManifest({revision:rev,evidence:[facts],reviewedPaths:['src/service.ts'],policy:resolved},mode);
  const snapshot=snapshotReviewBundle({schemaVersion:'review-bundle.v2',task:{id:'TASK-1',statement:'Review.'},
    revisions:rev,scope:{allowedPrefixes:['src'],changedPaths},requirements:[{id:'REQ-1',statement:'Works.'}],
    evidence:[facts,manifest.evidence],context:context(),policyDigest:resolved.digest,
    selection:{version:'focused-context.v1',candidateManifestDigest:sha256Text('selection'),expansionRound:0}});
  return {resolved,snapshot,rev};
}

test('independent new bundle and reduction authority reject substitution but preserve old helper domain',()=>{
  const {resolved,snapshot}=realSnapshot();
  assert.doesNotThrow(()=>assertReviewPolicyBundle(policy(),{schemaVersion:'review-bundle.v1',policyDigest:sha256Text('opaque original placeholder')}));
  assert.throws(()=>assertReviewPolicyBundle(resolved,{...snapshot.bundle,policyDigest:sha256Text('wrong')}));
  assert.throws(()=>assertReviewPolicyBundle(policy(),snapshot.bundle));
  const input=p=>({resolvedPolicy:p,integrityIssues:[],unverifiedRequirements:[],limitViolations:[],findings:[]});
  const value=certifyReviewReductionInput(input(resolved),mode);
  assert.equal(isCertifiedReductionPolicy(value),true);assert.equal(isCertifiedReductionPolicy({...value}),false);
  assert.equal(reduceReviewDecision({...value}).outcome,'blocked');
  assert.throws(()=>certifyReviewReductionInput(input(resolved)));
  assert.throws(()=>certifyReviewReductionInput(input(policy()),mode));
});

test('independent actual candidate-reader functions validate decoded bytes without a producer certificate',()=>{
  const {resolved,snapshot}=realSnapshot(),loaded=JSON.parse(portableJson(snapshot));
  const read=s=>verifyEchoReviewForReduction({snapshot:s,policy:resolved,parsed:{ok:false,error:'bounded direct reader'}});
  const result=read(loaded);assert.equal(result.simplification.candidateCount,1);
  assert.deepEqual(result.integrityIssues,['invalid Echo output: bounded direct reader']);
  const echo={inspectedEvidence:[],proposedFindings:[],requirementAssessments:{}};
  assert.deepEqual(preflightEchoReviewProposals(loaded.bundle,echo,resolved,new Map()).integrityIssues,[]);
  for(const mutate of [e=>{e.digest=sha256Text('wrong');},e=>{e.content+=' ';e.digest=sha256Text(e.content);},
    e=>{e.encoding='future';},e=>{delete e.encoding;},e=>{const v=JSON.parse(e.content);v.schemaVersion='future';e.content=portableJson(v);e.digest=sha256Text(e.content);}]){
    const bad=structuredClone(loaded);mutate(bad.bundle.evidence.find(e=>e.kind==='simplification-candidates'));
    const invalid=read(bad);assert(invalid.integrityIssues.length>1);assert.equal(invalid.simplification,undefined);
    assert(preflightEchoReviewProposals(bad.bundle,echo,resolved,new Map()).integrityIssues.length>0);
  }
});

for(const kind of ['proxy','getter'])test(`independent candidate-reader snapshot ${kind} rejects without trap execution`,()=>{
  const {resolved,snapshot}=realSnapshot(),plain=JSON.parse(portableJson(snapshot));
  const selected=kind==='proxy'?trapped(plain):getter(plain,'bundle');let rejected=false;
  try{verifyEchoReviewForReduction({snapshot:selected.value,policy:resolved,parsed:{ok:false,error:'bounded direct reader'}});}catch{rejected=true;}
  assert.equal(selected.count(),0,`snapshot ${kind} executed ${selected.count()} traps`);assert.equal(rejected,true);
});

for(const owner of ['valid','invalid'])test(`independent ${owner} governor rejects authentic same-mode wrong policy before consulting context`,async()=>{
  const {snapshot,rev}=realSnapshot();
  const foreign=resolveReviewPolicy({builtIn:getReviewPolicyProfile('gate')},mode);
  let contextReads=0;
  const values={reviewSemanticEncoding:mode,snapshot,policy:foreign,revision:rev,
    input:{revisions:rev,scope:{allowedPrefixes:['src'],ownershipPrefixes:['src']}},
    context:{get contract(){contextReads++;throw Error('context must not be consulted for mismatched policy');}}};
  let rejected=false;
  try{await (owner==='valid'?buildReviewGovernorSnapshot(values):buildInvalidReviewGovernorSnapshot(values));}catch{rejected=true;}
  assert.equal(contextReads,0,'owner mismatch reached context before rejection');assert.equal(rejected,true);
});
