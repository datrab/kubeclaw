from pathlib import Path
import json,hashlib,argparse
b=Path(__file__).parent;o=b.parent/'question-closure-bce3f075';a=argparse.ArgumentParser();a.add_argument('--cases',type=Path,default=b/'question-case-specs.json');a.add_argument('--environment',type=Path,default=b/'computed-environment-supersession.json');args=a.parse_args();j=lambda p:json.loads(Path(p).read_text());sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest();checks=[]
def check(id,ok):
 checks.append({'id':id,'passed':bool(ok)})
 if not ok:raise AssertionError(id)
try:
 history=j(b/'historical-input-identities.json');
 for p,d in history['inputs'].items():check('immutable-original:'+p,sha(p)==d)
 for p,d in history['protectedOriginalBaseline']['protectedCorrections'].items():check('protected-Core13:'+p,sha(p)==d)
 old=j(o/'question-definitions.json')['questions'];new=j(b/'question-definitions.json')['questions'];check('all14-original-questions',len(old)==len(new)==14 and {x['id'] for x in old}=={x['id'] for x in new});check('no-duplicate-questions',len({x['id'] for x in new})==len(new))
 oldcases=j(o/'question-case-specs.json')['activeCases'];cases=j(args.cases)['activeCases'];check('unique-active-case-ids',len({x['id'] for x in cases})==len(cases));check('all22-original-cases',len(cases)==len(oldcases)==22 and {x['id'] for x in cases}=={x['id'] for x in oldcases});by={x['id']:x for x in oldcases}
 for c in cases:
  check('preserved-requirements:'+c['id'],c['requirements']==by[c['id']]['requirements']);check('future-not-run:'+c['id'],'not-run' in c['implementationStatus']);check('exact-new-harness:'+c['id'],c['invocation']['argv'][0]=='docs/review/evidence/config-acceptance/components/icq-corrections-20261013/future-question-harness.mjs');check('preserved-original-case-lifecycle:'+c['id'],c['lifecycle']['originalRequirementsPreserved'] is True)
 env=j(args.environment)['literalCallerExpansions'];check('six-computed-environment-callers',len(env)==6);check('distinct-envnames',len({x['name'] for x in env})==6)
 for x in env:
  p=x['reader']['path'];check('actual-env-coordinate:'+x['name'],Path(p).read_text().splitlines()[x['reader']['line']-1]==x['reader']['text']);check('actual-env-source:'+x['name'],sha(p)==x['reader']['sha256'])
 check('all6-findings-covered',{x['id'] for x in j(b/'correction-ledger.json')['findings']}=={'ICQ-01','ICQ-02','ICQ-03','ICQ-04','ICQ-05','ICQ-06'})
 # All active document refs must point to matching current/frozen identities. No repaired hashes for historicalsources.
 def refs(x):
  if isinstance(x,dict):
   if isinstance(x.get('path'),str) and isinstance(x.get('sha256'),str) and Path(x['path']).is_file():check('exact-referenced-identity:'+x['path'],sha(x['path'])==x['sha256'])
   for y in x.values():refs(y)
  elif isinstance(x,list):
   for y in x:refs(y)
 for f in ['question-case-specs.json','admission-method-fixtures.json','lock-caller-contracts.json','provider-provenance-contract.json','retirement-method-fixtures.json','outbox-method-fixtures.json']:refs(j(b/f))
 print(json.dumps({'passed':len(checks),'failed':0,'scope':'Documentation/history/coordinate/case integrity only, not semantic independentreview/F-MUT or runtimeacceptance'}))
except Exception as e:
 print(json.dumps({'passed':sum(x['passed'] for x in checks),'failed':1,'error':str(e),'scope':'Documentation integrity negative, not F-MUT'}));raise SystemExit(1)
