import json,copy,hashlib
from pathlib import Path
O=Path('docs/review/evidence/config-acceptance/components/question-closure-bce3f075');load=lambda n:json.load(open(O/n));dump=lambda n,d:(O/n).write_text(json.dumps(d,indent=2)+'\n')
P=load('complete-profiles.json');S=load('proposed-buster-component.schema.json');lock={'type':'integer','minimum':1,'maximum':5}
for p in P['BusterProfiles']:
 n=5 if p['id']=='A' else 1
 p['author']['settings']['preparation']['storeLockWaitSeconds']=n;p['author']['settings']['execution']['stores']['attempts']['lockWaitSeconds']=n
for node in [S['$defs']['buster-engine']['properties']['preparation'],S['$defs']['buster-preparation']]:node['properties']['storeLockWaitSeconds']=lock;node['required'].append('storeLockWaitSeconds')
node=S['$defs']['buster-execution-store-attempts'];node['properties']['lockWaitSeconds']=lock;node['required'].append('lockWaitSeconds')
dump('proposed-buster-component.schema.json',S)
core=json.load(open(O.parent/'core-adjustable-profiles.json'));p=core['CMP-WCORE-INPUT-BYTES']['A'];P['CoreNativeStoreLockProfiles']=[]
for name,n in [('A',5),('B',1)]:
 c=copy.deepcopy(p);c['worker-core']['settings']['runtime']['native_store_lock_wait_seconds']=n;P['CoreNativeStoreLockProfiles'].append({'id':name,'completeExistingCompanions':c,'scope':'same EXISTING worker-core author, extends native store lock behavior only; no global foundation author; verified13 originalfields copied unchanged fromprotectedA','source':'core-adjustable-profiles.json#/CMP-WCORE-INPUT-BYTES/A','originalSourceSHA256':hashlib.sha256((O.parent/'core-adjustable-profiles.json').read_bytes()).hexdigest()})
cs=json.load(open(O.parent/'core-adjustable-target.schema.json'));node=cs['properties']['settings']['properties']['runtime'];node['properties']['native_store_lock_wait_seconds']=lock;node['required'].append('native_store_lock_wait_seconds');dump('proposed-core-native-lock.schema.json',cs)
common=json.load(open('docs/review/evidence/config-acceptance/runtime/common-complete-profiles.json'));P['RegisteredStoreAdapterProfiles']=[]
for plugin in ['artifact-store','state-store','telemetry-store','wait-store','transport-publisher','operator-messaging']:
 for name,n in [('A',5),('B',1)]:
  c=copy.deepcopy(common[plugin]);c['storeLockWaitSeconds']=n;P['RegisteredStoreAdapterProfiles'].append({'registration':plugin,'id':name,'completeConfigDefinition':c,'soleAuthor':'existing registryvalidated adapter config selected byNova wholeprofile; nosecondglobalfield','basePath':'docs/review/evidence/config-acceptance/runtime/common-complete-profiles.json#/'+plugin,'newField':'config.storeLockWaitSeconds','currentFutureDifference':'currentregistration schema mayrejectnewfield; approvedschemaextension+callerprojectionmandatory'})
