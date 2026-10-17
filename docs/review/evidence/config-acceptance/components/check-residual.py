import pathlib,json,hashlib,subprocess,collections
p=pathlib.Path('docs/review/evidence/config-acceptance/components');d=json.loads((p/'residual-fragment.json').read_text());ids=[r['id'] for r in d['rows']];cases={c['id']:c for c in d['cases']};assert len(ids)==len(set(ids));assert len(cases)==len(d['cases'])
required=['id','owner','instanceScope','profileScope','class','source','currentValue','default','precedence','type','unit','supportedDomain','reader','schema','validationErrorContract','targetAuthorRef','activationScope','recoveryRetryClaimDeadlineBudgetEffects','profileEvalSuitability','migrationAction','requirementIds','caseIds','verifiedSourceEvidence','status']
for r in d['rows']:
 assert not set(required)-r.keys(),r['id'];assert all(i in cases for i in r['caseIds']),r['id']
for s in d['sources']:assert hashlib.sha256(pathlib.Path(s['path']).read_bytes()).hexdigest()==s['sha256'],s['path']
for u in d['caseRefinements']:
 assert u['sourceFieldExpressions'];assert hashlib.sha256(pathlib.Path(u['exactProductiveBoundary']).read_bytes()).hexdigest()==u['sourceDigest']
assert len(d['caseRefinements'])==148;assert len(d['apiFieldDispositions'])==173 and len(d['cliFieldDispositions'])==9
for s in d['schemaFieldDispositions']:
 assert s['currentAuthorityReason'];assert s['actualProducerAndConsumerChain']
 for f,h in s['sourceDigests'].items():assert hashlib.sha256(pathlib.Path(f).read_bytes()).hexdigest()==h,f
for name in ['profile-definition-validation.log','refined-profile-definition-validation.log','refined-profile-definition-icd-corrected.log']:
 v=json.loads((p/name).read_text());assert v['passed']==296 and v['failed']==0
 for f,h in v['identities']['files'].items():
  actual=p/'historical-refined-case-profiles-a07de567.json' if name=='refined-profile-definition-validation.log' and f==str(p/'refined-case-profiles.json') else pathlib.Path(f)
  assert hashlib.sha256(actual.read_bytes()).hexdigest()==h,(name,f)
print('COMMAND: python docs/review/evidence/config-acceptance/components/check-residual.py')
print('HEAD',subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip());print('rows',len(ids),'cases',len(cases),'sources',len(d['sources']),'classes',dict(collections.Counter(r['class'] for r in d['rows'])));print('All subset integrity/source-definition checks passed; global C0 NOT PASSED.')
print('stable checkpoint diff:',subprocess.check_output(['git','diff','--name-only','--','docs/review/evidence/config-acceptance/components/semantic-fragment.json','docs/review/evidence/config-acceptance/components/case-profiles.json'],text=True).strip() or '(unchanged)')
for f in sorted(p.iterdir()):
 if f.is_file() and f.name!='residual-check.log':print('SHA256',f.name,hashlib.sha256(f.read_bytes()).hexdigest(),f.stat().st_size)
