import json,copy,hashlib,shutil
from pathlib import Path
B=Path('docs/review/evidence/config-acceptance/c0-completion-20261013');OLD=B/'runtime-provider-contracts-02';O=B/'runtime-provider-contracts-03';C3=B/'c3-buster-complete-profile-03';R=B/'independent-runtime-provider-contract-review-02';CR=B/'independent-c3-buster-complete-profile-review-03'
read=lambda p:json.loads(Path(p).read_text());sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest();digest=lambda x:hashlib.sha256(json.dumps(x,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
def write(name,x):
 p=O/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(x,indent=2)+'\n')
def pointed(binding):
 node=read(binding['path'])
 for part in binding['pointer'].strip('/').split('/'):node=node[int(part)] if isinstance(node,list) else node[part.replace('~1','/').replace('~0','~')]
 return node
for folder in ['config','schemas','task-fixtures','fixtures']:shutil.copytree(OLD/folder,O/folder,dirs_exist_ok=True)
for name in ['scope.json','mandatory-outcome-evidence.json','source-processing-adjudication.json','package-binding-identities.json','profile-index.json','task-pair-index.json','current-source-coordinates.json','network-resource-association.json','generated-view-index.json','receiving-abi.md','source-consumer-contracts.md']:
 shutil.copy2(OLD/name,O/name)
write('frozen-input-identities.json',{'qualification':'All historical provider01/02/reviews and bounded C3 source/ref03 inputs frozen; no transitive acceptance','inputs':[{'path':str(p),'sha256':sha(p)} for directory in [B/'runtime-provider-contracts-01',OLD,B/'independent-runtime-provider-contract-review-01',R,C3,CR] for p in sorted(directory.rglob('*')) if p.is_file()]})
root=read(O/'config/pipeline.config.json');owners={}
for p in (O/'config/plugins').glob('*.json'):
 d=read(p);owners[d['packageId']]=d
 if d['packageId']!='kubeclaw.network-http':
  for side in ['A','B']:d['profiles']['deadline-ceiling-'+side]['processing']['requestTimeoutMs']=500
 write(p.relative_to(O),d)
# Whole standalone selection/task contracts, not isolated quota deltas.
deadline=[]
for pkg in ['api-flow','http','openapi']:
 pn='kubeclaw.'+pkg;task=read(O/f'task-fixtures/config/{pkg}.task.json')
 if pkg=='api-flow':
  flow=read(O/'task-fixtures/repository/flow-one.json');flow['steps'][0]['timeoutMs']=800;write('task-fixtures/repository/flow-deadline800.json',flow);task['flowFile']='flow-deadline800.json'
 write(f'task-fixtures/config/{pkg}.deadline-ceiling.task.json',task)
 item={'packageId':pn,'originalSettingId':{'api-flow':'RT-b8eb5e344f496d7c','http':'RT-6a3cdfc223a3c24b','openapi':'RT-550d941bb663f8fc'}[pkg],'task':f'task-fixtures/config/{pkg}.deadline-ceiling.task.json','entries':{},'completeProfiles':{'A':'deadline-ceiling-A','B':'deadline-ceiling-B'},'sameSoleDefault':500,'ceilings':{'A':1000,'B':500},'invocationNativeRemainingDeadlineMinimum':1000,'status':'not-run'}
 for side in ['A','B']:
  r=copy.deepcopy(root);next(t for t in r['pluginSelections'] if t['packageId']==pn)['profileId']='deadline-ceiling-'+side;file=f'fixtures/entries/{pn}.deadline-ceiling-{side}.pipeline.config.json';write(file,r);item['entries'][side]=file
 item['classification']='source-supported task request800 → proposed effective800/500; task50 masks both; omitted task uses500 both; default<=ceiling valid' if pkg=='api-flow' else 'ADMISSION/RELATION ONLY for added ceiling: same default500 <=both ceilings yields500/500; no independent cap effect exists in current no-step caller. Original default50/500 pair still meaningful; do not substitute metadata cap difference for original effect.'
 item['negativeRelations']=['default501 ceiling500 rejects whole owner even if profile unselected','0/noninteger/out-of-domain rejects schema','request default500 ceiling500 equality admitted','original package/native/invocation/deadline binding cannot be raised or reset to create a witness']
 deadline.append(item)
write('deadline-ceiling-contracts.json',{'qualification':'Explicit complete03 definition, not timed/native/provider execution','families':deadline,'httpOpenapiCeilingEffectObligation':'No original case waived. Additional ceiling is admission cap/relationship; independent effect contrast unavailable under valid same-default no-step caller. Actual original requestTimeoutMs cases continue to use existing sole-default50/500 complete pairs and real future timeout oracle.'})
# Current field schema identity/node must be physically resolved, not string-swapped.
fields=read(OLD/'field-definitions.json');by={};fieldHistory=[]
for r in fields['rows']:
 fieldHistory.append({'id':r['id'],'priorActiveTargetSchemaBinding':copy.deepcopy(r['targetSchemaBinding'])})
 b=r['targetSchemaBinding'];b['path']=b['path'].replace('runtime-provider-contracts-02/','runtime-provider-contracts-03/');b['exactNode']=pointed(b);b['schemaSha256']=sha(b['path']);b['normativeGeneration']='runtime-provider-contracts-03/pipeline-entry.v5';r['status']='corrective03 proposal; independent material recheck REQUIRED; originals not-run'
 r['activeSchemaIdentity']=copy.deepcopy(b);by[r['id']]=r
write('history/active-field-schema-bindings-02.json',fieldHistory);write('field-definitions.json',fields)
cases=read(OLD/'case-definitions.json');history=[];memberCount=0
for c in cases['cases']:
 history.append({'id':c['id'],'priorActivePerMemberFieldContracts':copy.deepcopy(c.get('perMemberFieldContracts',[]))})
 for member in c.get('perMemberFieldContracts',[]):
  binding=copy.deepcopy(by[member['settingId']]['targetSchemaBinding']);assert pointed(binding)==binding['exactNode'];member['completeOwnerSchemaRef']=binding;member['normativeGeneration']='runtime-provider-contracts-03/pipeline-entry.v5';member['historyRef']='history/active-case-member-contracts-02.json#'+c['id'];memberCount+=1
 c['correction03']='One normative current03 schema identity and physically resolved exact node per active member;02 member records retained only as history. Original canonical/native bodies/lifecycles unchanged.'
write('history/active-case-member-contracts-02.json',history);write('case-definitions.json',cases);assert memberCount==454
# Update active task references; retain exact prior definitions in explicitly historical member.
tp=read(O/'task-pair-index.json')
for r in tp:
 for key in ['taskA','taskB']:r[key]=r[key].replace('runtime-provider-contracts-02/','runtime-provider-contracts-03/')
write('task-pair-index.json',tp)
pi=read(O/'profile-index.json')
for r in pi:
 owner=next(o for o in owners.values() if o['registrationId']==r['registrationId']);r['wholePolicySha256']=digest(owner['profiles'][r['profileId']]);r['definition']='Complete current03 selected profile;02 construction/history unchanged'
write('profile-index.json',pi)
# Explicit C3 source/reference supersession, independently CLOSED only at that bounded seam.
sup=read(C3/'frozen-supersession.json');assert sha(C3/'schemas/generated-runtime.schema.json')==sup['correctedRuntimeSchemaSha256'];assert sha(C3/'registry-peer-reference-contract.json')==sup['correctedReferenceContractSha256'];assert sha(C3/'config/pipeline.config.json')==sup['rootSha256']
for owner in root['components']:
 if owner=='buster-engine':
  old=read(B/'c3-buster-complete-profile-02/config/components/buster-engine.config.json');new=read(C3/'config/components/buster-engine.config.json');assert old==new
 else:assert (B/'c3-buster-complete-profile-02/config'/root['components'][owner]).read_bytes()==(C3/'config'/root['components'][owner]).read_bytes()
shutil.copy2(C3/'schemas/generated-runtime.schema.json',O/'schemas/c3-generated-runtime.schema.json');shutil.copy2(C3/'registry-peer-reference-contract.json',O/'c3-registry-peer-reference-contract.json')
write('c3-integrated-reference-generation.json',{'status':'Explicit03 same-entry v5 receiving reference generation; BC3-R02-01 closed only at bounded source/reference seam, NOT whole C3/C0/native approval','basePolicyAndRoot':'C3v4 six owner/root/settings unchanged02↔03; provider03 retains whole explicit provider-network-A clone','oldBase02RuntimeSchemaSha256':sup['base']['runtimeSchemaSha256'],'activeRuntimeSchema':{'path':'schemas/c3-generated-runtime.schema.json','sha256':sha(O/'schemas/c3-generated-runtime.schema.json'),'source':str(C3/'schemas/generated-runtime.schema.json')},'activeReferenceContract':{'path':'c3-registry-peer-reference-contract.json','sha256':sha(O/'c3-registry-peer-reference-contract.json'),'source':str(C3/'registry-peer-reference-contract.json')},'supersession':{'path':str(C3/'frozen-supersession.json'),'sha256':sha(C3/'frozen-supersession.json')},'independentBoundedReview':{'path':str(CR/'README.md'),'sha256':sha(CR/'README.md'),'finding':'BC3-R02-01 CLOSED source/reference only'},'receivingDelta':'same captured producer optional worker registryCaFile and HTTPS paired name refs vs auth/trust-absent HTTP lab, repeated scanner/container references must equal original receipt. Node containerd CA separate; no invented Node fetch CA. Genuine applicable trust/role/grant/credential/provider/history receipts still gate activation.'})
assoc=read(O/'network-resource-association.json');assoc['activeC3ReceivingReference']='c3-integrated-reference-generation.json';assoc['priorC3ReceivingReference']='frozen02 runtime-schema/reference contract historical, no current latest lookup';write('network-resource-association.json',assoc)
# Regenerate exact selected receiving bindings after profiles/root/schema identities are final.
bindings=read(O/'package-binding-identities.json')
for b in bindings:b['targetOwnerSchemaDigest']='sha256:'+sha(O/f'schemas/{b["packageId"]}.schema.json')
write('package-binding-identities.json',bindings)
for item in read(O/'generated-view-index.json'):
 d=read(O/item['path']);pn=item['package'];t=next(t for t in root['pluginSelections'] if t['packageId']==pn);p=owners[pn]['profiles'][t['profileId']];binding=next(b for b in bindings if b['packageId']==pn);d['selectedPolicy'].update(copy.deepcopy(p));d['selectedPolicy']['binding'].update(rootDigest='sha256:'+sha(O/'config/pipeline.config.json'),ownerDigest='sha256:'+sha(O/f'config/plugins/{pn}.config.json'),profileDigest='sha256:'+digest(p),ownerSchemaDigest=binding['targetOwnerSchemaDigest'],taskSchemaDigest='sha256:'+sha(O/f'schemas/{pn}.task.schema.json'));d['taskSchemaDigest']=d['selectedPolicy']['binding']['taskSchemaDigest'];write(item['path'],d)
text=(OLD/'check-corrections.mjs').read_text().replace('runtime-provider-contracts-02','runtime-provider-contracts-03');(O/'check-corrections.mjs').write_text(text)
write('correction-summary.json',{'findings':['RPR02-01','RPR02-02'],'originalRows':67,'originalCases':408,'completeOwnerProfiles':60,'activeMemberBindings':454,'authorStatus':'finite correction definition prepared; fresh independent material recheck REQUIRED','futureCases':'not-run','implementationAuthorization':None,'globalC0Accepted':False})
print(json.dumps({'profiles':60,'activeMemberBindings':memberCount,'deadlineFamilies':3,'C3RuntimeSchema':sup['correctedRuntimeSchemaSha256']}))
