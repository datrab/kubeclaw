"""Independent persisted-input recheck of IFOUR-ROOT-001 correction only."""
import copy,gzip,hashlib,json,subprocess,tempfile
from pathlib import Path
R=Path.cwd(); E=Path('docs/review/evidence/config-acceptance'); P=E/'independent-four-findings-recheck-20261013'; O=P/'root-guard-recheck'; CHECK=E/'author/check-matrix.py'
sha=lambda b:hashlib.sha256(b).hexdigest()
def load(p):return json.loads(Path(p).read_bytes())
def write(p,x):Path(p).write_text(json.dumps(x,indent=2)+'\n')
frozen=load(E/'four-findings-fix-20261013/review-input-identities.json')
for f in frozen['files']:assert sha(Path(f['path']).read_bytes())==f['sha256'],f['path']
initial=load(P/'review-output-identities.json')
for f in initial['files']:assert sha(Path(f['path']).read_bytes())==f['sha256'],f['path']
inventory=Path('docs/review/remediation/config-semantic-inventory.json'); matrix=Path('docs/review/remediation/config-acceptance-matrix.json'); inv=load(inventory); mat=load(matrix); runtime=load(E/'runtime/inventory-fragment.json')['rows']; expected={r['id']:r for r in inv['rows'] if r.get('fragment')=='runtime'}
assert set(expected)=={r['id'] for r in runtime}
for raw in runtime:
 normalized=dict(raw);normalized.update(fragment='runtime',**{'class':raw.get('class',raw.get('classification')),'requirementIds':raw.get('requirementIds',raw.get('requirements',[])),'caseIds':raw.get('caseIds',raw.get('cases',[])),'verifiedSourceEvidence':raw.get('verifiedSourceEvidence',raw.get('evidence',[])),'semanticStatus':raw.get('semanticStatus',raw.get('status','unresolved')),'reviewerConfirmation':None});assert expected[raw['id']]==normalized
checkerbytes=CHECK.read_bytes(); patch=subprocess.check_output(['git','diff','--binary']); (O/'review-input.patch.gz').write_bytes(gzip.compress(patch,mtime=0)); changed=subprocess.check_output(['git','diff','--name-only'],text=True).splitlines(); assert len(changed)==7 and all(p.startswith('docs/review/') for p in changed); assert str(CHECK) in changed
write(O/'input-identities.json',{'head':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'checkerSHA256':sha(checkerbytes),'originalFrozenManifestSHA256':sha((E/'four-findings-fix-20261013/review-input-identities.json').read_bytes()),'initialReportManifestSHA256':sha((P/'review-output-identities.json').read_bytes()),'exactDirtyPatchSHA256':sha(patch),'modifiedTrackedPaths':changed,'allPreviouslyReviewedInputsUnchanged':True,'allInitialReviewOutputsUnchanged':True})
results=[]
sid='RT-NOVA-REMOTE-SCHEMAVERSION'
def row(d):return next(r for r in d['rows'] if r['id']==sid)
def history(d):return next(h for h in row(d)['sourceDefinitionHistory'] if h['batch']=='standalone-remote-19')
def control(label,data,boundary=None):
 with tempfile.TemporaryDirectory(prefix='independent-root-guard-') as td:
  p=Path(td)/'inventory.json';write(p,data);(O/(label+'.inventory.json.gz')).write_bytes(gzip.compress(p.read_bytes(),mtime=0));args=['python3',str(CHECK),'--structural','--inventory',str(p),'--matrix',str(matrix)]; proc=subprocess.run(args,capture_output=True);(O/(label+'.stdout')).write_bytes(proc.stdout);(O/(label+'.stderr')).write_bytes(proc.stderr);out=json.loads(proc.stdout);want=1 if boundary else 0;assert proc.returncode==want and (out['errorCount']==0 if boundary is None else any(boundary in e for e in out['errors'])),(label,out);results.append({'label':label,'command':args,'exit':proc.returncode,'expectedBoundary':boundary,'errors':out['errors'],'inputSHA256':sha(p.read_bytes()),'passed':True})
