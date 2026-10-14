import json,hashlib,copy
from pathlib import Path
O=Path('docs/review/evidence/config-acceptance/c0-completion-20261013/security-provider-contracts-01');read=lambda p:json.loads(Path(p).read_text());sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
def write(n,x):(O/n).write_text(json.dumps(x,indent=2)+'\n')
schemaPath=O/'schemas/provider-configuration.v2.schema.json';schema=read(schemaPath);owner=read(O/'config/plugins/kubeclaw.security-providers.config.json');manifest=read('skills/buster/plugins/security-providers/plugin.json');contractBy={d['id']:d['contractId'] for d in manifest['testProviders']};fields=read(O/'field-definitions.json');index=[]
for f in fields['rows']:
 b=f['targetSchemaBinding'];common=f['classification']=='shared owned verdict processing';regs=list(contractBy) if common else [f['provider']];refs=[]
 for reg in regs:
  arm=next(i for i,a in enumerate(schema['oneOf']) if a['properties']['contractId']['const']==contractBy[reg]);prefix=f'/oneOf/{arm}/properties/'
  if f['classification']=='task intent':p=prefix+'values'+b['pointer']
  elif common:p=prefix+'selectedPolicy'+b['pointer'].replace('/properties/profiles/additionalProperties','')
  else:p=prefix+'selectedPolicy'+b['pointer'].replace('/properties/profiles/additionalProperties/properties/registrations/properties/'+reg,'')
  n=schema
  for part in p.strip('/').split('/'):n=n[int(part)] if isinstance(n,list) else n[part]
  assert n==b['exactNode'],(f['id'],p)
  refs.append({'registrationId':owner['packageId']+':'+reg,'path':str(schemaPath),'sha256':sha(schemaPath),'pointer':p,'exactNode':copy.deepcopy(n)})
 item={'id':f['id'],'ownerSchemaBinding':copy.deepcopy(b),'receivingSchemaBindings':refs,'rootSchema':{'path':str(O/'schemas/pipeline-entry.schema.json'),'sha256':sha(O/'schemas/pipeline-entry.schema.json')},'packageIdentity':'source-package-binding.json','normativeGeneration':'security-provider-contracts-01/pipeline-entry.v5/provider-configuration.v2','wholePackageInstance':owner['instanceId'],'sourceOracles':'original-member-oracle-contracts.json#'+f['id']};index.append(item);f['schemaGenerationConcordanceRef']='active-concordance-index.json#'+f['id']
write('field-definitions.json',fields);write('active-concordance-index.json',index);by={f['id']:f for f in fields['rows']};cases=read(O/'case-definitions.json')
for c in cases['cases']:
 for m in c['perMemberFieldContracts']:m['schemaGenerationConcordanceRef']=by[m['settingId']]['schemaGenerationConcordanceRef'];m['sourceOracleRef']=by[m['settingId']]['sourceOracleRef']
write('case-definitions.json',cases)
print(json.dumps({'fields':len(index),'physicallyResolvedReceiverNodes':sum(len(i['receivingSchemaBindings']) for i in index),'sharedVerdictRegistrations':5}))
