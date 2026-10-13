from pathlib import Path
import copy,json,hashlib
root=Path.cwd();out=root/'docs/review/evidence/config-acceptance/independent-historical-mapping-guard-recheck-6606';f=json.loads((out/'input-freeze.json').read_text());ns={};exec(compile((out/'inputs/docs/review/evidence/config-acceptance/author/historical_mapping.py').read_bytes(),'frozen-historical_mapping.py','exec'),ns);load=lambda p:json.loads((out/p).read_text());mapping=json.loads((out/'inputs'/ns['MAP']).read_text());native=load('case-proposals-selected.json');rows=load('inventory-fragment-selected.json');disps=load('runtime-case-dispositions-selected.json');ids=set(load('canonical-ids.json'));args=dict(mapping=mapping,native_cases=native,rows=rows,dispositions=disps,canonical_ids=ids);first=mapping['records'][0];cid=first['nativeCaseId'];sid=first['oneToManyActiveCanonicalSuccessors'][0]['caseId'];fid=first['settings'][0]['settingId'];obs=[]
def mutate(items,id,fn):
 v=copy.deepcopy(items);fn(next(x for x in v if x['id']==id));return v
def neg(label,**kw):
 a={**args,**kw}
 try:ns['validate'](**a)
 except (ValueError,KeyError) as e:obs.append({'id':label,'result':'intended-rejection','error':str(e)});return
 raise AssertionError('guard escaped '+label)
assert len(ns['validate'](**args))==269;obs.append({'id':'frozen-selected-baseline','result':'passed'})
neg('native-omission',native_cases=[x for x in native if x['id']!=cid]);neg('successor-omission',native_cases=[x for x in native if x['id']!=sid]);neg('field-omission',rows=[x for x in rows if x['id']!=fid]);neg('disposition-omission',dispositions=[x for x in disps if x['id']!=cid])
for name,items in [('native_cases',native),('rows',rows),('dispositions',disps)]:neg('duplicate-'+name,**{name:items+[copy.deepcopy(items[0])]})
for key,val in [('result','passed'),('scope','broadened'),('requirements',[])]:neg('historical-'+key,native_cases=mutate(native,cid,lambda x:x.update({key:val})));neg('successor-'+key,native_cases=mutate(native,sid,lambda x:x.update({key:val})))
neg('field-source-drift',rows=mutate(rows,fid,lambda x:x['source'].update({'sha256':'0'*64})))
neg('field-case-loss',rows=mutate(rows,fid,lambda x:x.update({'cases':[]})))
neg('original-reactivated',canonical_ids=ids|{cid});neg('successor-no-longer-canonical',canonical_ids=ids-{sid});neg('successor-explicit-superseded',dispositions=mutate(disps,sid,lambda x:x.update({'disposition':'superseded'})))
for status in ['quarantined','inactive','unknown','historical-source-evidence','',None]:
 neg('nonactive-successor-'+repr(status),dispositions=mutate(disps,sid,lambda x:x.update({'disposition':status})))
for key,value in [('countsTowardAcceptance',True),('activeSettingLinks',[]),('evidenceResultPreserved','passed'),('originalRequirementsPreserved',[]),('supersededBy',[cid])]:
 neg('successor-disposition-'+key,dispositions=mutate(disps,sid,lambda x:x.update({key:value})))
# Isolated memory filesystem exercises public pinned-loading path, not convenience validate only.
raw={x['path']:Path(x['snapshot']).read_bytes() for x in f['rawInputs']}
class MemoryRoot:
 def __init__(self,data):self.data=data
 def __truediv__(self,path):return MemoryFile(self.data[path])
class MemoryFile:
 def __init__(self,data):self.data=data
 def read_bytes(self):return self.data
 def read_text(self):return self.data.decode()
def loader(data,dispositions=disps):return ns['load_reviewed'](MemoryRoot(data),native,rows,dispositions,ids)
assert len(loader(raw))==269
for path in [ns['MAP'],ns['REVIEW'],ns['REPORT']]+sorted({s['source']['path'] for r in mapping['records'] for s in r['settings']}):
 data={**raw,path:raw[path]+b'\n'}
 try:loader(data)
 except ValueError as e:obs.append({'id':'pinned-artifact-or-source-tamper-'+path,'result':'intended-rejection','error':str(e)})
 else:raise AssertionError('loader escaped '+path)
for key,value,expected in [('disposition','quarantined','inactive successor'),('disposition','inactive','inactive successor'),('disposition','unknown','inactive successor'),('countsTowardAcceptance',True,'successor disposition metadata drift'),('activeSettingLinks',[],'successor disposition metadata drift'),('evidenceResultPreserved','passed','successor disposition metadata drift'),('originalRequirementsPreserved',[],'successor disposition metadata drift'),('supersededBy',[cid],'successor disposition metadata drift')]:
 try:loader(raw,mutate(disps,sid,lambda x:x.update({key:value})))
 except ValueError as e:
  assert expected in str(e);obs.append({'id':'public-loader-successor-'+key+'-'+repr(value),'result':'intended-rejection','error':str(e)})
 else:raise AssertionError('public loader escaped '+key)
assert len(loader(raw))==269;assert len(ns['validate'](**args))==269;obs.append({'id':'restored-selected-and-public-loader','result':'passed'})
(out/'independent-controls.json').write_text(json.dumps({'scope':'pure frozen guards in memory; no root/author/native actions','observations':obs,'summary':{'observations':len(obs),'intendedRejections':sum(x['result']=='intended-rejection' for x in obs),'escapedActiveGuards':0,'uncheckedSuccessorDispositionMetadata':0}},indent=2)+'\n');print(json.dumps(json.loads((out/'independent-controls.json').read_text())['summary']))
