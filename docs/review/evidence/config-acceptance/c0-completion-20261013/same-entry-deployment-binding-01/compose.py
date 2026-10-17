import pathlib,json,hashlib,gzip,copy,datetime,shutil
ROOT=pathlib.Path('/home/node/.openclaw/workspace/kubeclaw-config-c0'); B=ROOT/'docs/review/evidence/config-acceptance/c0-completion-20261013'; OUT=B/'same-entry-deployment-binding-01'
P=B/'runtime-provider-contracts-03';R=B/'recovery-policy-profile-02';C=B/'controller-role-profile-02';C1=B/'controller-role-profile-01'
def load(p):return json.loads(p.read_text())
def h(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def write(n,d):
 p=OUT/n;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(d,indent=2,ensure_ascii=False)+'\n')
pins={}
def freeze(p):
 key=str(p.relative_to(ROOT));data=p.read_bytes();sha=hashlib.sha256(data).hexdigest();target=OUT/'frozen-inputs'/f'{sha}.gz';target.parent.mkdir(exist_ok=True);target.write_bytes(gzip.compress(data,mtime=0));pins[key]={'path':key,'sha256':sha,'bytes':len(data),'snapshot':str(target.relative_to(OUT))}
def copyfile(p,n):
 freeze(p);target=OUT/n;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,target)
for folder in [C,R]:
 for p in folder.rglob('*'):
  if p.is_file() and not any(x in p.parts for x in ['frozen-inputs','history']) and p.stat().st_size<3000000:freeze(p)
for p in P.rglob('*'):
 if p.is_file() and (p.suffix in ['.md','.json'] or p.name.endswith('.schema.json')) and not any(x in p.parts for x in ['history','failed-attempt-01','task-fixtures']) and p.stat().st_size<2000000:freeze(p)
for name in ['independent-controller-role-profile-review-02/REPORT.md','independent-runtime-provider-contract-review-03/README.md','independent-c3-buster-complete-profile-review-03/README.md','provider-field-dependency-adoption-01/dependency-adoption.json','independent-provider-field-dependency-adoption-review-01/README.md'] :freeze(B/name)
for name in ['docs/review/remediation/config-semantic-inventory.json','docs/review/remediation/config-acceptance-matrix.json','scripts/deploy.sh','scripts/render-postgresql-recovery.mjs','scripts/postgresql-recovery.sh','cmd/buster-namespace-controller/main.go','charts/kubeclaw/templates/buster-namespace-controller.yaml','charts/kubeclaw/templates/buster-namespace-lease-crd.yaml','charts/kubeclaw/templates/_helpers.tpl','charts/kubeclaw/values.yaml','my-values/infra/postgresql-recovery.yaml','versions.json','node_modules/ajv/package.json','node_modules/ajv/dist/2020.js']:freeze(ROOT/name)
for p in (C1/'profiles').glob('*.json'):freeze(p)
freeze(C1/'controller-role-profiles.schema.json')
for p in (P/'config/components').glob('*.json'):copyfile(p,'stand/config/components/'+p.name)
for p in (P/'config/plugins').glob('*.json'):copyfile(p,'stand/config/plugins/'+p.name)
for p in (P/'schemas').rglob('*.json'):copyfile(p,'schemas/provider03/'+str(p.relative_to(P/'schemas')))
for p in (R/'schemas').glob('*.json'):copyfile(p,'schemas/recovery02/'+p.name)
copyfile(C1/'controller-role-profiles.schema.json','schemas/controller-profile.schema.json')
copyfile(R/'my-values/infra/postgresql-recovery.yaml','stand/my-values/infra/postgresql-recovery.yaml')
profiles={load(p)['profileId']:load(p) for p in sorted((C1/'profiles').glob('*.json'))}
write('stand/charts/kubeclaw/values.yaml',{'schemaVersion':'kubeclaw-controller-owner.v1','profiles':profiles})
profileSchema=load(C1/'controller-role-profiles.schema.json');profileSchema.pop('$id',None)
ownerSchema={'$schema':'https://json-schema.org/draft/2020-12/schema','type':'object','additionalProperties':False,'required':['schemaVersion','profiles'],'properties':{'schemaVersion':{'const':'kubeclaw-controller-owner.v1'},'profiles':{'type':'object','minProperties':1,'propertyNames':{'pattern':'^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'},'additionalProperties':profileSchema}}}
write('schemas/controller-owner.schema.json',ownerSchema)
schema=load(R/'schemas/pipeline-entry.schema.json');schema.pop('$id',None);schema['properties']['schemaVersion']={'const':'pipeline-entry.v6'}
strid={'type':'string','pattern':'^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'};profile={'type':'string','pattern':'^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'}
dp={'role':{'const':'buster'},'deploymentInstanceId':strid,'ownerPath':{'const':'charts/kubeclaw/values.yaml'},'profileId':profile,'consumer':{'const':'namespace-controller'},'serviceInstanceId':strid,'busterComponentInstanceId':strid,'controlComponentInstanceId':strid}
schema['required'].append('deploymentSelections');schema['properties']['deploymentSelections']={'type':'array','minItems':1,'items':{'type':'object','additionalProperties':False,'required':list(dp),'properties':dp}}
write('schemas/pipeline-entry.schema.json',schema)
entry=load(P/'config/pipeline.config.json');entry['schemaVersion']='pipeline-entry.v6';entry['infrastructureSelections']=load(R/'config/pipeline.config.json')['infrastructureSelections'];entry['deploymentSelections']=[{'role':'buster','deploymentInstanceId':'agent-buster','ownerPath':'charts/kubeclaw/values.yaml','profileId':'local-A','consumer':'namespace-controller','serviceInstanceId':'agent-buster-namespace-controller','busterComponentInstanceId':'fixture.service.buster-runtime','controlComponentInstanceId':'fixture.service.prism-control'}]
write('stand/config/pipeline.config.json',entry)
variants=[]
for profileId in profiles:
 e=copy.deepcopy(entry);e['deploymentSelections'][0]['profileId']=profileId;name='stands/controller-'+profileId+'.json';write(name,e);variants.append({'path':name,'kind':'controller','profileId':profileId,'sourceJoinEligible':profileId!='ready-product-off','reason':'ReadyProduct-off needs explicitly selected whole Control profile enabled=false, absent from frozen Provider03 owner; never fill from mutable newer owner' if profileId=='ready-product-off' else 'source shape relation only; authentic activation gates remain missing'})