P['additionalRuntimeCallers']={'BusterPreparedJob':'existing Buster runtime JSON author required storeLockWaitSeconds; production.ts:52 projects to PreparedBusterPlanJobStore records/blob/admission','NovaStandaloneGate':'existing standalone Nova runtime JSON author required storeLockWaitSeconds; runtime-config.ts->production.ts dispatch/import rootwriters','NovaRegisteredGate':'existing remote-test-gate adapter/evidence-adapter required config.storeLockWaitSeconds; distinctfromstandalone runtime evenequalvalue','DemoHandoff':'existingregistered demo-handoff config.storeLockWaitSeconds; no new foundationauthor','nativeFixture':'public FileBusterFixtureJournal constructor required limits.lockWaitSeconds fromexternalcaller existingowner; no currentouterdeploymentproved','historyReaders':'retirement/compact scripts take originalcaptured storeoptions including requiredlockwait; cannot authorcurrent/latestoverride','completePhysicalInputs':'Buster runtime author selected fullprofiles and Nova adapter/standalone physicalservice/secretprofile fromtheir existing owners are required actualharness companions, not inventeddeployedcapacity/addresses'}
dump('complete-profiles.json',P)
D=load('question-definitions.json')
for r in D['questions']:
 if r['id']=='CMP-SOURCE-FOUNDATION-FLOCK-WAIT':r['soleAuthor']['CoreNativeStores']='same existing worker-core component author proposed settings.runtime.native_store_lock_wait_seconds (copyverified13 unchanged); onlyactual Core ownership/nativejournal, not Nova/plugins/scaffold lock umbrella';r['definition']+=['add-owner-projections.py addscomplete existingBuster preparation+attempt store lock companions, same existingworker-core native lock companion, andsixcomplete currentregisteredstore configcompanions. This is distinct callerpolicy authoring, not one globalCore setting. SourceAPI publiclyinjected nativefixture and standalone/registeredNova gate physicalcompanions retain exact declaredexistingowner, never guesseddeploymentprofile.']
dump('question-definitions.json',D)
L=load('lock-owner-map.json')
for r in L['rows']:
 p=r['path'];r['rootBinding']='one existingauthor perphysicalroot; per-operationcapturedgeneration; compatiblenewwaitB maycontendwithoriginalA withoutalteringit; storageformat/quota historycompatibility separatelyrequired'
 if '/worker/core/' in p:r['targetField']='existing worker-core settings.runtime.native_store_lock_wait_seconds ->Core constructoroption lockWaitSeconds ->helper; actualPrism/Buster role projects selectedwholeCoreprofile'
 elif '/buster/' in p:
  if p.endswith('runner.ts'):r['targetField']='settings.execution.stores.attempts.lockWaitSeconds or admission.lockWaitSeconds matching exact constructor'
  elif 'prepared-plan-store' in p or 'historical-plan-store' in p:r['targetField']='sameexisting Buster runtime author storeLockWaitSeconds ->options.lockWaitSeconds; historicalcompact usescapturedstoreoptions'
  elif 'native-fixture-journal' in p:r['targetField']='required publiclimits.lockWaitSeconds fromexternalownercaller; no inrepo outerconstructor'
  else:r['targetField']='existing buster-engine settings.preparation.storeLockWaitSeconds ->ledger/preparationhistorical roothelper; not Core native storealias'
 elif '/plugins/' in p:r['targetField']='sameexisting registeredadapter config.storeLockWaitSeconds -> records/blob storeoptions; registration/schema projectionrequired'
 elif '/nova/core/test-gates/' in p:r['targetField']='sameexisting standalone Nova runtime storeLockWaitSeconds OR registeredremote-test-gate config.storeLockWaitSeconds fromactualoutercaller; options.lockWaitSeconds'
 elif '/nova/core/' in p:r['targetField']='existing selectedNova observability.admission.lockWaitSeconds; attemptstore getsproposed observability.attempts.lockWaitSeconds completecompanion'
 elif '/config/published-pair' in p:r['targetField']='soleentry selectedNova projectScaffold.lockWaitSeconds ->checkedgeneratedprojection->requiredpublishJsonPair policy argument'
 elif p.startswith('scripts/'):r['targetField']='originalcapturedscope.*Limits.lockWaitSeconds /storeOptions.lockWaitSeconds; noCLIquotaoverride'
 else:r['targetField']='requiredpassed lockWaitSeconds fromlisted concreteowner; no libraryfallback/sharedauthor'
L['completeProfiles']='complete-profiles.json';dump('lock-owner-map.json',L)
print('perowner lock profiles added; originalCore13 unchanged')
