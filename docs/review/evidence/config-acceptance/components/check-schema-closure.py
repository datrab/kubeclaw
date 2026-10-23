import pathlib,json,hashlib
O=pathlib.Path('docs/review/evidence/config-acceptance/components');d=json.loads((O/'schema-semantic-closure.json').read_text());r=json.loads((O/'residual-fragment.json').read_text());v=json.loads((O/'schema-definition-validation-attempt4.log').read_text())
keys=lambda rows:{(x['path'],x['definition'],x['field']) for x in rows}
assert keys(d['rows'])==keys(r['schemaFieldDispositions']);assert len(keys(d['rows']))==len(d['rows']);assert len({x['id'] for x in d['rows']})==len(d['rows']);assert len({x['id'] for x in d['cases']})==len(d['cases'])
cases={c['id'] for c in d['cases']}
for x in d['rows']:
 assert set(x['caseIds'])<=cases
 assert set(x['taskContracts'])<=d['roles'].keys()
 assert x['exactProductiveProducer'] and x['actualConsumerBoundary'] and x['fieldDispositionReason']
 assert hashlib.sha256(pathlib.Path(x['path']).read_bytes()).hexdigest()==x['schemaSha256']
for source in d['sources']:assert hashlib.sha256(pathlib.Path(source['path']).read_bytes()).hexdigest()==source['sha256']
for f,h in v['identities']['files'].items():assert hashlib.sha256(pathlib.Path(f).read_bytes()).hexdigest()==h,f
assert v['failed']==0 and v['passed']==25
assert all(c['actualResult']=='passed' and c['reviewerConfirmation'].startswith('pending') for c in d['cases'])
assert len({g['id'] for g in r['gaps']})==len(r['gaps'])
print('Command: python3 docs/review/evidence/config-acceptance/components/check-schema-closure.py')
print('Exact schema coordinate, role/source/digest/case integrity and25 actual source-definition check records verified. No database/kernel/service/effect execution, no independent reviewer acceptance, global C0 NOT PASSED.')
