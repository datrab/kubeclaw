import json,pathlib,hashlib,collections,argparse
O=pathlib.Path(__file__).parent;read=lambda p:json.loads(pathlib.Path(p).read_text());sha=lambda p:hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest();parser=argparse.ArgumentParser();parser.add_argument('--candidates',default=str(O/'candidate-dispositions.json'));args=parser.parse_args();d=read(args.candidates);before=read(O/'checkpoint-inputs.json');sources=read(O/'source-dispositions-final.json')['sources'];questions={q['id']:q for q in read(O/'source-open-obligations.json')['questions']};checks=[]
def check(name,condition):assert condition,name;checks.append(name)
check('Unique exact discovery marker IDs',[c['id'] for c in d['candidates']]==list(dict.fromkeys(c['id'] for c in d['candidates'])))
check('Exact all1353marker roster, originalsource/line/digest/kinds conserved',{c['id'] for c in d['candidates']}=={c['id'] for c in before['candidates']})
byold={c['id']:c for c in before['candidates']};check('Every173source including23no-marker represented exactly',len(sources)==173 and {s['path'] for s in sources}==set(before['scopePaths']));check('All39Core actual sourcefiles assignedscopecomplete',{str(p) for p in pathlib.Path('skills/worker/core/worker').glob('*') if p.suffix in ['.ts','.c']}<=set(before['scopePaths']))
validStatuses={'individual-existing-disposition-linked','manually-source-disposed','upstream-current-producer-handoff','uncovered-source-obligation','generated-assignment-source-disposed'}
for c in d['candidates']:
 old=byold[c['id']];check('Discovery coordinate preserved '+c['id'],all(c[k]==old[k] for k in ['source','line','sourceSha256','kinds']))
 text=pathlib.Path(c['source']).read_text().splitlines()[c['line']-1];check('Exact line/digest valid '+c['id'],sha(c['source'])==c['sourceSha256'] and text==c['exactText']);check('No lexical/sample/autopass/unclassified marker '+c['id'],c['status'] in validStatuses and bool(c['reason']))
 if c['status']=='individual-existing-disposition-linked':check('Exact individual existingmember/source evidence '+c['id'],bool(c['existingReferences']))
 if c['status']=='manually-source-disposed':
  ref=c['manualDispositionRef'];file,pointer=ref.split('#/dispositions/');item=read(file)['dispositions'][int(pointer)];check('Resolvable manualcandidate evidence '+c['id'],item['candidateId']==c['id'] and item['source']==c['source'] and item['line']==c['line'] and item['sourceSha256']==c['sourceSha256'] and item['reason']==c['reason'])
 if c['status']=='uncovered-source-obligation':check('Exact named gap ratherthan genericbucket '+c['id'],c.get('sourceQuestionId') in questions)
 if c['status']=='upstream-current-producer-handoff':check('Verified field-specific upstreamhandoff '+c['id'],c['upstreamDispositionId'] in {x['id'] for x in read(O/'upstream-delivery-provisioning-snapshot.json')['records']})
for s in sources:check('Per-source candidateroaster complete '+s['path'],set(s['markerCandidateIds'])=={c['id'] for c in d['candidates'] if c['source']==s['path']} and sha(s['path'])==s['sha256'])
for p,h in before['inputs'].items():check('Independently verifiedcheckpoint5 input unchanged '+p,sha(p)==h)
defs=read(O/'parameter-default-dispositions.json')['members'];check('All50ASTdefaults individually disposed',len(defs)==50 and all(x['reason'] and x['proof'] and x['owner'] and x['parameter'] for x in defs));check('NativeCLI9 preserved exact oldfielddispositions',read(O/'native-cli-dispositions.json')['fields']==read(O.parent/'residual-fragment.json')['cliFieldDispositions']);check('RealENV45TS+1C separatelyfrom87lexicalhits',len(read(O/'environment-read-dispositions.json')['actualReadsites'])==46)
for q in questions.values():
 for s in q['sourceEvidence']:
  check('Gap sourcebytes preserved '+q['id']+' '+s['path'],sha(s['path'])==s['sha256']);check('Gap exact sourceclauses '+q['id']+' '+s['path'],all(pathlib.Path(s['path']).read_text().splitlines()[x['line']-1]==x['text'] for x in s['lines']))
raw=read(O/'foundation-source-controls-attempt1.log');check('Actual3narrow realstoragecontrols nofail',raw['passed']==3 and raw['failed']==0)
for p,h in raw['identities'].items():check('Realcontrol dependency/sourceidentity '+p,sha(p)==h)
print(json.dumps({'command':'python3 '+str(O/'check-source-freeze.py'),'scope':'Doc/sourceintegrity, roster/identity/conservation ONLY, no semantic fullC0/runtime acceptance','passedChecks':len(checks),'failed':0,'markers':len(d['candidates']),'sourceFiles':len(sources),'exactOpenQuestions':len(questions),'counts':dict(collections.Counter(c['status'] for c in d['candidates'])),'acceptance':'NOT ACCEPTED; independent fullsource review and namedowner/domain/case closure required'},indent=2))
