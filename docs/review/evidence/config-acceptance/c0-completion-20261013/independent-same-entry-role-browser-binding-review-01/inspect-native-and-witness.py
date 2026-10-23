from pathlib import Path
import json,hashlib
root=Path('.').resolve();b=root/'docs/review/evidence/config-acceptance/c0-completion-20261013';a=b/'same-entry-role-browser-binding-01';r=b/'independent-same-entry-role-browser-binding-review-01';cache={};reads={}
def load(p):
 p=Path(p);p=p if p.is_absolute() else root/p
 if str(p) not in cache:
  raw=p.read_bytes();reads[str(p)]=hashlib.sha256(raw).hexdigest();cache[str(p)]=json.loads(raw)
 return cache[str(p)]
def point(ref):
 v=load(ref['path'])
 for k in ref.get('pointer','').split('/')[1:]:v=v[int(k)] if isinstance(v,list) else v[k.replace('~1','/').replace('~0','~')]
 return v
bad=[];count=0
for package in ['runtime-provider-contracts-03','security-provider-contracts-01','browser-provider-contracts-01']:
 for c in load(b/package/'case-definitions.json')['cases']:
  native=c['retainedNativeCase'];refs=c['originalCanonicalCase'].get('nativeSpecificationReferences',[]);matches=[]
  for s in refs:
   d=load(s['sourcePath']);rows=d if isinstance(d,list) else d.get('cases',[]);matches.append(next((x for x in rows if x['id']==s['nativeCaseId']),None)==native)
  if not any(matches):bad.append(c['id'])
  count+=1
fieldMismatch=[];witnessForms={}
for f in load(a/'current-field-instance-source-closure.json'):
 original=point(f['originalExactRegistrationWitness']);node=point(f['currentTypedFieldNodes']);t=point(f['actualRootTuple'])
 if isinstance(original,str):same=original==t['registrationId'];form='original registration scalar'
 else:same=original['id']==f['id'];form='original complete field context'
 witnessForms[form]=witnessForms.get(form,0)+1
 if not same or node['id']!=f['id']:fieldMismatch.append(f['id'])
record={'retainedNativeBodiesCompared':count,'retainedNativeMismatches':bad,'originalRegistrationWitnessToCurrentSameFieldJoins':261,'witnessForms':witnessForms,'witnessJoinMismatches':fieldMismatch,'readInputs':[{'path':p,'sha256':h} for p,h in reads.items()]};(r/'native-and-source-field-joins.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps({k:v for k,v in record.items() if k!='readInputs'}))