control('positive-before',inv)
mutations=[
 ('original-history-hash',lambda d:history(d).update(oldRowSHA256='0'*64),'normalized source body/requirement conservation drift'),
 ('correction-provenance-remove',lambda d:history(d).pop('oldRowSHA256Correction'),'normalized source body/requirement conservation drift'),
 ('retained-incorrect-digest',lambda d:history(d)['oldRowSHA256Correction'].update(previousIncorrectOldRowSHA256='1'*64),'normalized source body/requirement conservation drift'),
 ('nonprovenance-current',lambda d:row(d)['current'].update(precedence='unrelated profile replacement'),'normalized source body/requirement conservation drift'),
 ('normalized-class',lambda d:row(d).update(**{'class':'different'}),'normalized source body/requirement conservation drift'),
 ('required-obligations-remove',lambda d:row(d).update(requirementIds=[]),'normalized source body/requirement conservation drift'),
 ('case-links-remove',lambda d:row(d).update(caseIds=[]),'normalized source body/requirement conservation drift'),
 ('review-acceptance-promote',lambda d:row(d).update(reviewerConfirmation='accepted'),'normalized source body/requirement conservation drift'),
 ('c0-acceptance-promote',lambda d:row(d).update(c0Closed=True),'normalized source body/requirement conservation drift'),
 ('unexpected-property',lambda d:row(d).update(injectedRuntimePolicy='operator fallback'),'normalized source body/requirement conservation drift'),
 ('row-delete',lambda d:d['rows'].remove(row(d)),'Runtime normalized row set conservation drift'),
 ('fragment-escape',lambda d:row(d).update(fragment='components'),'Runtime normalized row set conservation drift'),
 ('fragment-registration-delete',lambda d:d['inputFragments'].remove(next(f for f in d['inputFragments'] if f['path']==str(E/'runtime/inventory-fragment.json'))),'Runtime fragment registration missing'),
 ('row-duplicate',lambda d:d['rows'].append(copy.deepcopy(row(d))),'duplicate ID'),
 ('unexpected-runtime-row',lambda d:d['rows'].append({**copy.deepcopy(row(d)),'id':'RT-INDEPENDENT-UNEXPECTED'}),'Runtime normalized row set conservation drift'),
]
for label,mutate,boundary in mutations:
 d=copy.deepcopy(inv);mutate(d);control(label,d,boundary)
control('positive-after',inv)
# Rerun exactly the original persisted failing mutant without recomposing it.
d=json.loads(gzip.decompress((P/'runtime-history-drift.inventory.json.gz').read_bytes()));control('original-report-mutant',d,'normalized source body/requirement conservation drift')
assert CHECK.read_bytes()==checkerbytes
for f in frozen['files']:assert sha(Path(f['path']).read_bytes())==f['sha256']
for f in initial['files']:assert sha(Path(f['path']).read_bytes())==f['sha256']
for p in ['docs/review/remediation/decisions.md','docs/review/remediation/acceptance-20260920.md','docs/review/remediation/OPENCLAW-CONFIG-GOAL.md']:assert Path(p).read_bytes()==subprocess.check_output(['git','show',frozen['head']+':'+p])
assert inv['status']=='in-progress-not-C0-accepted';write(O/'checks.json',results);write(O/'recovery-identities.json',{'checks':len(results),'negativeControls':len(results)-2,'positives':2,'runtimeRowsIndependentlyConserved':len(runtime),'allOriginalCandidateFilesUnchanged':True,'initialReviewArtifactsUnchanged':True,'checkerUnchangedDuringReview':True,'originalAcceptanceAndDecisionsUnchanged':True,'productionChanged':False,'globalC0Accepted':False,'isolatedInputsRemoved':True});print(json.dumps({'boundedVerdict':'clean','finding':'IFOUR-ROOT-001','checks':len(results),'globalC0Accepted':False}))
