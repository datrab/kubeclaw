from pathlib import Path
import json,hashlib,copy,sys
root=Path.cwd();base=root/'docs/review/evidence/config-acceptance';out=base/'independent-checkpoint6-integration-recheck'
source=(base/'author/consolidate.py').read_text();block=source[source.index('supplemental_packages = []'):source.index('\nbounded_reviews = [bounded_review]')]
real=lambda p:json.loads(Path(p).read_text());sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest();enc=lambda x:(json.dumps(x,indent=2)+'\n').encode(); observations=[]
def collect(v={}):
 scope={'root':root,'base':base,'load':lambda p:json.loads(v[Path(p)]) if Path(p) in v else real(p),'digest':lambda p:hashlib.sha256(v[Path(p)]).hexdigest() if Path(p) in v else sha(p)}
 exec(compile(block,'actual-parent-supplemental-block','exec'),scope);return scope['supplemental_packages'][0]
def reject(label,fn,expected):
 try:fn()
 except (ValueError,AssertionError) as e:
  assert expected in str(e),(label,str(e)); observations.append({'id':label,'passed':True,'intendedRejection':str(e)})
 else:raise AssertionError(label+' unexpectedly accepted')
p=collect();observations.append({'id':'actual-positive-302-reviewed-inputs','passed':True,'inputs':len(p['inputIdentities'])})
report=base/'independent-core-r06-recheck-20261013/independent-r06-review.json'
for label,edit in [('unresolved',lambda x:x['dispositions'][0].update(disposition='unresolved')),('partial',lambda x:x['dispositions'].pop()),('wrong-id',lambda x:x['dispositions'][0].update(id='WRONG'))]:
 x=real(report);edit(x);reject(label+'-valid-hash-report',lambda:collect({report:enc(x)}),'CORE_R06_NAMED_FINDINGS_NOT_RESOLVED')
x=real(report);x['reviewerNote']='postreview change';reject('resolved-but-unreviewed-report',lambda:collect({report:enc(x)}),'CORE_R06_REPORT_REVISION_REQUIRES_REVIEW')
freeze=base/'independent-core-r06-recheck-20261013/frozen-input-receipt.json';x=real(freeze);x['unreviewedNote']=1;reject('altered-review-freeze',lambda:collect({freeze:enc(x)}),'CORE_R06_REVIEW_FREEZE_DRIFT')
receipt=root/p['receipt'];r=real(receipt);cp=root/p['activeFiles']['cases'];ct=root/p['activeFiles']['caseInputContracts'];cases=real(cp);contracts=real(ct)
x=copy.deepcopy(cases);x['activeCases'][0]['requirements'].pop();y=copy.deepcopy(contracts);y['activeCases']=x['activeCases'];v={cp:enc(x),ct:enc(y)}
for f,raw in v.items():r['freeze'][str(f.relative_to(root))]=hashlib.sha256(raw).hexdigest()
v[receipt]=enc(r);reject('selfconsistent-requirement-loss-updated-receipt',lambda:collect(v),'CORE_R06_STALE_REVIEW_INPUT:')
r=real(receipt);r['unreviewedNote']=1;reject('receipt-only-postreview-change',lambda:collect({receipt:enc(r)}),'CORE_R06_STALE_REVIEW_RECEIPT')
# Isolated actual downstream conservation guards, because full pipeline rejects earlier stale review.
start=source.index('    active_cases = load(root/active_files');end=source.index('    supplemental_packages.append',start);down=source[start:end]
baseline=real(root/p['caseRequirementBaseline']['path']); req={x['id']:x['requirements'] for x in baseline['activeCases']}
def downstream(c,k):
 scope={'root':root,'load':lambda path:k if str(path)==str(ct) else c,'active_files':p['activeFiles'],'baseline_requirements':req}
 exec(compile('if True:\n'+down,'actual-parent-downstream-conservation','exec'),scope)
downstream(cases,contracts)
for label,edit in [('required-case-loss',lambda c:c['activeCases'].pop()),('required-obligation-loss',lambda c:c['activeCases'][0]['requirements'].pop())]:
 c=copy.deepcopy(cases);edit(c);k=copy.deepcopy(contracts);k['activeCases']=c['activeCases'];reject(label+'-downstream-only',lambda:downstream(c,k),'CORE_SUPPLEMENTAL_BASELINE_REQUIREMENT_LOSS:')
k=copy.deepcopy(contracts);k['activeCases'][0]['requirements'].pop();reject('activecontract-disagreement-downstream-only',lambda:downstream(cases,k),'CORE_SUPPLEMENTAL_ACTIVE_CASE_INPUT_CONFLICT')
assert collect()==p;observations.append({'id':'restored-real-positive','passed':True})
(out/'guard-controls.json').write_text(json.dumps({'scope':'virtual actual-source documentation guards, NOT F-MUT/runtime; downstream guards tested explicitly in isolation','observations':observations},indent=2)+'\n');print(json.dumps({'controls':len(observations),'allPassed':True,'noRootWrites':True}))
