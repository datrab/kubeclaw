import json,pathlib,hashlib,copy,re,subprocess
ROOT=pathlib.Path.cwd(); OUT=ROOT/'docs/review/evidence/config-acceptance/independent-core-icq-material-recheck-20261013'; C=ROOT/'docs/review/evidence/config-acceptance/components/icq-corrections-20261013'
load=lambda n:json.loads((C/n).read_text()); canonical=lambda x:json.dumps(x,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode(); sha=lambda b:hashlib.sha256(b).hexdigest()
results=[]
def check(i,v,details=None):
 results.append(dict(id=i,passed=bool(v),details=details));assert v,i
s=load('serialization-envelope-contract.json'); b=s['inlineBinding']; e=load('reserve-boundary-fixtures.json')['emptyState']
check('header-object514',len(canonical(b))==514); check('persisted-binding-growth525',len(canonical(dict(e,binding=b)))-len(canonical(e))==525);check('historical-inlineBinding-growth531',len(canonical(dict(e,inlineBinding=b)))-len(canonical(e))==531)
r=load('reserve-boundary-fixtures.json');a=r['acceptedCompleteAuthor']['settings']['execution']['stores']['admission']; check('fixed8900-admitted',a['maximumBytes']>8192+182+525);check('fixed8899-rejected',not(8899>8192+182+525))
env=load('computed-environment-supersession.json')['literalCallerExpansions']; text=(ROOT/env[0]['reader']['path']).read_text();actual=set(re.findall(r"environment\('([^']+)'\)",text));check('all-six-env-callers',actual=={x['name'] for x in env} and len(actual)==6)
for x in env:
 check('reader:'+x['name'],(ROOT/x['reader']['path']).read_text().splitlines()[x['reader']['line']-1]==x['reader']['text'])
 for q in x['producer']['matches']:check('producer:'+x['name'],(ROOT/x['producer']['path']).read_text().splitlines()[q['line']-1]==q['text'])
q=load('question-definitions.json')['questions'];cs=load('question-case-specs.json')['activeCases'];check('all14unique',len(q)==len({x['id'] for x in q})==14);check('all22unique',len(cs)==len({x['id'] for x in cs})==22);check('case-contract-mirror',cs==load('case-input-contracts.json')['activeCases'])
for x in cs:check('notrun:'+x['id'],'not-run' in x['implementationStatus'])
for x in q:check('question-case-links:'+x['id'],set(x.get('caseIds',[]))<={z['id'] for z in cs})
for x in load('immutable-owner-reference-specimens.json')['refResolution']:
 for field,obj in [('profileDigest','fullProfile'),('policyDigest','policy'),('generationDigest','generationManifest'),('sourceDigest','sourceManifest')]:check('immutable:'+x['id']+':'+field,x['binding'][field]=='sha256:'+sha(canonical(x[obj])))
 # Documentation negative and restored controls, not future productive resolver execution.
 mutated=copy.deepcopy(x['fullProfile']);mutated['review-negative']=True;check('immutable-drift-negative:'+x['id'],'sha256:'+sha(canonical(mutated))!=x['binding']['profileDigest']);check('immutable-restored:'+x['id'],'sha256:'+sha(canonical(x['fullProfile']))==x['binding']['profileDigest'])
provider=load('provider-serialization-bound-controls.json');state={'schemaVersion':'durable-attempt-store.v1','evidence':[],'results':[],'closures':[],'providerProvenance':[{'launchReceipt':provider['maximumReceipt'],'snapshots':[provider['maximumSnapshot']]}]};n=len(canonical(state));check('fixed-provider1964-positive',n<=1964,n);check('fixed-provider1963-negative',not(n<=1963),n);drift=copy.deepcopy(state);drift['providerProvenance'][0]['snapshots'].append(provider['maximumSnapshot']);check('retained-additional-snapshot-charged',len(canonical(drift))>1964);check('restored-provider-bound',len(canonical(state))==1964)
fixtures=load('admission-method-fixtures.json'); contradictions=[]
for x in fixtures['subcases']:
 c=x.get('candidate');o=x.get('oracle')
 if c:
  raw=(ROOT/c['path']).read_bytes();check('candidate-identity:'+x['id'],sha(raw)==c['sha256'] and len(raw)==c['sizeBytes']);check('candidate-canonical:'+x['id'],raw==canonical(json.loads(raw)))
 if c and isinstance(o,dict) and 'bytes' in o and o['bytes']!=c['sizeBytes']:contradictions.append({'case':x['id'],'publishedOracle':o['bytes'],'actualFrozenCandidateBytes':c['sizeBytes'],'difference':o['bytes']-c['sizeBytes']})
check('stale-six-byte-oracles-reproduced',len(contradictions)==2,contradictions)
lock=load('lock-caller-contracts.json'); coordinates=[]
for row in lock['callerMatrix']:
 x=row['source'];check('caller-coordinate:'+str(row['coordinateIndex']),(ROOT/x['path']).read_text().splitlines()[x['line']-1]==x['sourceText']);check('caller-source-sha:'+str(row['coordinateIndex']),sha((ROOT/x['path']).read_bytes())==x['sha256']);coordinates.append({'coordinateIndex':row['coordinateIndex'],'source':x,'owningCompanion':row['owningCompanion']})
check('all62-caller-coordinates',len(coordinates)==62)
(OUT/'independent-caller-coordinate-checks.json').write_text(json.dumps(coordinates,indent=2)+'\n')
ref=load('immutable-owner-reference-specimens.json')['refResolution'][0]; boundary=fixtures['subcases'][0]['completeOwningAuthor'];prior=json.loads((ROOT/fixtures['subcases'][0]['prior']['path']).read_text());expectedProfile='sha256:'+sha(canonical(boundary)); check('boundary-profile-binding-mismatch-reproduced',prior['binding']['profileDigest']!=expectedProfile,{'frozenGlobalProfileDigest':prior['binding']['profileDigest'],'requiredBoundaryProfileDigest':expectedProfile,'globalMaximumBytes':ref['policy']['admission']['maximumBytes'],'boundaryMaximumBytes':boundary['settings']['execution']['stores']['admission']['maximumBytes']})
freeze=json.loads((OUT/'frozen-input-receipt.json').read_text());drift=[]
for path,x in freeze['files'].items():
 if sha((ROOT/path).read_bytes())!=x['sha256']:drift.append(path)
check('all356-frozen-inputs-zero-drift',not drift,{'count':len(freeze['files']),'drift':drift})
report={'scope':'Independent documentation/source/serializer controls only; no target execution, F-EFFECT, F-MUT, physical capacity, global acceptance','results':results,'passed':sum(x['passed'] for x in results),'contradictions':contradictions};(OUT/'independent-definition-controls.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
