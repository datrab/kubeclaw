import json,copy,hashlib,shutil,re
from pathlib import Path
B=Path('docs/review/evidence/config-acceptance/c0-completion-20261013');O=B/'security-provider-contracts-01';P=B/'runtime-provider-contracts-03';S=Path('skills/buster/plugins/security-providers');OLD=Path('docs/review/evidence/config-acceptance/runtime/batches/bce3f075-security-02')
read=lambda p:json.loads(Path(p).read_text());sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest();digest=lambda d:hashlib.sha256(json.dumps(d,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
def write(name,x):
 p=O/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(x,indent=2)+'\n')
def obj(props):return {'type':'object','additionalProperties':False,'required':list(props),'properties':props}
def integer(n,minimum=1):return {'type':'integer','minimum':minimum,'maximum':n}
def inline(node,defs):
 if isinstance(node,list):return [inline(n,defs) for n in node]
 if not isinstance(node,dict):return node
 if '$ref' in node:
  found={'$defs':defs}
  for part in node['$ref'][2:].split('/'):found=found[part]
  return inline(copy.deepcopy(found),defs)
 return {k:inline(v,defs) for k,v in node.items() if k not in ['$schema','$id','$defs','default']}
manifest=read(S/'plugin.json');decls={d['id']:d for d in manifest['testProviders']};schemaNames={'headers':'headers','dependency-trivy':'dependency','image-trivy':'image','kubernetes-policy':'kubernetes-policy','kubernetes-runtime':'kubernetes-runtime'};shortToReg={v:k for k,v in schemaNames.items()};originalSchemas={r:read(S/d['configSchema']) for r,d in decls.items()};currentInline={r:inline(s,s['$defs']) for r,s in originalSchemas.items()}
legacy=read(OLD/'contracts.json')['entries'];legacyBy={r['setting']:r for r in legacy};locators=read(B/'independent-whole-c0-readiness-review-01/runtime-residual-contract-groups.json')['groups']['kubeclaw.security-providers'];inventory={r['id']:r for r in read('docs/review/remediation/config-semantic-inventory.json')['rows']};canonical={c['id']:c for c in read('docs/review/remediation/config-acceptance-matrix.json')['cases']};native=read('docs/review/evidence/config-acceptance/runtime/case-proposals.json');native=native.get('cases',native) if isinstance(native,dict) else native;nativeBy={c['id']:c for c in native}
write('history/legacy-security02-contracts.json',read(OLD/'contracts.json'));write('history/legacy-security02-owned-controls.json',read(OLD/'owned-policy-controls.json'))
write('frozen-input-identities.json',{'qualification':'Read-only reviewed provider03 and security source definition history; no transitive approval','inputs':[{'path':str(p),'sha256':sha(p)} for directory in [P,OLD,B/'independent-runtime-provider-contract-review-03',B/'independent-c3-buster-complete-profile-review-03'] if directory.exists() for p in sorted(directory.rglob('*')) if p.is_file()]})
# Baseline is explicit complete author data, not a runtime default. Copy actual supported source presets.
nosniff={'id':'content-type-nosniff','header':'x-content-type-options','severity':'high','kind':'equals','value':'nosniff'}
api=[nosniff,{'id':'content-security-policy','header':'content-security-policy','severity':'high','kind':'present'},{'id':'referrer-policy','header':'referrer-policy','severity':'medium','kind':'present'},{'id':'permissions-policy','header':'permissions-policy','severity':'medium','kind':'present'}]
web=[{'id':'hsts','header':'strict-transport-security','severity':'high','kind':'hsts-min-age','value':'31536000'},*copy.deepcopy(api[:2]),{'id':'frame-options','header':'x-frame-options','severity':'medium','kind':'present'},*copy.deepcopy(api[2:])]
ruleSchema=copy.deepcopy(currentInline['headers']['properties']['rules']['properties']['add']['items']);ruleSchema['allOf']=[{'if':{'properties':{'kind':{'const':'present'}},'required':['kind']},'then':{'not':{'required':['value']}},'else':{'required':['value']}}]
policySchema=copy.deepcopy(currentInline['headers']['properties']['policy']);policySchema['required']=['profile','acceptances']
verdictSchema=obj({'blockingSeverities':{'type':'array','maxItems':5,'uniqueItems':True,'items':{'enum':['critical','high','medium','low','info']}},'blockActiveThreats':{'type':'boolean'},'blockMissingFixes':{'type':'boolean'}})
registrationProps={};taskSchemas={};base={'verdictPolicy':{'blockingSeverities':['critical','high'],'blockActiveThreats':True,'blockMissingFixes':True},'sharedProcessing':{'maximumFindings':4096},'registrations':{}}
for r,d in decls.items():
 props=copy.deepcopy(currentInline[r]['properties']);taskKeys=['paths'] if r=='headers' else (['projectDirectory'] if r=='dependency-trivy' else []);taskSchemas[r]=obj({k:props[k] for k in taskKeys});write(f'schemas/{r}.task.schema.json',taskSchemas[r])
 processing={k:v for k,v in props.items() if k not in taskKeys};processing['policy']=copy.deepcopy(policySchema)
 if r=='headers':
  processing['rules']=obj({'add':{'type':'array','maxItems':32,'items':ruleSchema},'replace':{'type':'array','maxItems':32,'items':ruleSchema},'remove':copy.deepcopy(props['rules']['properties']['remove'])})
  processing['presets']=obj({name:{'type':'array','minItems':1,'maxItems':64,'items':ruleSchema} for name in ['api-http-v1','web-https-v1']});processing['maximumResponseBytes']=integer(65536);processing['maximumPaths']=integer(32)
  bp={'profile':'api-http-v1','requestTimeoutMs':10000,'maximumResponseBytes':65536,'maximumPaths':32,'presets':{'api-http-v1':copy.deepcopy(api),'web-https-v1':copy.deepcopy(web)},'rules':{'add':[],'replace':[],'remove':[]},'policy':{'profile':'strict-v1','acceptances':[]}}
 else:bp={'timeoutMs':300000 if r in ['dependency-trivy','image-trivy'] else 120000,'policy':{'profile':'strict-v1','acceptances':[]}}
 # Headers manifest path is NOT task paths; current matrix expansion produces an invalid/unread key.
 matrix={'type':'array','maxItems':0,'items':{'type':'string'}}
 declarationSchema=obj({'retrySafe':{'type':'boolean'},'matrixFields':matrix,'evidenceDefaults':obj({k:{'type':'array','minItems':1,'maxItems':1,'uniqueItems':True,'items':{'const':'log'}} for k in ['onPass','onFail','onError']})})
 registrationProps[r]=obj({'processing':obj(processing),'declarations':declarationSchema});base['registrations'][r]={'processing':bp,'declarations':{'retrySafe':True,'matrixFields':[],'evidenceDefaults':copy.deepcopy(d['evidenceDefaults'])}}
profileSchema=obj({'verdictPolicy':verdictSchema,'sharedProcessing':obj({'maximumFindings':integer(4096)}),'registrations':obj(registrationProps)})
stable={'type':'string','minLength':1,'maxLength':128,'pattern':'^[a-zA-Z0-9][a-zA-Z0-9._-]*$'};ownerSchema=obj({'schemaVersion':{'const':'pipeline-package-policy.v1'},'packageId':{'const':manifest['id']},'instanceId':stable,'profiles':{'type':'object','minProperties':1,'additionalProperties':profileSchema}})
owner={'schemaVersion':'pipeline-package-policy.v1','packageId':manifest['id'],'instanceId':'fixture.security-providers','profiles':{'A':base}};pairIndex=[];definitions=[]
tasks={'headers':{'paths':['/a']},'dependency-trivy':{'projectDirectory':'task-fixtures/repository/clean'},'image-trivy':{},'kubernetes-policy':{},'kubernetes-runtime':{}}
for r,t in tasks.items():write(f'task-fixtures/config/{r}.task.json',t)
def physicalPointer(reg,field):
 prefix='/properties/profiles/additionalProperties/properties/'
 if field in ['blockingSeverities','blockActiveThreats','blockMissingFixes']:return prefix+'verdictPolicy/properties/'+field
 if field.startswith('evidenceDefaults.') or field in ['retrySafe','matrixFields']:return prefix+'registrations/properties/'+reg+'/properties/declarations/properties/'+field.replace('.', '/properties/')
 if field in ['paths','paths[]','projectDirectory']:return '/properties/'+field.replace('[]','/items')
 p=prefix+'registrations/properties/'+reg+'/properties/processing'
 for part in field.split('.'):
  p+='/properties/'+part.replace('[]','/items')
 return p
def resolve(schema,pointer):
 node=schema
 for part in pointer.strip('/').split('/'):node=node[part]
 return node
for locator in locators:
 id=locator['id'];row=inventory[id];old=legacyBy.get(id);isCommon=id.startswith('RT-SECURITY-COMMON-');isManifest=row['source']['path'].endswith('plugin.json')
 if old:reg=shortToReg[old['provider']];field=old['field']
 elif isCommon:reg='headers';field=row['field']
 else:
  i=int(re.search(r'testProviders\[(\d+)\]',row['source']['field']).group(1));reg=manifest['testProviders'][i]['id'];field=row['source']['field'].split('].',1)[1]
 taskField=field in ['paths','paths[]','projectDirectory'];a=copy.deepcopy(base);b=copy.deepcopy(base);taskA=copy.deepcopy(tasks[reg]);taskB=copy.deepcopy(tasks[reg]);unavailable=None;definitionNote=[]
 if old:
  for side,p,t in [('A',a,taskA),('B',b,taskB)]:
   original=copy.deepcopy(old['complete'+side]);proc=p['registrations'][reg]['processing']
   for k,v in original.items():
    if k in ['paths','projectDirectory']:t[k]=v
    else:proc[k]=v
   # Explicit full-pair correction: use real header finding identity instead of old generic case-finding.
   for acceptance in proc['policy']['acceptances']:
    if reg=='headers':acceptance['findingId']='header:custom:/a' if acceptance['findingId']=='case-finding' else 'header:other:/a'
   if reg=='headers' and field.endswith('.severity'):
    p['verdictPolicy']['blockActiveThreats']=False;definitionNote.append('Both complete profiles disable active-threat OR arm to expose severity verdict; current hardcoded parser does NOT support this owned flag yet.')
  if old['onlyOneCurrentPresetValue']:unavailable='strict-v1 is the only current policy model label; no distinct supported label B. Owned verdict/waiver fields remain meaningful, but original label ALT/F-EFFECT stays OPEN.'
  if 'policy' in field and reg!='headers':definitionNote.append('Legacy waiver IDs are source-shape/unused-waiver audit controls, NOT observed native finding receipts. Real verdict/acceptance contrast requires authenticated exact native finding ID under same task/database/lease; original F-EFFECT remains not-run and fixture eligibility OPEN.')
  if field=='policy.acceptances[].reason':definitionNote.append('Reason changes emitted accepted/unused/expired waiver metadata, not verdict; preserve real finding visibility.')
 elif isCommon:
  if field=='blockingSeverities':
   for p in [a,b]:p['verdictPolicy'].update(blockActiveThreats=False,blockMissingFixes=False)
   b['verdictPolicy']['blockingSeverities']=['critical']
  elif field=='blockActiveThreats':
   for p in [a,b]:p['verdictPolicy'].update(blockingSeverities=[],blockMissingFixes=False)
   b['verdictPolicy']['blockActiveThreats']=False
  else:
   for p in [a,b]:p['verdictPolicy'].update(blockingSeverities=[],blockActiveThreats=False)
   b['verdictPolicy']['blockMissingFixes']=False
  definitionNote.append('Only genuine same-provider mapped finding matching isolated OR arm qualifies native effect; pure result helper is source assessment only, not productive scan proof.')
 else:
  if field=='retrySafe':b['registrations'][reg]['declarations']['retrySafe']=False
  elif field=='matrixFields':unavailable='No distinct safe matrix selection. Headers manifest path is rejected/unread by actual paths task schema; others declare[]. No fabricated path→paths repair or new package support. Original obligations OPEN.'
  else:unavailable='Actual package produces only mandatory runner log on every outcome; no distinct valid evidence-type B. Original ALT/F-EFFECT remains OPEN; never omit log or invent test-report.'
 keyA=id+'-A';keyB=id+'-B'
 if taskField:keyA=keyB='A'
 else:owner['profiles'][keyA]=a
 if not unavailable and not taskField:owner['profiles'][keyB]=b
 if unavailable:keyB=None
 write(f'task-fixtures/pairs/{id}/A.json',taskA);write(f'task-fixtures/pairs/{id}/B.json',taskB)
 pointer=physicalPointer(reg,field);schemaPath=f'schemas/{reg}.task.schema.json' if taskField else 'schemas/kubeclaw.security-providers.schema.json';node=resolve(taskSchemas[reg] if taskField else ownerSchema,pointer)
 d={'id':id,'originalRow':row,'originalRowBodySha256':digest(row),'registrationId':manifest['id']+':'+reg,'provider':reg,'field':field,'classification':'task intent' if taskField else ('shared owned verdict processing' if isCommon else 'package registration policy' if isManifest else 'owned processing/rule/waiver policy'),'soleAuthor':None if taskField else 'config/plugins/kubeclaw.security-providers.config.json#/profiles/<selected>','wholeProfiles':{'A':keyA,'B':keyB},'taskPair':{'A':f'task-fixtures/pairs/{id}/A.json','B':f'task-fixtures/pairs/{id}/B.json'},'targetSchemaBinding':{'path':str(O/schemaPath),'pointer':pointer,'exactNode':node},'originalCaseIds':locator['originalCaseIds'],'retainedLegacySourceContract':old,'currentSupportedDomain':row.get('domain'),'sourceDefaultPrecedence':row.get('current'),'sourceConsumerContract':'source-consumer-contracts.md','notes':definitionNote,'unsupportedAlternateObligation':unavailable,'status':'finite author definition; fresh independent material review REQUIRED; all original results unchanged','receivingABI':'receiving-abi.md'}
 definitions.append(d);pairIndex.append({'settingId':id,'registrationId':d['registrationId'],'profileA':keyA,'profileB':keyB,'taskA':d['taskPair']['A'],'taskB':d['taskPair']['B'],'unsupportedAlternate':unavailable})
write('schemas/kubeclaw.security-providers.schema.json',ownerSchema);write('config/plugins/kubeclaw.security-providers.config.json',owner)
for d in definitions:d['targetSchemaBinding']['sha256']=sha(d['targetSchemaBinding']['path'])
write('field-definitions.json',{'rows':definitions,'qualification':'89 exact original members and source-specific supplemental definition, not canonical edits'});write('profile-task-pair-index.json',pairIndex)
# Same reviewed proposed v5 root, one additional package owner, not another global config entry.
shutil.copytree(P/'config/components',O/'config/components',dirs_exist_ok=True)
for p in (P/'config/plugins').glob('*.json'):shutil.copy2(p,O/'config/plugins'/p.name)
shutil.copytree(P/'schemas/components',O/'schemas/components',dirs_exist_ok=True)
root=read(P/'config/pipeline.config.json');buster=read(O/'config/components/buster-engine.config.json');stand=copy.deepcopy(buster['profiles']['local-A']);net=stand['settings']['execution']['capabilityProviders']['networkHttp'];net['allowedOrigins']=['https://fixture.invalid'];net['allowedPorts']=[443];buster['profiles']['security-source-A']=stand;write('config/components/buster-engine.config.json',buster)
for binding in root['bindings']:
 if binding['owner']=='buster-engine' and binding['instanceId']=='fixture.service.buster-runtime':binding['profileId']='security-source-A'
for r in decls:root['pluginSelections'].append({'kind':'test-provider','packageId':manifest['id'],'registrationId':manifest['id']+':'+r,'instanceId':owner['instanceId'],'ownerPath':'plugins/kubeclaw.security-providers.config.json','profileId':'A','serviceInstanceId':'fixture.service.buster-runtime'})
write('config/pipeline.config.json',root);rs=read(P/'schemas/pipeline-entry.schema.json');rp=rs['properties']['pluginSelections']['items']['properties'];rp['packageId']['enum'].append(manifest['id']);rp['registrationId']['enum'].extend(manifest['id']+':'+r for r in decls);rp['ownerPath']['enum'].append('plugins/kubeclaw.security-providers.config.json');write('schemas/pipeline-entry.schema.json',rs)
for d in pairIndex:
 d['entries']={}
 for side in ['A','B']:
  profile=d['profile'+side]
  if profile is None:continue
  r=copy.deepcopy(root)
  for t in r['pluginSelections']:
   if t['packageId']==manifest['id']:t['profileId']=profile
  file=f'fixtures/entries/{d["settingId"]}-{side}.pipeline.config.json';write(file,r);d['entries'][side]=file
write('profile-task-pair-index.json',pairIndex)
write('native-resource-association.json',{'soleC3Author':'config/components/buster-engine.config.json#/profiles/security-source-A/settings','completeWholeStand':'config/pipeline.config.json selects the explicit complete local-A clone changing only native network origin/port for unsigned HTTPS task fixture; all native timer/bytes/scanner/registry/cluster fields unchanged','network':net,'securityScan':stand['settings']['execution']['capabilityProviders']['securityScan'],'runtimeSecurity':stand['settings']['clusterInvokers']['runtimeSecurity'],'support':'headers network.http; dependency/image/kubernetes-policy security.scan; kubernetes-runtime kubernetes.runtime-security; no browser adapter/server/npm audit substitution','externalActivation':{'installedRoster':None,'trivyExecutableIdentity':None,'kubectlExecutableIdentity':None,'databaseSnapshots':None,'registryCredentialRevision':None,'deploymentLeaseReceipt':None,'capabilityGrants':None},'nativeCases':'not-run'})
for name in ['c3-integrated-reference-generation.json','c3-registry-peer-reference-contract.json']:
 shutil.copy2(P/name,O/name)
shutil.copy2(P/'schemas/c3-generated-runtime.schema.json',O/'schemas/c3-generated-runtime.schema.json')
# Actual existing YAML task fixture, unchanged bytes. No production input file edited/read credential.
yp=Path('tests/verification/e2e/fixtures/nginx-project/k8s/deployment.yaml');dest=O/'task-fixtures/repository/checked-manifest.yaml';dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(yp,dest)
write('task-fixtures/inputs/headers.deployment.json',{'name':'deployment','kind':'value','schemaId':'kubeclaw.kubernetes-deployment-fixture@1','value':{'schemaVersion':'kubernetes-deployment-fixture.v1','endpoints':[{'name':'fixture','url':'https://fixture.invalid'}]},'qualification':'unsigned source-input definition only; no authenticated deployment/availability/exposure/lease fact'})
write('task-fixtures/inputs/manifest.artifact.json',{'name':'checked-manifest','kind':'artifact','artifact':{'mediaType':'application/vnd.kubeclaw.checked-kubernetes-yaml','contentDigest':'sha256:'+sha(dest),'storageUrl':dest.resolve().as_uri(),'sizeBytes':dest.stat().st_size},'qualification':'actual source YAML bytes/local input parser definition; no checked-manifest producer receipt or admission assertion'})
imageDigest='sha256:d9e853e87e55526f6b2917df91a2115c36dd7c696a35be12163d44e6e2a4b6bc';write('task-fixtures/inputs/image.json',{'name':'image','kind':'value','schemaId':'kubeclaw.container-image@1','value':{'schemaVersion':'container-image.v1','reference':'fixture-registry.invalid/kubeclaw/source-fixture@'+imageDigest,'digest':imageDigest},'qualification':'typed unsigned task reference/digest, digest reused from actual live-function source. NOT evidence of copied/installed registry image or clean findings; authenticated immutable source/registry receipt missing'})
for dirname,version in [('clean',None),('vulnerable','4.17.20')]:
 pkg={'name':'scanner-proof','version':'1.0.0','private':True};lock={'name':pkg['name'],'version':pkg['version'],'lockfileVersion':3,'requires':True,'packages':{'':{'name':pkg['name'],'version':pkg['version']}}}
 if version:pkg['dependencies']={'lodash':version};lock['packages']['']['dependencies']={'lodash':version};lock['packages']['node_modules/lodash']={'version':version}
 write(f'task-fixtures/repository/{dirname}/package.json',pkg);write(f'task-fixtures/repository/{dirname}/package-lock.json',lock)
write('task-fixtures/repository/lock-fixture-definition.json',{'source':'skills/buster/plugins/security-providers/tests/live-function.test.ts healthy/vulnerable npm lockfile generation and known CVE-2021-23337 expectation','qualification':'Deterministic local JSON task definition matching source supported npm-lock format; not npm-generated/signed download/advisory/Trivy observation, no integrity/registry/install facts invented; future native tool/database/source snapshot required'})
# No synthetic scanner output is supplied to productive providers. Shape-only inputs label that boundary.
write('fixtures/pure-mapped-findings.json',{'qualification':'Pure current findings/result helper inputs only; NOT observed native scanner output, never fed to provider.execute','header':[{'id':'header:custom:/a','severity':'high','message':'/a does not satisfy security-header rule custom.','category':'header','status':'affected'}],'dependency':[{'id':'CVE-2021-23337','package':'lodash','installedVersion':'4.17.20','fixedVersion':'4.17.21','sourceFile':'task-fixtures/repository/vulnerable/package-lock.json','severity':'high','status':'unknown'}],'image':[{'id':'CVE-1','package':'openssl','installedVersion':'1','sourceFile':'os-packages','severity':'high'}],'kubernetes-policy':[{'id':'KSV-0001','sourceFile':'task-fixtures/repository/checked-manifest.yaml','line':1,'severity':'high','message':'unsafe'}],'kubernetes-runtime':[{'id':'fixture-rule','severity':'low','message':'source-shape fixture'}]})
write('fixtures/header-response-headers.json',{'x-content-type-options':'nosniff','content-security-policy':"default-src 'none'",'referrer-policy':'no-referrer','permissions-policy':'geolocation=()','x-custom':'a','strict-transport-security':'max-age=31536000','x-frame-options':'deny'})
caseIds=sorted({id for r in locators for id in r['originalCaseIds']});cases=[]
for id in caseIds:
 c=canonical[id];members=[d for d in definitions if d['id'] in c['settingIds']];cases.append({'id':id,'originalCanonicalCase':c,'originalCanonicalBodySha256':digest(c),'retainedNativeCase':nativeBy.get(id),'thisCutSettingIds':[m['id'] for m in members],'perMemberFieldContracts':[{'settingId':m['id'],'completeOwnerSchemaRef':m['targetSchemaBinding'],'wholePairRef':'profile-task-pair-index.json#'+m['id'],'sourceConsumer':'source-consumer-contracts.md','receivingABI':'receiving-abi.md','nativeAssociation':'native-resource-association.json','unsupportedAlternateObligation':m['unsupportedAlternateObligation']} for m in members],'status':c['result'],'sharedOriginalObligationsUnchanged':True})
write('case-definitions.json',{'cases':cases,'caseCount':len(cases),'qualification':'Original canonical/native bodies/results preserved; pure/source definitions never replace productive F-EFFECT/MUT/BIND/recovery/Eval requirements'})
write('scope.json',{'originalFieldIds':[l['id'] for l in locators],'originalCaseIds':caseIds,'fieldCount':89,'caseCount':len(caseIds),'registeredProviders':list(decls),'implementationAuthorization':None,'globalC0Accepted':False,'futureCases':'not-run'})
coords=[]
for p in list((S/'src').glob('*.js'))+[Path('skills/buster/engine/test-gates/security-scan-runtime.ts'),Path('skills/buster/engine/test-gates/kubernetes-runtime-security.ts'),Path('skills/common/plugin-runtime/foundation/registry/configuration.ts'),Path('skills/common/plugin-runtime/foundation/registry/build.ts'),Path('skills/nova/core/test-gates/resolver.ts'),Path('skills/buster/engine/test-gates/runner.ts'),Path('skills/nova/core/execution/adapter-startup.ts')]:
 for n,text in enumerate(p.read_text().splitlines(),1):
  if text.strip() and any(term in text for term in ['maximum','timeout','policy','PROFILES','profile','rules','finding','acceptance','evidence','matrix','retry','configuration','invoke','scanner','registry','database','Date.','Date(']):coords.append({'path':str(p),'line':n,'text':text,'sha256':sha(p)})
write('source-coordinates.json',coords)
print(json.dumps({'fields':89,'cases':len(cases),'completePackageProfiles':len(owner['profiles']),'wholeEntries':sum(len(p['entries']) for p in pairIndex),'sourceCoordinates':len(coords)}))
