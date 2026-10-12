import json,pathlib,hashlib,subprocess,collections
O=pathlib.Path('docs/review/evidence/config-acceptance/components');read=lambda f:json.loads((O/f).read_text());sha=lambda f:hashlib.sha256(pathlib.Path(f).read_bytes()).hexdigest();checks=[]
def check(name,predicate):
 assert predicate,name;checks.append(name)
r=read('residual-fragment.json');hist=read('historical-case-specifications-40cf24.json');git=json.loads(subprocess.check_output(['git','show',hist['checkpoint']+':'+str(O/'residual-fragment.json')],text=True));check('Exact immutable219case49row checkpoint, no working snapshot relabelling',hist['cases']==git['cases'] and len(hist['cases'])==219 and len(git['rows'])==49)
cs={c['id']:c for c in r['cases']};check('Unique residual case IDs',len(cs)==len(r['cases']));spec=read('active-case-specifications.json')['cases'];si={c['caseId']:c for c in spec};check('Unique active specs and exact residual+148refinement roster',len(si)==len(spec) and set(si)=={c['id'] for c in r['cases'] if c['lifecycle']['state']=='active'}|{u['replacementForCaseId'] for u in r['caseRefinements']})
for c in r['cases']:
 life=c['lifecycle'];check('Lifecycle '+c['id'],life['state'] in ['active','historical','superseded'] and (life['state']=='active')==life['required'])
 for nxt in life['supersededBy']:check('Replacement exists active '+c['id'],nxt in cs and cs[nxt]['lifecycle']['state']=='active')
for s in spec:
 inv=s['invocation'];check('Complete command/boundary/input/prior/action/oracle '+s['caseId'],all(s.get(k) for k in ['exactCommand','boundary','input','priorState','action','oracles']) and isinstance(inv['argv'],list) and inv['argv'] and all(isinstance(x,str) for x in inv['argv']) and inv['requiredCollection']['countMustBePositive'] and inv['requiredCollection']['skippedTimedoutSetupFailureNeverPass'])
 if s['oracles']['result']=='not-run':check('Future invocation honest prerequisite '+s['caseId'],bool(inv['prerequisites']) and inv['environment']['CONFIG_ACCEPTANCE_CASE_ID']==s['caseId'])
for oldcase in hist['cases']:
 current=cs[oldcase['id']];dest=[current] if current['lifecycle']['state']=='active' else [cs[q] for q in current['lifecycle']['supersededBy']]
 check('Per original case requirement preservation '+oldcase['id'],set(oldcase['requirementIds'])<=set(q for c in dest for q in c['requirementIds']))
orig=set(q for c in hist['cases'] for q in c['requirementIds']);active=set(q for c in r['cases'] if c['lifecycle']['state']=='active' for q in c['requirementIds']);check('Every original requirement preserved without scope reduction',orig<=active and not r['caseLifecycleSummary']['scopeReduction'])
pairs=read('core-adjustable-profiles.json');core=[x for x in r['rows'] if x['owner']=='worker-core' and x['class']=='operator-setting'];check('13 exact adjustable complete six-owner A/B pairs',len(core)==13 and set(pairs)=={x['id'] for x in core})
for x in core:
 p=pairs[x['id']];d=x['supportedDomain']['proposedValidatorDomain'];check('Material delta '+x['id'],p['delta']['A']!=p['delta']['B'] and set(p['A'])==set(p['B']) and len(p['A'])==6 and 'const' not in d)
 if d['type']=='integer':check('Non singleton justified bounded domain '+x['id'],len(d['enum'])>1 if 'enum' in d else d['minimum']<d['maximum'])
 check('Active primary has no contradictory finite case '+x['id'],all(cs[c]['lifecycle']['state']!='superseded' for c in x['caseIds']))
ret=r['retentionCallerDispositions'];check('Exact six real retention caller map',len(ret)==6 and sum(v['current'] for v in ret.values())==2 and all(pathlib.Path(v['caller']).is_file() and sha(v['caller'])==v['sourceSha256'] for v in ret.values()))
extra=read('additional-schema-closure.json');count=collections.Counter(x['definition'] for x in extra['rows']);check('75 exact six-root coordinate roster',len(extra['rows'])==75 and sorted(count.values())==[7,9,12,13,13,21]);check('55 productive-path/20public contract only',sum(v for k,v in count.items() if k not in ['workerTrustEnvelope','workerCancellationRequest'])==55)
err=json.loads(pathlib.Path('docs/review/evidence/config-acceptance/independent-core-domain/erratum-six-roots.json').read_text());coord=lambda x:(x['path'],x['definition'],x['field']);check('Exact coordinate/domain set matches independent erratum, not just count',{coord(x) for x in extra['rows']}=={coord(x) for x in err['fields']} and all(next(q['domain'] for q in err['fields'] if coord(q)==coord(x))==x['resolvedDomain'] for x in extra['rows']))
for x in extra['rows']:
 check('Per coordinate real chain/source '+x['id'],all(pathlib.Path(p).is_file() and sha(p)==h for p,h in x['sourceDigests'].items()) and bool(x['currentAuthorityReason']) and bool(x['actualProducerAndConsumerChain']))
for name,passed in [('adjustable-core-profile-definitions.log',26),('adjustable-source-controls.log',9),('refined-profile-definition-icd-corrected.log',296)]:
 v=read(name);check('Raw actual scoped positive receipt '+name,v['passed']==passed and v['failed']==0)
 for f,h in v['identities']['files'].items():check('Raw receipt source/input identity '+name+' '+f,sha(f)==h)
for name in ['profile-definition-validation.log','refined-profile-definition-validation.log']:
 v=read(name)
 for f,h in v['identities']['files'].items():
  actual=O/'historical-refined-case-profiles-a07de567.json' if name=='refined-profile-definition-validation.log' and f==str(O/'refined-case-profiles.json') else pathlib.Path(f)
  check('Historical receipt preserved identity '+name+' '+f,sha(actual)==h)
for s in r['sources']:check('Residual source identity '+s['path'],sha(s['path'])==s['sha256'])
check('Semantic checkpoint unchanged',not subprocess.check_output(['git','diff','--name-only','--',str(O/'semantic-fragment.json'),str(O/'case-profiles.json')],text=True).strip())
print(json.dumps({'command':'python3 '+str(O/'check-icd-corrections.py'),'scope':'C0 correction integrity only, not independent semantic approval or acceptance','passedChecks':len(checks),'failed':0,'counts':{'coreAdjustablePolicies':13,'additionalCoordinates':75,'productivePath':55,'publicContractOnly':20,'activeSpecifications':len(spec),'residualLifecycle':dict(collections.Counter(c['lifecycle']['state'] for c in r['cases']))},'checks':checks,'acceptance':'NOT ACCEPTED; independent material recheck pending'},indent=2))