for profileId in load(R/'my-values/infra/postgresql-recovery.yaml')['profiles']:
 e=copy.deepcopy(entry);e['infrastructureSelections'][0]['profileId']=profileId;name='stands/recovery-'+profileId+'.json';write(name,e);variants.append({'path':name,'kind':'recovery','profileId':profileId,'sourceJoinEligible':True})
write('stand-index.json',variants)
members=[]
for p in sorted((OUT/'stand').rglob('*')):
 if p.is_file():members.append({'relativePath':str(p.relative_to(OUT/'stand')),'sha256':h(p),'byteLength':p.stat().st_size,'transportClass':'image-baked-author-input','source':'stand is public definition only, no delivery authenticity'})
for p in sorted((OUT/'schemas').rglob('*.json')):members.append({'relativePath':str(p.relative_to(OUT)),'sha256':h(p),'byteLength':p.stat().st_size,'transportClass':'captured-schema-input'})
write('file-set-stand.json',{'schemaVersion':'same-entry-file-set.v1','root':'config/pipeline.config.json','members':members,'authentication':'PUBLIC UNSEALED SHAPE; physical/image/source/trust/external gates unavailable','scope':'six existing component owners, four reviewed runtime-provider owners, existing controller Chart branch and existing recovery infra owner; other operator roles unsupported here'})
body=load(ROOT/'docs/review/remediation/config-acceptance-matrix.json');ids={r['id']:r for r in body['cases']};fields=load(ROOT/'docs/review/remediation/config-semantic-inventory.json');inventory={r['id']:r for r in fields['rows']}
aliases=[]
for r in load(C/'original49-field-contracts.json')['fields']:aliases.append({'id':r['id'],'originalBody':r['originalRow'],'bodySha256':r['originalRowBodySha256'],'owner':'charts/kubeclaw/values.yaml','caseIds':r['originalCaseIds'],'primaryAlias':r['primaryAuthorAlias']})
cases={}
for a in aliases:
 for cid in a['caseIds']:
  if cid in ids:cases[cid]={'id':cid,'originalBody':ids[cid],'bodySha256':hashlib.sha256(json.dumps(ids[cid],sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest(),'futureResult':'not-run'}
for cid in ['CMP-C5-BIND','C5-COMPLETE-LEASE-LOSS','C5-COMPLETE-MUTATION']:
 if cid in ids:cases[cid]={'id':cid,'originalBody':ids[cid],'bodySha256':hashlib.sha256(json.dumps(ids[cid],sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest(),'futureResult':'not-run'}
write('original-alias-and-case-joins.json',{'controller49':aliases,'cases':list(cases.values()),'provider22CurrentMetadata':fields['currentProviderFieldAdoption'],'recoverySourceCasePackage':{'path':str((R/'case-definitions.json').relative_to(ROOT)),'sha256':h(R/'case-definitions.json'),'existingCanonicalRecoveryCase':'none claimed by recovery02; IFR26/full WCR05 remains open; source candidate IDs/23 pairs/phase oracles preserved as artifactSHA+JSONpointer, no invented IDs'},'sourceMemberCaseIDs':{'provider':{'path':str((P/'active-case-member-contracts.json').relative_to(ROOT)),'sha256':h(P/'active-case-member-contracts.json')} if (P/'active-case-member-contracts.json').exists() else {'reference':'active-concordance-index.json pins exact current provider original case members'},'recovery':'case-definitions.json#/fieldPairs and#/source81ClauseOracles plus correction-case-addendum.json','controller':'case-scenes.json#/scenes and original-case-refinements.json exact six originals'}})
write('read-identities.json',{'time':datetime.datetime.now(datetime.timezone.utc).isoformat(),'inputs':list(pins.values()),'noSecurityMutableLatestRead':True,'globalC0Accepted':False})
print(json.dumps({'pins':len(pins),'fileSetMembers':len(members),'completeControllerProfiles':len(profiles),'rootStands':len(variants),'originalControllerAliases':len(aliases),'exactOriginalCases':len(cases)}))
