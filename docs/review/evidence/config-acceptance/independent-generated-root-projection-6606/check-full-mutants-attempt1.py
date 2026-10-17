from pathlib import Path
import json,copy,hashlib,subprocess,sys,tempfile
root=Path.cwd();out=Path(__file__).parent;author=root/'docs/review/evidence/config-acceptance/author';ip=root/'docs/review/remediation/config-semantic-inventory.json';mp=root/'docs/review/remediation/config-acceptance-matrix.json';inv=json.loads(ip.read_text());mat=json.loads(mp.read_text());fragment=json.loads((root/'docs/review/evidence/config-acceptance/components/checkpoint6606-canonical-questions/canonical-question-fragment.json').read_text());rid=fragment['rows'][0]['id'];corecase=next(c['id'] for c in fragment['cases'] if c.get('result',c.get('actualResult'))=='not-run');cid=next(l['nativeCaseId'] for l in mat['nativeCasePackages'][0]['canonicalCaseMapping'] if 'historicalMapping' in l);sid=next(c['id'] for c in mat['cases'] if c.get('historicalSpecificationReferences'));obs=[]
def pkg(i):return next(x for x in i['supplementalDefinitionPackages'] if x['id']=='CORE-ICQ-DEFINITION-CORRECTIONS-20261013')
def history(m):return next(x for x in m['nativeCasePackages'][0]['canonicalCaseMapping'] if x['nativeCaseId']==cid)
def successor(m):return next(x for x in m['cases'] if x['id']==sid)
def pure(m):return m['definitionObservationPackages'][0]
def core(m):return next(x for x in m['cases'] if x['id']==corecase)
tests=[
('runtime-package-omitted','m',lambda i,m:m.update(nativeCasePackages=[])),
('runtime-package-and-advertisement-omitted','b',lambda i,m:(m.update(nativeCasePackages=[]),i.update(nativeCasePackageReferences=[]))),
('historical-mapping-omitted','m',lambda i,m:history(m).pop('historicalMapping')),
('historical-review-body-tamper','m',lambda i,m:history(m)['historicalMapping'].update(countsTowardAcceptance=True)),
('historical-reverse-omitted','m',lambda i,m:successor(m)['historicalSpecificationReferences'].pop()),
('historical-reverse-scope-promotion','m',lambda i,m:successor(m)['historicalSpecificationReferences'][0].update(scope='operative accepted case')),
('historical-reverse-digest-tamper','m',lambda i,m:successor(m)['historicalSpecificationReferences'][0].update(sourceSha256='0'*64)),
('historical-reverse-unknown-package','m',lambda i,m:m['cases'][0].setdefault('historicalSpecificationReferences',[]).append({**successor(m)['historicalSpecificationReferences'][0],'packageId':'UNKNOWN'})),
('native-body-scope-tamper','m',lambda i,m:m['nativeCasePackages'][0]['caseSpecifications'][0].update(scope='native-accepted')),
('native-count-tamper','i',lambda i,m:i['nativeCasePackageReferences'][0].update(historicallyMappedNativeCaseCount=0)),
('historical-predecessor-canonical-promotion','m',lambda i,m:m['cases'].append({'id':cid,'settingIds':[],'requirementIds':[],'result':'not-run'})),
('core-package-omission','i',lambda i,m:i['supplementalDefinitionPackages'].remove(pkg(i))),
('core-required-source-omission','i',lambda i,m:pkg(i).pop('canonicalFieldCaseLinkSource')),
('core-alias-omission','i',lambda i,m:next(x for x in pkg(i)['canonicalFieldCaseLinks'].values() if x['unresolvedAliases'])['unresolvedAliases'].clear()),
('core-question-omission','i',lambda i,m:pkg(i)['questions'].pop()),
('core-13row-omission','i',lambda i,m:i['rows'].remove(next(x for x in i['rows'] if x['id']==rid))),
('core-27case-omission','m',lambda i,m:m['cases'].remove(core(m))),
('core-fragment-registration-omission','i',lambda i,m:i['inputFragments'].remove(next(x for x in i['inputFragments'] if x['path'].endswith('canonical-question-fragment.json')))),
('pure-package-omission','m',lambda i,m:m.update(definitionObservationPackages=[])),
('pure-observation-scope-promotion','m',lambda i,m:pure(m)['observations'][0].update(scope='native runtime approved')),
('pure-observation-result-promotion','m',lambda i,m:pure(m)['observations'][0].update(result='not-run')),
('pure-package-source-digest-tamper','m',lambda i,m:pure(m).update(sourceSha256='0'*64)),
('core-row-projection-scope-tamper','i',lambda i,m:next(x for x in i['rows'] if x['id']==rid).update(scope='reviewer-mutated-projection-scope')),
('core-case-projection-priorstate-tamper','m',lambda i,m:core(m).update(priorState={'reviewerMutation':'unsupported projected prior state'})),
('core-case-projection-requirement-loss','m',lambda i,m:core(m)['requirementIds'].pop()),
]
start=int(sys.argv[1]) if len(sys.argv)>1 else 0;end=int(sys.argv[2]) if len(sys.argv)>2 else len(tests)
for label,kind,fn in tests[start:end]:
 i=copy.deepcopy(inv) if kind in ['i','b'] else inv;m=copy.deepcopy(mat) if kind in ['m','b'] else mat;fn(i,m)
 with tempfile.TemporaryDirectory(prefix='independent-c0-doc-mutant-') as t:
  a=Path(t)/'inventory.json';b=Path(t)/'matrix.json';a.write_text(json.dumps(i));b.write_text(json.dumps(m));r=subprocess.run([sys.executable,str(author/'check-matrix.py'),'--structural','--inventory',str(a),'--matrix',str(b)],cwd=root,capture_output=True);(out/(label+'.stdout')).write_bytes(r.stdout);(out/(label+'.stderr')).write_bytes(r.stderr);j=json.loads(r.stdout);v={'id':label,'exit':r.returncode,'errorCount':j['errorCount'],'errors':j['errors'][:6],'result':'intended-rejection' if r.returncode==1 else 'escaped-conservation-guard','mutantInventorySha256':hashlib.sha256(a.read_bytes()).hexdigest(),'mutantMatrixSha256':hashlib.sha256(b.read_bytes()).hexdigest()};obs.append(v);print(json.dumps(v),flush=True)
 del i,m
(out/('controls-'+str(start)+'-'+str(end)+'.json')).write_text(json.dumps({'scope':'ACTUAL COMPLETE checker with actual observation resolver, reviewer temp mutant files only','controls':obs},indent=2)+'\n')
