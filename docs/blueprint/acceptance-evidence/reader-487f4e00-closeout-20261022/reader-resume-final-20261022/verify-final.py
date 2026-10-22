import json,hashlib,re,subprocess
from pathlib import Path
B=Path('/home/node/.openclaw/workspace/tmp/pr13-finish-20261021'); O=B/'reader-resume-final-20261022'; R=Path('/home/node/.openclaw/workspace/kubeclaw-pr13-recovery')
def load(p):return json.loads(Path(p).read_text())
def sha(v):return hashlib.sha256(v).hexdigest()
def bound(x):
 p=Path(x['path']); d=p.read_bytes();assert sha(d)==x['sha256']; assert 'bytes' not in x or len(d)==x['bytes']
a=load(B/'preservation-487f4e00/reader-results-addendum.json');bound(a['sourcePlanPreserved']);bound(a['matrix']);bound(a['archive'])
for t in a['terminalReceipts']:
 bound(t['receipt']);p=Path(t['receipt']['path']); original=load(p)
 for name,v in t['streams'].items():assert sha((p.parent/name).read_bytes())==v['sha256'] and len((p.parent/name).read_bytes())==v['bytes']
 assert original['argv']==t['argv']
# Reuse unchanged independently adjudicated archive/build/check proofs after exact binding, not execute them.
old=load(B/'preservation-81db5f8a/ledger.json');v=load(B/'a910-reader-487f4e00-v3-browser/report.json');c=v['corpus'];delta=c['delta']
assert len(old['boxes'])==411 and len(delta['unchanged'])==410 and len(delta['changed'])==1 and len(delta['added'])==22 and not delta['removed']
oldmap={x['id']:x for x in old['boxes']};observed={}
assert len(v['observations'])==60 and len(v['boxObservations'])==432 and len(v['tableObservations'])==633
for x in v['observations']:assert x['pageWidth']<=x['width']+1
for x in v['boxObservations']:
 assert x['ok'] and x['visible'] and x['first']==x['expectedFirst'] and x['allInitiallyClosed']
 assert len(x['fields'])==6
 for f in x['fields']:assert all(z['labelPresent'] and z['textPresent'] for z in f['locations'])
 for z in x['native']:assert all(z[k] for k in ['closed','focused','opened','codeVisible','closedAgain'])
 observed.setdefault(x['id'],[]).append(x)
for t in v['tableObservations']:assert t['exactCells'] and t['cellsUnclipped'] and t['contained']
assert len([x for x in v['tableObservations'] if not x['ok']])==137
# Whole current ledger is 410 byte-identical inherited boxes + one changed +22 added. 432 is 144 boxes times3 widths, NOT current census.
ledger=[]
for typ,entries in delta.items():
 for x in entries:
  ident=x.get('newId',x.get('id')); expected=x.get('rawSha256',x.get('newSha256',x.get('sha256')))
  text=(R/x['page']).read_text();blocks=re.findall(r'^>[^\n]*(?:\n>[^\n]*)*',text,re.M);raw=next(z for z in blocks if sha(z.encode())==expected)
  if typ=='unchanged':assert oldmap[x['oldId']]['boxSha256']==expected
  else:
   obs=observed[ident];assert {z['width'] for z in obs}=={320,768,1440};assert all(z['rawSha256']==expected for z in obs)
  ledger.append({'id':ident,'page':x['page'],'rawSha256':expected,'disposition':'REUSE_EXACT_ORIGINAL_SIX_FIELD_SEMANTIC_LEDGER' if typ=='unchanged' else 'CURRENT_SIX_FIELD_AND_NATIVE_DISCLOSURE_RECEIVED','priorId':x.get('oldId'),'observedWidths':sorted(z['width'] for z in observed.get(ident,[]))})
assert len(ledger)==len({z['id'] for z in ledger})==433
(O/'current433-ledger.json').write_text(json.dumps({'revision':v['revision'],'scope':'410 exact prior semantic ledger entries, 23 changed/new current observations; no new independent semantic acceptance of unchanged claims','boxes':ledger},indent=2)+'\n')
plan=load(B/'preservation-487f4e00/review.json');matrix=load(R/'docs/blueprint/documentation-completion-matrix.json');records=matrix['completionRecords'];assert len(records)==len(plan['records'])==94
byid={x['id']:x for x in records}; dispositions=[]
for x in plan['records']:
 obj=byid[x['id']];assert sha(json.dumps(obj,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode())==x['originalRecordCanonicalSha256']
 dispositions.append({'id':x['id'],'originalRecordCanonicalSha256':x['originalRecordCanonicalSha256'],'originalRecordRawObjectSha256':x['originalRecordRawObjectSha256'],'affected':x['affected'],'renderedCorpusOutputAffected':x['renderedCorpusOutputAffected'],'sourceAffected':x['sourceAffected'],'requiredCurrentReaderEvidence':x['requiredCurrentReaderEvidence'],'focusedChangedCanonicalPages':x['focusedChangedCanonicalPages'],'readerVerdict':'PASS_PRESERVE_ORIGINAL_SCOPE_NO_RECOUNT','reason':x['perRecordReason'],'originalFieldsUnchanged':True})
print('affected',sum(x['sourceAffected'] or x['renderedCorpusOutputAffected'] for x in dispositions))
assert sum(x['sourceAffected'] or x['renderedCorpusOutputAffected'] for x in dispositions)==48
(O/'all94-reader-dispositions.json').write_text(json.dumps(dispositions,indent=2)+'\n')
print('PASS passive full433 census/raw correspondence, 23 delta6field native observations, 94 original canonical objects, all retained terminal bindings')
