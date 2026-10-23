"""Independent pure virtual-file controls of actual parent integration blocks.
No parent/child files or root outputs written; mutated fields only metadata/IDs/requirements.
This is documentation guard review, not authored Core substantive validation or F-MUT.
"""
from pathlib import Path
import json,hashlib,copy
root=Path.cwd();base=root/'docs/review/evidence/config-acceptance';b=base/'independent-checkpoint6-integration'
source=(b/'inputs/docs/review/evidence/config-acceptance/author/consolidate.py').read_text();block=source[source.index('supplemental_packages = []'):source.index('\ninventory = ')]
load=lambda p:json.loads(Path(p).read_text());digest=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest();observations=[]
def collect(virtual={}):
 def read(p):return json.loads(virtual[Path(p)]) if Path(p) in virtual else load(p)
 def sha(p):return hashlib.sha256(virtual[Path(p)]).hexdigest() if Path(p) in virtual else digest(p)
 scope={'root':root,'base':base,'load':read,'digest':sha,'bounded_review':{'id':'existing-bounded-report-context-only'}}
 exec(compile(block,'frozen-parent-consolidator-block','exec'),scope)
 return scope['supplemental_packages'],scope['bounded_reviews']
def encoded(x):return (json.dumps(x,indent=2)+'\n').encode()
packages,reviews=collect();p=packages[0];assert p['reviewerConfirmation'] is None;assert len(p['caseSpecifications'])==22;assert len(p['supersessionHistory'])==1;oldcases=load(root/p['supersessionHistory'][0]['activeFilesAtThatCheckpoint']['cases'])['activeCases'];newcases=p['caseSpecifications'];assert {x['id'] for x in oldcases}=={x['id'] for x in newcases};oldBy={x['id']:x for x in oldcases};assert all(x['requirements']==oldBy[x['id']]['requirements'] for x in newcases);observations.append({'id':'current-source-integration-IDs-requirements-lifecycle-conserved','passed':True})
# Validly encoded alternate review still noGlobal=true but namedstatus unresolved.
report=base/'independent-core-r06-recheck-20261013/independent-r06-review.json';mutant=load(report);mutant['status']='named residuals still unresolved';mutant['dispositions']=[{**x,'disposition':'unresolved'} for x in mutant['dispositions']];virtual={report:encoded(mutant)};mp,_=collect(virtual);incorrect='independently resolved' in mp[0]['independentReview'] and all(x['disposition']=='unresolved' for x in mp[0]['boundedMaterialReviews'][0]['dispositions']);assert incorrect;observations.append({'id':'R06-unresolved-review-incorrectly-described-resolved','reproducedGuardGap':True,'scope':'same-path virtual metadata with digest/load both matching its exactbytes; no realreport edited','observedIndependentReview':mp[0]['independentReview']});(b/'unresolved-r06-review.fixture.json').write_bytes(virtual[report])
# Post-review self-consistent new package requirement drift: mutateonly requirement list, update owningimmutablefreeze to newvalidhash.
receipt=base/'components/icq-r06-boundaries-20261013/stable-material-correction-receipt.json';r=load(receipt);casepath=root/r['caseEntry'];contractpath=receipt.parent/'case-input-contracts.json';caseData=load(casepath);contract=load(contractpath);case=caseData['activeCases'][0];removed=case['requirements'][0];case['requirements']=case['requirements'][1:];contract['activeCases']=copy.deepcopy(caseData['activeCases']);virtual={casepath:encoded(caseData),contractpath:encoded(contract)}
for file,raw in virtual.items():r['freeze'][str(file.relative_to(root))]=hashlib.sha256(raw).hexdigest()
virtual[receipt]=encoded(r);rp,_=collect(virtual);changed=rp[0]['caseSpecifications'][0]['requirements'];assert changed!=oldBy[case['id']]['requirements'];assert 'independently resolved' in rp[0]['independentReview'];assert load(report)['dispositions']==rp[0]['boundedMaterialReviews'][0]['dispositions'];observations.append({'id':'postreview-selfconsistent-package-requirement-loss-not-invalidated','reproducedGuardGap':True,'caseId':case['id'],'removedRequirement':removed,'all22IDsPreserved':len(rp[0]['caseSpecifications'])==22,'oldReviewStillCarriedAsResolved':True,'scope':'No substantiveCoredefinition reviewed; pure metadata requirement conservation/receipt identity proof only'})
for name,path in [('requirement-drift-cases.fixture.json',casepath),('requirement-drift-contracts.fixture.json',contractpath),('requirement-drift-receipt.fixture.json',receipt)]: (b/name).write_bytes(virtual[path])
# Restore actualbytes baseline, not leave mutantsactive.
assert collect()[0]==packages;observations.append({'id':'actual-baseline-restored-positive','passed':True})
(b/'integration-guard-controls.json').write_text(json.dumps({'observations':observations,'scope':'Parent docs integration guard controls, not production/test semantic mutants; root/authorinputs untouched'},indent=2)+'\n');print(json.dumps({'currentBaselinePassed':True,'actionableGuardGaps':2,'restoredBaselinePassed':True,'noRootWrites':True}))
