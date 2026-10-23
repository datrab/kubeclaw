from pathlib import Path
import json,hashlib
root=Path.cwd();base=root/'docs/review/evidence/config-acceptance';b=base/'independent-checkpoint6-integration';source=(b/'inputs/docs/review/evidence/config-acceptance/author/consolidate.py').read_text();block=source[source.index('bounded_reviews = [bounded_review]'):source.index('\ninventory = ')];load=lambda p:json.loads(Path(p).read_text());sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest();disposition=base/'author/nova-carrier-01-bounded-disposition-20261013.json';obs=[]
def run(corruptPath=None,flags={}):
 def read(p):
  x=load(p)
  if p==disposition:x={**x,**flags}
  return x
 scope={'root':root,'base':base,'load':read,'digest':lambda p:'0'*64 if p==corruptPath else sha(p),'bounded_review':{'prior':'not review target'}};exec(compile(block,'actual-frozen-nova-integration-block','exec'),scope);return scope['bounded_reviews']
x=run();assert x[-1]['globalC0Accepted'] is False and x[-1]['rowOrRuntimeAcceptanceInferred'] is False;obs.append({'id':'current-bounded-nova-nonacceptance-identity-positive','passed':True})
for flag in ['globalC0Accepted','rowOrRuntimeAcceptanceInferred']:
 try:run(flags={flag:True})
 except ValueError as e:assert str(e)=='NOVA_BOUNDED_REVIEW_SCOPE_AMBIGUOUS';obs.append({'id':'reject-'+flag,'passed':True})
 else:raise AssertionError(flag)
for r in load(disposition)['verifiedInputIdentities']:
 try:run(corruptPath=root/r['path'])
 except ValueError as e:assert str(e).startswith('NOVA_BOUNDED_REVIEW_INPUT_DRIFT:');obs.append({'id':'reject-input-drift:'+r['path'],'passed':True})
 else:raise AssertionError(r['path'])
assert run()==x;obs.append({'id':'restored-nova-positive','passed':True})
# Actual standalone normalized refs and rootmatrix refs independently confirmed elsewhere; pointer/path guards sampled withoutmutatingRuntime.
import sys;sys.path.insert(0,str(base/'author'));from observation_references import ObservationReferences
ref=load(base/'runtime/case-proposals.json')
def find(x):
 if isinstance(x,dict):
  if x.get('kind')=='immutable-observation-reference':return x
  for y in x.values():
   r=find(y)
   if r:return r
 elif isinstance(x,list):
  for y in x:
   r=find(y)
   if r:return r
one=find(ref);assert one;assert ObservationReferences(root).resolve(one) is not None;obs.append({'id':'actual-immutable-observation-positive','passed':True})
for label,key,value,reason in [('artifact-hash','artifactSha256','0'*64,'REFERENCE_ARTIFACT_DRIFT'),('value-hash','valueSha256','0'*64,'REFERENCE_WRONG_VALUE'),('escape','artifactPath','../outside.json','REFERENCE_PATH_ESCAPE'),('absent-pointer','rfc6901Pointer','/NO_SUCH_MEMBER','REFERENCE_POINTER_ABSENT')]:
 try:ObservationReferences(root).resolve({**one,key:value})
 except ValueError as e:assert str(e)==reason,(label,e);obs.append({'id':'observation-'+label+'-negative','passed':True})
 else:raise AssertionError(label)
assert ObservationReferences(root).resolve(one) is not None;obs.append({'id':'observation-restored-positive','passed':True})
(b/'nova-reference-guard-controls.json').write_text(json.dumps({'scope':'Actual parent integration/reference helper docs controls; no Runtime/Core semantics or globalacceptance','observations':obs,'passed':len(obs)},indent=2)+'\n');print(json.dumps({'passed':len(obs),'rootWrites':False}))
