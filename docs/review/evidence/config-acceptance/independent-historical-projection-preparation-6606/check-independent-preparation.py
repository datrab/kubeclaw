from pathlib import Path
import json,gzip,copy,sys,types
root=Path.cwd();out=Path(__file__).parent;prefix='docs/review/evidence/config-acceptance/author/';ns={};exec(compile((out/'inputs'/prefix/'historical_mapping.py').read_bytes(),'frozen-map','exec'),ns);proj={'require':ns['require']};exec(compile((out/'inputs'/prefix/'historical_projection.py').read_text().replace('from historical_mapping import require',''),'frozen-projection','exec'),proj);load=lambda n:json.loads((out/n).read_text());f=load('input-freeze.json');base=lambda path:json.loads(gzip.decompress((root/next(x['snapshot'] for x in f['immutableBaselineInputs'] if x['path']==path)).read_bytes()));matrix=base('docs/review/remediation/config-acceptance-matrix.json');inventory=base('docs/review/remediation/config-semantic-inventory.json');native=base('docs/review/evidence/config-acceptance/runtime/case-proposals.json');mapping=json.loads((out/'inputs'/ns['MAP']).read_text());rows=load('inventory-fragment-selected.json');disps=load('runtime-case-dispositions-selected.json');hist=ns['validate'](mapping,native,rows,disps,{x['id'] for x in matrix['cases']});package=matrix['nativeCasePackages'][0];initial=copy.deepcopy(package['caseSpecifications']);initialcases=copy.deepcopy(matrix['cases']);ads=inventory['nativeCasePackageReferences'][0];ads.update(proj['attach'](package,matrix['cases'],hist));assert initial==package['caseSpecifications'];assert [{k:v for k,v in x.items() if k!='historicalSpecificationReferences'} for x in matrix['cases']]==initialcases;assert all(x['mappingReview'] is None for x in package['canonicalCaseMapping']);assert package['reviewerConfirmation'] is None;assert ads['unlinkedNativeCaseCount']==269 and ads['historicallyMappedNativeCaseCount']==269 and ads['unresolvedNativeCaseCount']==0
obs=[];cid=next(iter(hist));sid=hist[cid]['activeCanonicalSuccessors'][0]['caseId']
def verify(p,c,a):return proj['verify'](p,c,hist,a)
def neg(label,change):
 p=copy.deepcopy(package);c=copy.deepcopy(matrix['cases']);a=copy.deepcopy(ads);change(p,c,a)
 try:verify(p,c,a)
 except (ValueError,KeyError) as e:obs.append({'id':label,'result':'intended-rejection','error':str(e)});return
 raise AssertionError('escaped projection '+label)
def link(p):return next(x for x in p['canonicalCaseMapping'] if x['nativeCaseId']==cid)
def case(c):return next(x for x in c if x['id']==sid)
verify(package,matrix['cases'],ads);obs.append({'id':'immutable6606-plus-reviewed-histories','result':'positive','counts':{k:ads[k] for k in proj['counts'](package)}})
neg('history-forward-omitted',lambda p,c,a:link(p).pop('historicalMapping'));neg('whole-history-native-link-omitted',lambda p,c,a:p['canonicalCaseMapping'].remove(link(p)));neg('duplicate-native-link',lambda p,c,a:p['canonicalCaseMapping'].append(copy.deepcopy(link(p))));neg('history-acceptance-promoted',lambda p,c,a:link(p)['historicalMapping'].update(countsTowardAcceptance=True));neg('predecessor-directly-reactivated',lambda p,c,a:link(p).update(canonicalCaseId=cid));neg('predecessor-added-to-canonical-body',lambda p,c,a:c.append({'id':cid}));neg('successor-omitted',lambda p,c,a:c.remove(case(c)))
ref=next(x for x in case(matrix['cases'])['historicalSpecificationReferences'] if x['nativeCaseId']==cid)
for key,value in [('sourcePath','wrong'),('sourceSha256','0'*64),('mapPath','wrong'),('mapSha256','0'*64),('countsTowardAcceptance',True),('scope','operative active spec')]:
 neg('reverse-tamper-'+key,lambda p,c,a,key=key,value=value:next(x for x in case(c)['historicalSpecificationReferences'] if x['nativeCaseId']==cid).update({key:value}))
