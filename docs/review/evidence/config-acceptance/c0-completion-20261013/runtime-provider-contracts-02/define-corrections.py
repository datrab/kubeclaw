import json,copy,hashlib,shutil
from pathlib import Path
B=Path('docs/review/evidence/config-acceptance/c0-completion-20261013'); OLD=B/'runtime-provider-contracts-01'; O=B/'runtime-provider-contracts-02'; C3=B/'c3-buster-complete-profile-02'
read=lambda p:json.loads(Path(p).read_text())
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
digest=lambda x:hashlib.sha256(json.dumps(x,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
def write(p,x):
 p=O/p;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(x,indent=2)+'\n')
def integer(n):return {'type':'integer','minimum':1,'maximum':n}
# Copy only definition inputs. Old observations/scripts/verdicts are historical, not active02 proof.
for name in ['config/plugins','schemas','task-fixtures']:
 shutil.copytree(OLD/name,O/name,dirs_exist_ok=True)
for name in ['scope.json','field-definitions.json','case-definitions.json','package-binding-identities.json','profile-index.json','task-pair-index.json','current-source-coordinates.json']:
 shutil.copy2(OLD/name,O/name)
write(Path('frozen-input-identities.json'),{'qualification':'Read-only historical inputs, not02 acceptance','inputs':[{'path':str(p),'sha256':sha(p)} for directory in [OLD,B/'independent-runtime-provider-contract-review-01',C3] for p in sorted(directory.rglob('*')) if p.is_file()]})
stable={'type':'string','minLength':1,'maxLength':128,'pattern':'^[a-zA-Z0-9][a-zA-Z0-9._-]*$'}
baseline={};owners={}
for pkg in ['api-flow','http','openapi','network-http']:
 pn=f'kubeclaw.{pkg}'; owner=read(O/f'config/plugins/{pn}.config.json'); schema=read(O/f'schemas/{pn}.schema.json');schema['properties']['instanceId']=copy.deepcopy(stable)
 ps=schema['properties']['profiles']['additionalProperties']['properties']['processing'];props=ps['properties']
 if pkg!='network-http':
  props['maximumRequestTimeoutMs']=integer(300000);ps['required'].append('maximumRequestTimeoutMs')
  manifest=read(f'skills/buster/plugins/{pkg}/plugin.json')['testProviders'][0];baseline[pn]=manifest['evidenceDefaults']
  ds=schema['properties']['profiles']['additionalProperties']['properties']['declarations'];ds['properties']['retrySafe']={'type':'boolean'} if manifest['retrySafe'] else {'const':False}
  # Package capabilities remain immutable; policy is a conservative subset, never expands them.
  ds['properties']['matrixFields']={'type':'array','uniqueItems':True,'items':{'enum':manifest['matrixFields']}} if manifest['matrixFields'] else {'type':'array','maxItems':0,'items':{'type':'string'}}
  for outcome,types in manifest['evidenceDefaults'].items():
   # All locally produced selectable types for this package/outcome are mandatory.
   # Error outcomes do not pretend that a thrown provider produced its success report.
   ds['properties']['evidenceDefaults']['properties'][outcome]={'type':'array','uniqueItems':True,'minItems':len(types),'maxItems':len(types),'items':{'enum':types},'allOf':[{'contains':{'const':t}} for t in types]}
  for p in owner['profiles'].values():p['processing']['maximumRequestTimeoutMs']=1000
 if pkg=='openapi':
  del props['maximumSchemaDepth'];ps['required'].remove('maximumSchemaDepth')
  for f in ['maximumSchemaGraphDepth','maximumRefChainDepth','maximumPayloadDepth']:props[f]=integer(64);ps['required'].append(f)
  for p in owner['profiles'].values():
   del p['processing']['maximumSchemaDepth'];p['processing'].update(maximumSchemaGraphDepth=64,maximumRefChainDepth=64,maximumPayloadDepth=64)
 if pkg=='network-http':
  # Current schema/parser wider than transport timer: explicitly operational target, not current claim.
  props['timeoutMs']['maximum']=2147483647
  for f in ['maxRequestBytes','maxResponseBytes']:props[f]['maximum']=9007199254740991
 # New complete profiles, each construction copies all members before altering its named policy.
 if pkg!='network-http':
  a=copy.deepcopy(owner['profiles']['A']);b=copy.deepcopy(a);b['processing']['maximumRequestTimeoutMs']=500;owner['profiles']['deadline-ceiling-A']=a;owner['profiles']['deadline-ceiling-B']=b
 if pkg=='http':
  for label,key,value in [('retry-conservative','retrySafe',False),('matrix-conservative','matrixFields',[])]:
   owner['profiles'][label+'-A']=copy.deepcopy(owner['profiles']['A']);b=copy.deepcopy(owner['profiles']['A']);b['declarations'][key]=value;owner['profiles'][label+'-B']=b
 limitfields=['maximumFlowFileBytes'] if pkg=='api-flow' else (['maximumSpecFileBytes','maximumSelections','maximumSchemaGraphDepth','maximumRefChainDepth','maximumPayloadDepth','maximumPatternCodeUnits','maximumPatternQuantifier'] if pkg=='openapi' else [])
 for f in limitfields:
  a=copy.deepcopy(owner['profiles']['A']);b=copy.deepcopy(a)
  a['processing'][f]={'maximumFlowFileBytes':1048576,'maximumSpecFileBytes':4194304,'maximumSelections':128,'maximumSchemaGraphDepth':64,'maximumRefChainDepth':64,'maximumPayloadDepth':64,'maximumPatternCodeUnits':256,'maximumPatternQuantifier':1024}[f]
  b['processing'][f]={'maximumFlowFileBytes':512,'maximumSpecFileBytes':512,'maximumSelections':1,'maximumSchemaGraphDepth':8,'maximumRefChainDepth':8,'maximumPayloadDepth':8,'maximumPatternCodeUnits':8,'maximumPatternQuantifier':8}[f]
  owner['profiles'][f+'-A']=a;owner['profiles'][f+'-B']=b
 write(Path(f'config/plugins/{pn}.config.json'),owner);write(Path(f'schemas/{pn}.schema.json'),schema);owners[pn]=owner
write(Path('mandatory-outcome-evidence.json'),{'baselines':baseline,'overridePrecedence':'node override, if supplied, replaces selected outcome list only after supported-type and mandatory-baseline checks; no erasure, no defaults union silently correcting invalid input','error':'proposed TEST_PLAN_EVIDENCE_INVALID at resolver evidencePolicy before runner admission','producedEvidence':{'kubeclaw.http':'runner log only; provider evidenceFiles/reports empty','kubeclaw.api-flow':'api-flow-result.json test-report on returned pass/fail; runner log all outcomes','kubeclaw.openapi':'openapi-runtime-result.json test-report on returned pass/fail; runner log all outcomes'},'alternateDisposition':'No distinct valid evidence selection B in this package/outcome domain. Original ALT/F-EFFECT cases remain OPEN and unwaived; adding an unproduced error report is not a substitute.'})
flowSchema=read('skills/buster/plugins/api-flow/schemas/flow.schema.json');write(Path('schemas/api-flow.target-task-file.schema.json'),flowSchema)
flow=read(O/'task-fixtures/repository/flow-one.json')
for side,value in [('A',50),('B',500)]:
 f=copy.deepcopy(flow);f['steps'][0]['timeoutMs']=value;write(Path(f'task-fixtures/repository/flow-deadline-{side}.json'),f)
# Extend exactly the existing same-root C3 generation, without adding a second index.
shutil.copytree(C3/'config/components',O/'config/components',dirs_exist_ok=True)
(O/'schemas/components').mkdir(exist_ok=True)
for p in (C3/'schemas').glob('*.schema.json'):
 if p.name not in ['pipeline-entry.schema.json','generated-runtime.schema.json','generated-platform-registry.schema.json']:shutil.copy2(p,O/'schemas/components'/p.name)
root=read(C3/'config/pipeline.config.json');root['schemaVersion']='pipeline-entry.v5'
root['pluginSelections']=[{'kind':'adapter' if p=='kubeclaw.network-http' else 'test-provider','packageId':p,'registrationId':o['registrationId'],'instanceId':o['instanceId'],'ownerPath':f'plugins/{p}.config.json','profileId':'A','serviceInstanceId':'fixture.service.nova-runtime' if p=='kubeclaw.network-http' else 'fixture.service.buster-runtime'} for p,o in owners.items()]
rs=read(C3/'schemas/pipeline-entry.schema.json');rs['properties']['schemaVersion']['const']='pipeline-entry.v5';rs['required'].append('pluginSelections');rs['properties']['pluginSelections']={'type':'array','minItems':1,'uniqueItems':True,'items':{'type':'object','additionalProperties':False,'required':list(root['pluginSelections'][0]),'properties':{'kind':{'enum':['adapter','test-provider']},'packageId':{'enum':list(owners)},'registrationId':{'enum':[o['registrationId'] for o in owners.values()]},'instanceId':stable,'ownerPath':{'enum':[f'plugins/{p}.config.json' for p in owners]},'profileId':stable,'serviceInstanceId':stable}}}
write(Path('config/pipeline.config.json'),root);write(Path('schemas/pipeline-entry.schema.json'),rs)
assoc=read(OLD/'network-resource-association.json');assoc['wholeBusterC3Generation']='config/pipeline.config.json v5 binds exact copied C3 complete02 components; Buster runtime local-A selected; see receiving-abi.md. No installed/authenticated roster claimed.'
assoc['compatibility']='Selected provider operator ceiling1000, requested/default <=1000, resource local-A timeout/response must be resolved and checked before invocation; native rejects excess without clamp. Target materializer exposes authentic bound resource ceiling for proposed min formula; current provider only clamps invocation.'
for r in assoc['providerC4Owners']:r['soleAuthor']=r['policyDocument']+'#/profiles/<selected>'
assoc['novaAdapter']['soleAuthor']='config/plugins/kubeclaw.network-http.config.json#/profiles/<selected>'
buster=read(O/'config/components/buster-engine.config.json'); bp=copy.deepcopy(buster['profiles']['local-A']);bp['settings']['execution']['capabilityProviders']['networkHttp']=assoc['nativeResourcePolicy'];buster['profiles']['provider-network-A']=bp
write(Path('config/components/buster-engine.config.json'),buster)
for binding in root['bindings']:
 if binding['owner']=='buster-engine' and binding['instanceId']=='fixture.service.buster-runtime':binding['profileId']='provider-network-A'
write(Path('config/pipeline.config.json'),root)
assoc['boundWholeBusterProfile']='provider-network-A';assoc['priorWholeBusterProfile']='local-A retained exact; new complete clone changes only networkHttp block and root selects it for runtime instance'
write(Path('network-resource-association.json'),assoc)
# Deterministic concrete processing-limit task bytes: JSON whitespace is counted by the current reader.
for pkg,file,low in [('api-flow','flow-one.json',512),('openapi','spec-a.json',512)]:
 obj=read(O/f'task-fixtures/repository/{file}');wire=json.dumps(obj,separators=(',',':')).encode();assert len(wire)<=low
 target=513;dest=O/f'task-fixtures/repository/{pkg}-513.json';dest.write_bytes(wire+b' '*(target-len(wire)))
spec=read(O/'task-fixtures/repository/spec-a.json');typed=read(O/'task-fixtures/repository/spec-typed.json')
graph={'type':'string'}
for _ in range(9):graph={'type':'array','items':graph}
deep=copy.deepcopy(spec);deep['paths']['/ok']['get']['responses']['200']['content']['application/json']['schema']=graph;write(Path('task-fixtures/repository/spec-graph-depth9.json'),deep)
payload='x'
for _ in range(9):payload=[payload]
write(Path('task-fixtures/response-payload-depth9.json'),payload)
refs=copy.deepcopy(spec);refs['components']={'schemas':{f'R{i}':{'$ref':f'#/components/schemas/R{i+1}'} for i in range(9)}};refs['components']['schemas']['R9']={'type':'string'};refs['paths']['/ok']['get']['responses']['200']['content']['application/json']['schema']={'$ref':'#/components/schemas/R0'};write(Path('task-fixtures/repository/spec-ref-chain10.json'),refs)
for label,pattern in [('length9','^abcdefg$'),('quantifier9','a{9}')]:
 x=copy.deepcopy(spec);x['paths']['/ok']['get']['responses']['200']['content']['application/json']['schema']={'type':'string','pattern':pattern};write(Path(f'task-fixtures/repository/spec-pattern-{label}.json'),x)
task=read(O/'task-fixtures/config/openapi.task.json');task['operations']=[{'operationId':'checkOk','pathParameters':{},'query':{},'headers':{},'cleanup':False,'expectedStatuses':[200]},{'operationId':'cleanCheck','pathParameters':{},'query':{},'headers':{},'cleanup':True,'expectedStatuses':[200]}];task['specFile']='spec-typed.json';write(Path('task-fixtures/config/openapi-selections2.task.json'),task)
# Exact ledger identities when present; explicit coverage gap rather than borrowing a neighboring candidate.
ledger=read('docs/review/evidence/config-acceptance/author/candidate-ledger.json')['candidates'];rows=read(O/'field-definitions.json')['rows'];rowby={r['id']:r for r in rows}
members=[('kubeclaw.api-flow','maximumFlowFileBytes','skills/buster/plugins/api-flow/src/provider.js',49,1048576,'RT-351419f2c26e2696','file bytes after complete read, before JSON parse','API_FLOW_FILE_TOO_LARGE','api-flow-513.json'),('kubeclaw.openapi','maximumSpecFileBytes','skills/buster/plugins/openapi/src/provider.js',193,4194304,'RT-10f3f03208806c98','file bytes after complete read, before JSON parse','OPENAPI_FILE_TOO_LARGE','openapi-513.json'),('kubeclaw.openapi','maximumSelections','skills/buster/plugins/openapi/src/provider.js',202,128,'RT-396eb59b11141a9a','combined explicit+tag selections before per-operation invoke','OPENAPI_SELECTION_LIMIT_EXCEEDED','spec-typed.json'),('kubeclaw.openapi','maximumSchemaGraphDepth','skills/buster/plugins/openapi/src/schema-support.js',47,64,'RT-10f3f03208806c98','assertSupportedSchema root0; boolean/undefined short circuit BEFORE depth>limit; traverses all supported children; response-body call post invoke','OPENAPI_SCHEMA_DEPTH_EXCEEDED','spec-graph-depth9.json'),('kubeclaw.openapi','maximumRefChainDepth','skills/buster/plugins/openapi/src/provider.js',37,64,'RT-10f3f03208806c98','resolveSchema depth0; no-ref return BEFORE depth guard, chain65 refs resolves, chain66 rejects current64; distinct from graph traversal','OPENAPI_SCHEMA_DEPTH_EXCEEDED','spec-ref-chain10.json'),('kubeclaw.openapi','maximumPayloadDepth','skills/buster/plugins/openapi/src/provider.js',70,64,'RT-10f3f03208806c98','schemaFailures root0; boolean/undefined/null shortcuts first; follows only visited payload plus combinators; graph preflight separately64','OPENAPI_SCHEMA_DEPTH_EXCEEDED','spec-graph-depth9.json'),('kubeclaw.openapi','maximumPatternCodeUnits','skills/buster/plugins/openapi/src/provider.js',56,256,'RT-10f3f03208806c98','safePattern JS string.length UTF16 code units; guard only when visited value string','OPENAPI_SCHEMA_PATTERN_UNSAFE','spec-pattern-length9.json'),('kubeclaw.openapi','maximumPatternQuantifier','skills/buster/plugins/openapi/src/provider.js',62,1024,'RT-10f3f03208806c98','safePattern parsed explicit quantifier min/max each <=limit; maximum infinity rejected; visited string only','OPENAPI_SCHEMA_PATTERN_UNSAFE','spec-pattern-quantifier9.json')]
defs=[]
for pkg,f,path,line,cap,id,boundary,error,fixture in members:
 candidates=[c for c in ledger if c['source']==path and c['line']==line];lines=Path(path).read_text().splitlines()
 defs.append({'owner':pkg,'profileField':'processing.'+f,'source':{'path':path,'line':line,'lineText':lines[line-1],'sha256':sha(path)},'exactOriginalCandidateRecords':candidates,'candidateDisposition':'exact existing ledger coordinate retained, locally adjudicated processing budget' if candidates else 'NO exact ledger candidate at this literal coordinate; explicit source-coordinate coverage gap; no invented or nearby ID assigned','associatedOriginalSettingId':id,'originalCaseIds':rowby[id]['originalCaseIds'],'identityMeaning':'Associated existing task/file/schema case obligations, NOT assertion that original task field is this quota or canonical candidate ledger was updated','classification':'selected processing budget bounded by existing safety cap, defaults removed; fixed syntax/type/cycle/security guards remain noneditable invariants','domain':{'integerMinimum':1,'maximum':cap,'sourceCeiling':cap},'boundary':boundary,'error':error,'wholePair':{'ownerPath':f'config/plugins/{pkg}.config.json','A':f+'-A','B':f+'-B'},'fixture':'task-fixtures/repository/'+fixture,'oracle':'same actual registered provider/source task and authenticated endpoint; A admits processing fixture, tighter B denies at exact named boundary; for response constraints first request already occurred; no graph/pattern mock or invented pre-request denial','negativeControls':['cap equality admitted by > comparison; cap+1 rejected','invalid0/noninteger/overflow fails selected owner schema before reader','boolean/no-ref/nonstring shortcuts distinguished, never claim guard visited when skipped','source syntax/cycle/external-ref/security invariants unchanged under A/B','mutant literal/default/ignored selected B must be killed by actual provider/runtime case'],'result':'not-run'})
write(Path('source-processing-adjudication.json'),{'status':'finite coordinate/domain/identity/case adjudication for named members; canonical ledger untouched and exact missing-candidate coverage gaps remain explicit, no closed-global claim','members':defs,'fixedRegexInvariants':['No grouping or alternation [()|]','No numeric/named backreference','At most one unescaped * or +','No infinite explicit quantifier bound','RegExp(source,u) compile must succeed'],'otherFixedInvariants':['supported keyword/dialect/type sets and shape guards','local-only JSON pointer refs, no cycles, missing refs reject','API-flow methods/variable/header/selector/task type/shape constraints retained; no task data migrated to CONFIG']})
for r in rows:
 r['status']='corrective02 proposal; fresh independent review required; all original requirements and not-run results retained'
 if r['soleProposedAuthor']:r['soleProposedAuthor']='config/plugins/'+r['originalRow']['owner']+'.config.json#/profiles/<selected>'
 binding=r.get('targetSchemaBinding')
 if binding:
  binding['path']=binding['path'].replace('runtime-provider-contracts-01/','runtime-provider-contracts-02/');node=read(binding['path'])
  for part in binding['pointer'].strip('/').split('/'):node=node[int(part)] if isinstance(node,list) else node[part.replace('~1','/').replace('~0','~')]
  binding['exactNode']=node
 r['correctionContracts']=['receiving-abi.md','source-consumer-contracts.md','mandatory-outcome-evidence.json','source-processing-adjudication.json']
 r['sourceProcessingAssociatedMembers']=[m['profileField'] for m in defs if m['associatedOriginalSettingId']==r['id']]
write(Path('field-definitions.json'),{'qualification':'67 exact original row bodies preserved;02 supplements are proposed source contracts, not canonical edits','rows':rows})
cases=read(O/'case-definitions.json')
for c in cases['cases']:
 c['actionOracleContractRef']='source-consumer-contracts.md';c['receivingABI']='receiving-abi.md';c['correction02']='original body/state preserved; pre/post invoke boundaries and mandatory evidence/selection constraints supersede01 prose'
write(Path('case-definitions.json'),cases)
index=read(O/'profile-index.json')
for ref in index:
 owner=next(o for o in owners.values() if o['registrationId']==ref['registrationId']);ref['wholePolicySha256']=digest(owner['profiles'][ref['profileId']]);ref['definition']='explicit complete02 profile, prior01 profile bytes retained in frozen01; no silent historical execution transplant'
write(Path('profile-index.json'),index)
write(Path('correction-summary.json'),{'findings':['RPR01-01','RPR01-02','RPR01-03','RPR01-04','RPR01-05'],'originalFields':67,'originalCases':408,'ownerProfiles':sum(len(o['profiles']) for o in owners.values()),'authorStatus':'definition prepared, independent recheck REQUIRED','futureImplementationResults':'not-run','implementationAuthorization':None,'globalC0Accepted':False})
print(json.dumps({'owners':len(owners),'profiles':sum(len(o['profiles']) for o in owners.values()),'sourceMembers':len(defs),'missingExactLedgerCoordinates':sum(not x['exactOriginalCandidateRecords'] for x in defs)}))
# Closed proposed receiver arm. No existing productive contract/schema is edited.
packageBindings=read(O/'package-binding-identities.json')
for binding in packageBindings:
 binding['targetOwnerSchemaDigest']='sha256:'+sha(O/f'schemas/{binding["packageId"]}.schema.json')
write(Path('package-binding-identities.json'),packageBindings)
hashSchema={'type':'string','pattern':'^sha256:[a-f0-9]{64}$'}
arms=[];generated=[]
for pkg in ['api-flow','http','openapi']:
 pn='kubeclaw.'+pkg;owner=owners[pn];schema=read(O/f'schemas/{pn}.schema.json');profileSchema=schema['properties']['profiles']['additionalProperties'];manifest=read(f'skills/buster/plugins/{pkg}/plugin.json');contract=manifest['testProviders'][0]['contractId'];binding=next(x for x in packageBindings if x['packageId']==pn)
 bs={'type':'object','additionalProperties':False,'required':['kind','packageId','registrationId','instanceId','profileId','serviceInstanceId','rootDigest','ownerDigest','profileDigest','packageVersion','packageContentDigest','ownerSchemaDigest','taskSchemaDigest','readerVersion'],'properties':{k:copy.deepcopy(stable) for k in ['instanceId','profileId','serviceInstanceId']}}
 bs['properties'].update(kind={'const':'test-provider'},packageId={'const':pn},registrationId={'const':owner['registrationId']},packageVersion={'type':'string','minLength':1},readerVersion={'const':'pipeline-entry.v5/provider-configuration.v2'})
 for k in ['rootDigest','ownerDigest','profileDigest','packageContentDigest','ownerSchemaDigest','taskSchemaDigest']:bs['properties'][k]=copy.deepcopy(hashSchema)
 selectedSchema={'type':'object','additionalProperties':False,'required':['schemaVersion','binding','processing','declarations'],'properties':{'schemaVersion':{'const':'selected-registration-policy.v1'},'binding':bs,**copy.deepcopy(profileSchema['properties'])}}
 taskSchema=read(O/f'schemas/{pn}.task.schema.json');taskSchema.pop('$schema',None);taskSchema.pop('$id',None)
 arm={'type':'object','additionalProperties':False,'required':['schemaVersion','contractId','taskSchemaDigest','values','selectedPolicy'],'properties':{'schemaVersion':{'const':'provider-configuration.v2'},'contractId':{'const':contract},'taskSchemaDigest':hashSchema,'values':taskSchema,'selectedPolicy':selectedSchema}}
 arms.append(arm)
 override={'type':'object','additionalProperties':False,'properties':copy.deepcopy(profileSchema['properties']['declarations']['properties']['evidenceDefaults']['properties'])}
 write(Path(f'schemas/{pn}.evidence-override.schema.json'),override)
 for t in [t for t in root['pluginSelections'] if t['packageId']==pn]:
  p=owner['profiles'][t['profileId']];body={'schemaVersion':'provider-configuration.v2','contractId':contract,'taskSchemaDigest':'sha256:'+sha(O/f'schemas/{pn}.task.schema.json'),'values':read(O/f'task-fixtures/config/{pkg}.task.json'),'selectedPolicy':{'schemaVersion':'selected-registration-policy.v1','binding':{k:t[k] for k in ['kind','packageId','registrationId','instanceId','profileId','serviceInstanceId']},**copy.deepcopy(p)}}
  body['selectedPolicy']['binding'].update(rootDigest='sha256:'+sha(O/'config/pipeline.config.json'),ownerDigest='sha256:'+sha(O/f'config/plugins/{pn}.config.json'),profileDigest='sha256:'+digest(p),packageVersion=binding['packageVersion'],packageContentDigest=binding['contentDigest'],ownerSchemaDigest=binding['targetOwnerSchemaDigest'],taskSchemaDigest=body['taskSchemaDigest'],readerVersion='pipeline-entry.v5/provider-configuration.v2')
  write(Path(f'fixtures/generated/{pn}.provider-configuration.v2.json'),body);generated.append({'package':pn,'path':f'fixtures/generated/{pn}.provider-configuration.v2.json','qualification':'Schema/binding fixture only; local package bytes, no installed/external/granted activation assertion'})
write(Path('schemas/provider-configuration.v2.schema.json'),{'$schema':'https://json-schema.org/draft/2020-12/schema','oneOf':arms})
write(Path('generated-view-index.json'),generated)
f=copy.deepcopy(flow);f['steps'][0]['timeoutMs']=750;write(Path('task-fixtures/repository/flow-deadline750.json'),f)
for file,value in [('response-ref-string.json','x'),('response-pattern-length9.json','abcdefg'),('response-pattern-quantifier9.json','aaaaaaaaa')]:write(Path('task-fixtures')/file,value)
taskPairs=read(OLD/'task-pair-index.json')
for pair in taskPairs:
 pair['retainedOriginalPairDefinition']=copy.deepcopy(pair)
 for key in ['taskA','taskB']:pair[key]=pair[key].replace('runtime-provider-contracts-01/','runtime-provider-contracts-02/')
 selection=next(t for t in root['pluginSelections'] if t['registrationId']==pair['ownerRegistration']['registration'])
 pair['ownerRegistration']={'registration':selection['registrationId'],'kind':selection['kind'],'instance':selection['instanceId'],'profile':'A','serviceInstanceId':selection['serviceInstanceId'],'soleAuthor':selection['ownerPath']+'#/profiles/A','root':'config/pipeline.config.json pipeline-entry.v5 proposed binding'}
write(Path('task-pair-index.json'),taskPairs)
sourceDefs=read(O/'source-processing-adjudication.json');caseIndex={c['id']:i for i,c in enumerate(cases['cases'])}
applications={
 'maximumFlowFileBytes':{'currentConsumer':'api-flow readFlow(repositoryPath, flowFile) byteLength guard','targetABI':'readFlow(repositoryPath, flowFile, selectedPolicy.processing.maximumFlowFileBytes); compare after captured bytes read, before parse; no fallback','fixtureResponse':None},
 'maximumSpecFileBytes':{'currentConsumer':'openapi provider execute captured spec readFileSync byteLength guard','targetABI':'captured bytes byteLength > selectedPolicy.processing.maximumSpecFileBytes before JSON.parse; no fallback','fixtureResponse':None},
 'maximumSelections':{'currentConsumer':'openapi provider execute combined explicit operations and selected tags array length','targetABI':'combined selections.length > selectedPolicy.processing.maximumSelections after empty check and before operation loop; no fallback','fixtureResponse':None},
 'maximumSchemaGraphDepth':{'currentConsumer':'assertSupportedSchema raw graph traversal and child recursion','targetABI':'add explicit immutable processing budgets argument after depth parameter; every assertSupportedSchema child carries exact same budgets; preserve boolean/undefined shortcuts before depth > maximumSchemaGraphDepth; no fallback','fixtureResponse':'response-payload-depth9.json'},
 'maximumRefChainDepth':{'currentConsumer':'resolveSchema local-ref recursion','targetABI':'add explicit immutable processing budgets argument after depth parameter; recursive resolve carries same budgets; preserve no-ref return before depth > maximumRefChainDepth; no fallback','fixtureResponse':'response-ref-string.json'},
 'maximumPayloadDepth':{'currentConsumer':'schemaFailures visited value/schema recursion','targetABI':'add explicit immutable processing budgets argument after depth parameter; recursive schemaFailures carries same budgets; assertSupportedSchema receives graph budget not payload budget; preserve shortcut and depth > maximumPayloadDepth','fixtureResponse':'response-payload-depth9.json'},
 'maximumPatternCodeUnits':{'currentConsumer':'safePattern invoked inside visited string schemaFailures branch','targetABI':'safePattern(source, immutable processing budgets) uses source.length > maximumPatternCodeUnits; unchanged other regex security guards; no fallback','fixtureResponse':'response-pattern-length9.json'},
 'maximumPatternQuantifier':{'currentConsumer':'safePattern explicit bounded quantifier scan','targetABI':'safePattern(source, immutable processing budgets) compares each parsed min/max > maximumPatternQuantifier; infinity/security guards remain; no fallback','fixtureResponse':'response-pattern-quantifier9.json'}}
for m in sourceDefs['members']:
 f=m['profileField'].split('.')[1];pkg=m['owner'];s=m['source'];m['immutableSourceIdentity']={'path':s['path'],'sourceSha256':s['sha256'],'line':s['line'],'exactLineText':s['lineText'],'selectedFieldPointer':'/profiles/<selected>/processing/'+f}
 m['boundedDefinitionStatus']='Locally adjudicated owner/domain/source-consumer/application/fixture/case contract COMPLETE AS PROPOSAL; scanner identity gap remains global coverage issue, not unspecified behavior or activation blocker'
 m['applicationContract']=applications[f];m['applicationCaseArtifactRefs']=[{'originalCaseId':id,'pointer':'case-definitions.json#/cases/'+str(caseIndex[id]),'originalRequirementsUnchanged':True} for id in m['originalCaseIds'] if id in caseIndex]
 schema=read(O/f'schemas/{pkg}.schema.json');m['exactSelectedSchemaNode']=schema['properties']['profiles']['additionalProperties']['properties']['processing']['properties'][f]
 m['wholeEntries']={}
 for side in ['A','B']:
  r=copy.deepcopy(root);next(t for t in r['pluginSelections'] if t['packageId']==pkg)['profileId']=f+'-'+side;file=f'fixtures/entries/{pkg}.{f}-{side}.pipeline.config.json';write(Path(file),r);m['wholeEntries'][side]=file
 task=copy.deepcopy(read(O/f'task-fixtures/config/{pkg.split(".")[-1]}.task.json'))
 if pkg=='kubeclaw.api-flow':task['flowFile']=Path(m['fixture']).name
 elif f=='maximumSelections':task=read(O/'task-fixtures/config/openapi-selections2.task.json')
 else:task['specFile']=Path(m['fixture']).name
 tf=f'task-fixtures/config/{pkg}.{f}.task.json';write(Path(tf),task);m['actualTaskData']=tf
write(Path('source-processing-adjudication.json'),sourceDefs)
sup=B/'c3-buster-complete-profile-03/frozen-supersession.json'
if sup.exists():
 write(Path('c3-dependency-transition-to03.json'),{'status':'Explicit frozen reference transition proposal ONLY after independent03 review; no base02 mutation and no03 activation/whole C3 acceptance','base':str(C3),'baseRuntimeSchemaSha256':sha(C3/'schemas/generated-runtime.schema.json'),'supersessionArtifact':str(sup),'supersessionArtifactSha256':sha(sup),'supersession':read(sup),'requiredAction':'Next authenticated generation updates ONLY generated runtime schema/registry-reference contract pins to exact frozen03 after bounded independent check; root v4/settings identical03, v5 plugin tuples/policy fixtures retained. No implicit current-file lookup.'})
