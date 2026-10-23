import json,pathlib,hashlib
O=pathlib.Path('docs/review/evidence/config-acceptance/components');d=json.loads((O/'core-policy-domain-closure.json').read_text());r=json.loads((O/'residual-fragment.json').read_text());v=json.loads((O/'core-domain-definition-attempt2.log').read_text());ids={x['id'] for x in r['rows']};cases={c['id'] for c in r['cases']}
assert len(d['rows'])==13
assert sum(x['supportedDomain']['proposedValidatorDomain'].get('type')=='integer' for x in d['rows'])==12
for x in d['rows']:
 assert x['id'] in ids;domain=x['supportedDomain']['proposedValidatorDomain'];assert domain==({'type':'integer','const':x['currentValue']} if x['id']!='CMP-WCORE-RETAIN-LOGS' else {'type':'boolean','enum':[True,False]})
 assert x['candidateDispositions'] and x['reader']['productiveCallerChain'];assert all(c in cases for c in x['caseIds']);assert all(c in cases for c in x['relatedC0CaseIds'])
 for a in x['candidateDispositions']:assert hashlib.sha256(pathlib.Path(a['path']).read_bytes()).hexdigest()==a['sha256']
for s in d['sources']:assert hashlib.sha256(pathlib.Path(s['path']).read_bytes()).hexdigest()==s['sha256']
for f,h in v['identities']['files'].items():assert hashlib.sha256(pathlib.Path(f).read_bytes()).hexdigest()==h
assert v['passed']==24 and v['failed']==0
assert all(c['id'] in cases for c in d['cases'])
old=json.loads((O/'core-domain-definition-attempt1.log').read_text());snapshot=O/'core-domain-definition-attempt1-script.snapshot.mjs';assert hashlib.sha256(snapshot.read_bytes()).hexdigest()==old['identities']['testDigests']['docs/review/evidence/config-acceptance/components/check-core-domain-definition.mjs'];assert old['passed']==23 and old['failed']==1
assert not any(g['id'] in ['CMP-WCORE-POLICY-DOMAINS','CMP-WCORE-LOCK-WIDTH-DOMAIN'] for g in r['gaps'])
print('Command: python3 docs/review/evidence/config-acceptance/components/check-core-domain-closure.py')
print('Exact13finite domains/candidate/source/case links and24actual definitions verified; original failed control+script retained; wider policy tuning/runtime EFFECT/fresh review/global C0 NOT accepted.')
