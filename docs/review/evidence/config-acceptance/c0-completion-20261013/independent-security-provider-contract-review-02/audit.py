import json,pathlib
B=pathlib.Path('docs/review/evidence/config-acceptance/c0-completion-20261013');C=B/'security-provider-contracts-02';D=B/'security-provider-contracts-01';R=B/'independent-security-provider-contract-review-02'
read=lambda p:json.loads(pathlib.Path(p).read_text())
def pointed(ref):
 p,ptr=ref.split('#',1);v=read(p)
 for k in ptr.strip('/').split('/'):v=v[int(k)] if isinstance(v,list) else v[k.replace('~1','/').replace('~0','~')]
 return v
n=read(C/'normative-correction-generation.json');fields={r['id']:r for r in read(D/'field-definitions.json')['rows']};cases={r['id']:r for r in read(D/'case-definitions.json')['cases']}
audit={'normativeBaseExact':n['base']==str(D),'normativeFields':len(n['activeFields']),'allNormativeFieldRefsAndSchemaBindingsExact':all(pointed(r['baseFieldRef'])==fields[r['id']] and r['schemaBinding']==fields[r['id']]['targetSchemaBinding'] for r in n['activeFields']),'normativeCases':len(n['originalCases']),'allNormativeCaseRefsExact':all(pointed(r['baseCaseRef'])==cases[r['id']] and r['futureStatus']=='not-run' for r in n['originalCases']),'03ProviderArmsUnchanged':read(D/'schemas/provider-configuration.v2.schema.json')['oneOf'][:3]==read(B/'runtime-provider-contracts-03/schemas/provider-configuration.v2.schema.json')['oneOf'],'wholeEntryClosures':len(read(C/'whole-entry-receiving-closures.json')['entries']),'scope':'Exact captured HTTP/TLS fixture stand identity only, not universal Buster domain or physical source/grant/trust/namespace/producer admission'}
(R/'normative-join-audit.json').write_text(json.dumps(audit,indent=2)+'\n');print(json.dumps(audit))
