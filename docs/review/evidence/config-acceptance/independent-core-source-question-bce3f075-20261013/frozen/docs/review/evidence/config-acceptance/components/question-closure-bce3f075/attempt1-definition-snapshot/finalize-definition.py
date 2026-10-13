from pathlib import Path
import json,copy,hashlib,re
O=Path('docs/review/evidence/config-acceptance/components/question-closure-bce3f075');dump=lambda n,x:(O/n).write_text(json.dumps(x,indent=2)+'\n');H=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
profiles=json.load(open(O/'complete-profiles.json'))
base={'schemaVersion':'pipeline-platform.v2','installationRoots':['${CASE_ROOT}/installed'],'trustedBuiltinRoots':['${CASE_ROOT}/installed'],'externalTrust':{'allowedSourceDigests':{},'verifiedAttestations':{}},'providers':{},'grants':{},'adapters':{},'activeAdapters':[],'observers':{},'storageRoot':'${CASE_ROOT}/state','shutdownTimeoutMs':1000,'effectLockTtlMs':300000,'orchestratorIssuerId':'c0-question-fixture','administrativeDecisionIssuers':[]}
profiles['NovaProfiles']['completeDefinitionFixtures']=[]
for name in ['A','B']:
 p=copy.deepcopy(base);p['observability']={'admission':profiles['NovaProfiles'][name]['admission']};p['projectScaffold']=profiles['NovaProfiles'][name]['projectScaffold'];profiles['NovaProfiles']['completeDefinitionFixtures'].append({'id':name,'author':p,'scope':'complete synthetic existingPlatformConfig companion plus proposed requiredextensions; no deployedauthority/profileclaim','materialization':'replace CASE_ROOT by fresh absolute temporary root; create installed/state directories; noexternalplugins/services'})
dump('complete-profiles.json',profiles)
component=json.load(open('skills/common/plugin-runtime/foundation/config/swarm-components.schema.json'));adm=component['$defs']['buster-execution-store-admission'];props={'reasonThresholdCodeUnits':{'type':'integer','minimum':72,'maximum':256},'reasonPrefixCodeUnits':{'type':'integer','minimum':0,'maximum':180},'metadataReserveBytes':{'type':'integer','minimum':1,'maximum':9007199254740991},'lockWaitSeconds':{'type':'integer','minimum':1,'maximum':5}}
for key,value in props.items():adm['properties'][key]=value;adm['required'].append(key)
prep=component['$defs']['buster-preparation'];prep['properties']['tarDiagnosticCodeUnits']={'type':'integer','minimum':1,'maximum':4096};prep['required'].append('tarDiagnosticCodeUnits');dump('proposed-buster-component.schema.json',component)
platform=json.load(open('skills/common/plugin-runtime/foundation/config/platform.schema.json'));platform['required']+=['observability','projectScaffold'];platform['properties']['observability']={'type':'object','additionalProperties':False,'required':['admission'],'properties':{'admission':copy.deepcopy(adm)}};platform['properties']['projectScaffold']={'type':'object','additionalProperties':False,'required':['lockWaitSeconds'],'properties':{'lockWaitSeconds':{'type':'integer','minimum':1,'maximum':5}}};dump('proposed-nova-platform.schema.json',platform)
# Explicit outer constructors + alias chains; no lexical claim that seven sites == seven deployed instances.
classes=['FileWorkerOwnershipStore','NativeAttemptJournal','FileBusterFixtureJournal','PreparedBusterPlanJobStore','FileBusterPlanJobStore','HistoricalBusterPlanJobStore','PreparationSourceLedger','FileNovaRemotePlanStore','FileNovaGateImportStore','FileDurableAttemptStore','AttemptState']
outer=[]
for basepath in ['skills','scripts']:
 for p in Path(basepath).rglob('*'):
  if p.suffix not in ['.ts','.mjs','.js']:continue
  if '/tests/' in str(p):continue
  for i,line in enumerate(p.read_text().splitlines(),1):
   if any('new '+c+'(' in line for c in classes):outer.append({'path':str(p),'line':i,'sha256':H(p),'sourceText':line})
dump('outer-constructor-and-alias-chains.json',{'outerConstructors':outer,'aliases':[{'path':'skills/buster/engine/test-gates/remote-plan-service.ts','line':21,'sha256':H('skills/buster/engine/test-gates/remote-plan-service.ts'),'binding':'PreparedBusterPlanJobStore as FileBusterPlanJobStore -> production.ts:52'},{'path':'skills/nova/core/test-gates/remote-dispatch.ts','line':21,'sha256':H('skills/nova/core/test-gates/remote-dispatch.ts'),'binding':'FileNovaRemotePlanStore reexport -> production.ts:103/retire-nova-dispatch.mjs:79'},{'path':'skills/common/plugin-runtime/foundation/package.json','line':10,'sha256':H('skills/common/plugin-runtime/foundation/package.json'),'binding':'public wildcardobservability exports; externalinstalled/dynamicconsumer roster unknown'}],'boundedSiteDistinctions':{'FileBusterFixtureJournal':'bounded nestedconstructor only; no productive outerconstructor found; publictyped injection site, externalcaller unknown','HistoricalBusterPlanJobStore':'maintenance compact-buster-job.mjs outerconstructor, not evidence of currentnormal writer','NovaImportStore':'production standalone runtime/registeredremote-test-gate adapter/evidenceadapter plusretirement paths have DISTINCT existingauthors; no one universalNovaquotaauthor'},'externalUnknown':'Repository source cannot prove installed external/dynamic consumers absent. They must provideown existingquota/lock policy before targetactivation.'})
lock=json.load(open(O/'lock-owner-map.json'))
for r in lock['rows']:
 if '/nova/plugins/' in r['path']:r['soleOwningAuthority']='existing registered '+r['path'].split('/plugins/')[1].split('/')[0]+' adapter config; not a foundation owner'
 if '/worker/core/' in r['path']:r['soleOwningAuthority']='Reusable Corestore implementation; actual outercaller is parent Prism worker or Buster preparation, EACH ownexistingroleauthor; generated rootpolicy projection, no new globalCoreauthor'
 if '/nova/core/test-gates/' in r['path']:r['soleOwningAuthority']='Reusable Nova gate store; source-specific standalone runtime-config author OR registered remote-test-gate adapter config determined by actual outercaller; same physicalroot requires identicalcapturedowner'
lock['outerConstructorChains']='outer-constructor-and-alias-chains.json';dump('lock-owner-map.json',lock)
blob=json.load(open(O/'blob-owner-map.json'));blob['productiveConstructors']=[r for r in lock['rows'] if 'new FileDurableBlobStore(' in r['sourceText']];blob['deployedInstancesClaim']=False;blob['outerCallerChains']='outer-constructor-and-alias-chains.json';dump('blob-owner-map.json',blob)
# Existing exact upstream native handoff facts; retain still-open paired service/credential domains as genuine owned obligations.
delivery=Path('docs/review/evidence/config-acceptance/delivery');up={}
for n in ['native-provisioning-contracts-bce3f075.json','target-binding-proposals-bce3f075.json','native-host-definitions-bce3f075.json','delivery-remaining-obligations-bce3f075.json','delivery-stable-completion-bce3f075-followup.json']:
 p=delivery/n
 if p.exists():up[str(p)]={'sha256':H(p),'scope':'delivery-owned source/physicalbinding definition; no Core alias to same numericvalue','snapshot':json.load(open(p))}
dump('delivery-linked-handoff.json',up)
print('complete proposed schemas/profiles and outercaller chains written')
