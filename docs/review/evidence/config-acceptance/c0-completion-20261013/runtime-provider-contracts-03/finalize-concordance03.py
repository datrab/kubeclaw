import json,copy,hashlib
from pathlib import Path
O=Path('docs/review/evidence/config-acceptance/c0-completion-20261013/runtime-provider-contracts-03');read=lambda p:json.loads(Path(p).read_text());sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
def write(name,x):(O/name).write_text(json.dumps(x,indent=2)+'\n')
integrated=read(O/'c3-integrated-reference-generation.json');schema=read(O/'schemas/provider-configuration.v2.schema.json');hs={'type':'string','pattern':'^sha256:[a-f0-9]{64}$'}
for arm in schema['oneOf']:
 b=arm['properties']['selectedPolicy']['properties']['binding']
 for f in ['c3RuntimeSchemaDigest','c3ReferenceContractDigest']:
  if f not in b['required']:b['required'].append(f)
  b['properties'][f]=copy.deepcopy(hs)
write('schemas/provider-configuration.v2.schema.json',schema)
for item in read(O/'generated-view-index.json'):
 d=read(O/item['path']);d['selectedPolicy']['binding'].update(c3RuntimeSchemaDigest='sha256:'+integrated['activeRuntimeSchema']['sha256'],c3ReferenceContractDigest='sha256:'+integrated['activeReferenceContract']['sha256']);write(item['path'],d)
nova=read(O/'schemas/kubeclaw.network-http.schema.json')['properties']['profiles']['additionalProperties']['properties']['processing'];write('schemas/nova-adapter-processing.schema.json',nova)
fields=read(O/'field-definitions.json');index=[];packageBindings=read(O/'package-binding-identities.json')
for field in fields['rows']:
 field.pop('activeSchemaIdentity',None);b=field['targetSchemaBinding'];pkg=field['originalRow']['owner'];ownerPath=O/f'schemas/{pkg}.schema.json';rootPath=O/'schemas/pipeline-entry.schema.json';owner=read(O/f'config/plugins/{pkg}.config.json')
 if pkg=='kubeclaw.network-http':
  receiving=O/'schemas/nova-adapter-processing.schema.json';ptr=b['pointer'].replace('/properties/profiles/additionalProperties/properties/processing','')
 else:
  receiving=O/'schemas/provider-configuration.v2.schema.json';armIndex=next(i for i,a in enumerate(schema['oneOf']) if a['properties']['contractId']['const']=='kubeclaw.'+pkg.split('.')[-1]+'@1')
  if b['path'].endswith('.task.schema.json'):ptr=f'/oneOf/{armIndex}/properties/values'+b['pointer']
  else:ptr=f'/oneOf/{armIndex}/properties/selectedPolicy'+b['pointer'].replace('/properties/profiles/additionalProperties','')
 node=read(receiving)
 for part in ptr.strip('/').split('/'):node=node[int(part)] if isinstance(node,list) else node[part.replace('~1','/').replace('~0','~')]
 assert node==b['exactNode'],field['id']
 entry={'id':field['id'],'packageId':pkg,'registrationId':owner['registrationId'],'normativeGeneration':'runtime-provider-contracts-03/pipeline-entry.v5','fieldSchemaRef':copy.deepcopy(b),'receivingSchemaRef':{'path':str(receiving),'sha256':sha(receiving),'pointer':ptr,'exactNode':node},'completeOwnerSchemaRef':{'path':str(ownerPath),'sha256':sha(ownerPath)},'rootSchemaRef':{'path':str(rootPath),'sha256':sha(rootPath)},'packageIdentity':next(p for p in packageBindings if p['packageId']==pkg),'wholeProfileIndex':'profile-index.json','taskPairs':'task-pair-index.json','rootSelection':'config/pipeline.config.json','C3ReceivingReference':'c3-integrated-reference-generation.json' if pkg!='kubeclaw.network-http' else None,'qualification':'One current physical field/receiving node; exact package/owner/root schema generation, source-supported defaults/domains and immutable history retained; not installed/runtime acceptance'}
 index.append(entry);field['schemaGenerationConcordanceRef']='active-concordance-index.json#'+field['id']
write('field-definitions.json',fields);write('active-concordance-index.json',index)
cases=read(O/'case-definitions.json')
for c in cases['cases']:
 for m in c.get('perMemberFieldContracts',[]):m['schemaGenerationConcordanceRef']='active-concordance-index.json#'+m['settingId']
write('case-definitions.json',cases)
print(json.dumps({'physicallyResolvedFieldAndReceiverNodes':len(index),'activeMemberReferences':sum(len(c.get('perMemberFieldContracts',[])) for c in cases['cases']),'C3DigestsCarried':3}))