neg('reverse-omitted',lambda p,c,a:case(c)['historicalSpecificationReferences'].remove(next(x for x in case(c)['historicalSpecificationReferences'] if x['nativeCaseId']==cid)));neg('reverse-duplicate',lambda p,c,a:case(c)['historicalSpecificationReferences'].append(copy.deepcopy(ref)))
for k,v in [('packageId','UNKNOWN'),('nativeCaseId','UNKNOWN')]:neg('unknown-reverse-'+k,lambda p,c,a,k=k,v=v:c[0].setdefault('historicalSpecificationReferences',[]).append({**ref,k:v}))
other=next(x['id'] for x in matrix['cases'] if x['id'] not in {s['caseId'] for s in hist[cid]['activeCanonicalSuccessors']});neg('unrelated-reverse-tuple',lambda p,c,a:next(x for x in c if x['id']==other).setdefault('historicalSpecificationReferences',[]).append(copy.deepcopy(ref)))
for key in proj['counts'](package):neg('count-'+key,lambda p,c,a,key=key:a.update({key:-1}))
# Execute the exact frozen full checker's native-package block in isolation.
# Observation log resolution is outside this new wiring scope (no-op adapter); identity and guarded histories are real.
raw={x['path']:(root/x['snapshot']).read_bytes() for x in f['rawInputs']};raw['docs/review/evidence/config-acceptance/runtime/case-proposals.json']=json.dumps(native,indent=2).encode()
# Preserve exact immutable baseline source bytes for the checker source hash.
sourceentry=next(x for x in f['immutableBaselineInputs'] if x['path'].endswith('/runtime/case-proposals.json'));raw[sourceentry['path']]=gzip.decompress((root/sourceentry['snapshot']).read_bytes());raw['docs/review/evidence/config-acceptance/runtime/inventory-fragment.json']=json.dumps({'rows':rows}).encode();raw['docs/review/evidence/config-acceptance/runtime/runtime-case-dispositions.json']=json.dumps({'cases':disps}).encode()
class P:
 def __init__(self,path):self.path=path
 def read_bytes(self):return raw[self.path] if self.path in raw else (root/self.path).read_bytes()
 def read_text(self):return self.read_bytes().decode()
 def is_file(self):return self.path in raw or (root/self.path).is_file()
class R:
 def __truediv__(self,path):return P(str(path))
check=(out/'inputs'/prefix/'check-matrix.py').read_text();block=check[check.index('native_packages='):check.index('for ledger_path')]
def run(m,i,strict=False):
 errors=[]
 def identity(path,expected,label):
  import hashlib
  if hashlib.sha256(R().__truediv__(path).read_bytes()).hexdigest()!=expected:errors.append(label+': content drift')
 def ids(items,label):
  result={x['id'] for x in items}
  if len(result)!=len(items):errors.append(label+': duplicate ID')
  return result
 class Ref:
  def resolve(self,x):pass
 g={'matrix':m,'inventory':i,'root':R(),'errors':errors,'reject':errors.append,'ids':ids,'identity':identity,'references':Ref(),'json':json,'structural':not strict,'load_historical_mappings':ns['load_reviewed'],'verify_historical_projection':proj['verify']};exec(compile(block,'frozen-checker-native-block','exec'),g);return errors
assert run(matrix,inventory)==[];obs.append({'id':'exact-native-block-structural-positive','result':'positive','limit':'Not full checker/global root. Existing observation-log checks are outside new block review and adapted no-op; actual identity/history loading executes.'})
for label,change in [('package-omitted',lambda m,i:m.update(nativeCasePackages=[])),('both-package-and-advertisement-omitted',lambda m,i:(m.update(nativeCasePackages=[]),i.update(nativeCasePackageReferences=[]))),('forward-history-omitted',lambda m,i:next(x for x in m['nativeCasePackages'][0]['canonicalCaseMapping'] if x['nativeCaseId']==cid).pop('historicalMapping')),('unknown-reverse-link',lambda m,i:m['cases'][0].setdefault('historicalSpecificationReferences',[]).append({**ref,'packageId':'UNKNOWN'}))]:
 m=copy.deepcopy(matrix);i=copy.deepcopy(inventory);change(m,i);errors=run(m,i);assert errors;obs.append({'id':'exact-native-block-'+label,'result':'intended-rejection','errors':errors[:4]})
errors=run(matrix,inventory,True);assert any('no independent mapping/specification review' in x for x in errors);assert any('no whole field/consumer/case acceptance' in x for x in errors);obs.append({'id':'strict-native-block-still-rejects-acceptance','result':'positive','strictErrors':len(errors),'limit':'Full checker not run on ungenerated final root; native review gate demonstrated only.'});verify(package,matrix['cases'],ads);obs.append({'id':'restored-projection','result':'positive'});(out/'independent-controls.json').write_text(json.dumps({'scope':'pure immutable root copies and exact code/helper blocks, no root-on-disk mutation','observations':obs,'counts':{'total':len(obs),'negative':sum(x['result']=='intended-rejection' for x in obs),'positive':sum(x['result']=='positive' for x in obs)}},indent=2)+'\n');print(json.dumps(json.loads((out/'independent-controls.json').read_text())['counts']))
