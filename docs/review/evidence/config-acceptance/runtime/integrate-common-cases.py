#!/usr/bin/env python3
"""Integrate bounded C0 case specs without treating target profiles as current schema inputs."""
import json,pathlib,copy,hashlib
P=pathlib.Path('docs/review/evidence/config-acceptance/runtime'); H=P/'checkpoints/runtime-closure-input';H.mkdir(parents=True,exist_ok=True)
def read(n):return json.loads((P/n).read_text())
def save(n,x):(P/n).write_text(json.dumps(x,indent=2)+'\n')
for n in ['inventory-fragment.json','case-proposals.json','common-field-case-proposals.json']:
 if not (H/n).exists():(H/n).write_bytes((P/n).read_bytes())
profiles=read('common-complete-profiles.json')
omissions={'artifact-store':['maximumRecordBytes'],'telemetry-store':['jsonMaximumDepth','jsonMaximumNodes'],'command-runner':['maximumProcesses','memoryBytes','cpuMillis','openFiles'],'redis-transport':['maximumPayloadBytes','maximumBulkReplyBytes','maximumReplyHeaderBytes'],'transport-publisher':['terminalReservationBytes','deliveryMetadataAllowanceBytes','jsonMaximumDepth'],'operator-messaging':['terminalReservationBytes','deliveryMetadataAllowanceBytes','jsonMaximumDepth','jsonMaximumContainerEntries','targets.receiptMode'],'notification-observer':['presentationFallbackMode','unknownSeverity'],'openclaw-agent-events':['observedFieldsMaximum','observedFieldNameCharacters','identityCharactersMaximum'],'runtime-dispatch:runtime':['jsonMaximumDepth','jsonMaximumContainerEntries','jsonKeyCharactersMaximum'],'runtime-dispatch:openclaw':['sessionListCacheMs','collectorWaitSeconds','recentListMinimumMinutes','recentListMarginMinutes','pollExponentialMaximumPower','cleanupPollMs','maximumResultBytes','targets.resultMode']}
current=copy.deepcopy(profiles)
for plugin,keys in omissions.items():
 for key in keys:
  if key.startswith('targets.'):
   for target in current[plugin]['targets'].values():target.pop(key.split('.',1)[1],None)
  else:current[plugin].pop(key,None)
save('common-current-schema-profiles.json',{'status':'explicit current schema definition control, not deployed selection or consumer effect; omitted target-only fields remain inventoried literal policies and proposed migration work','omittedTargetOnlyFields':omissions,'profiles':current})
cases=read('common-field-case-proposals.json');rows=read('inventory-fragment.json');byid={r['id']:r for r in rows['rows']}
for c in cases:
 ip=c['inputProfile'];ip['profileProvenance']='Fictional proposed TARGET profiles including new explicit literals currently NOT accepted as schema keys. Not current complete valid platform input, not deployed/operator selected values. Separate current-schema profiles retain supported keys only; production migration and real runtime checks not-run.'
 ip['completeTargetPreservedProfile']=ip.pop('completePreservedProfile',ip.get('completeTargetPreservedProfile'))
 c['definitionEvidence']=['docs/review/evidence/config-acceptance/runtime/common-profile-schema-observations.json','docs/review/evidence/config-acceptance/runtime/common-current-schema-observations.json']
 if c['id'].endswith('-CONTRACT'):
  c['specification']['missingInput']['currentOptionality']=not byid[c['settings'][0]]['current']['required']
  c['specification']['expectedReject']='PROPOSED migrated owned-profile boundary must reject before effect. Current parser/domain observations separately cited; new literal-policy fields have no current schema key.'
  c['specification']['positiveControl']='Complete target preserved profile after approved migration reaches cited consumer; C0 current schema control uses separately recorded supported-key profile; no current effect claimed.'
  c['expectedEffectOrRejectingBoundary']=copy.deepcopy(c['specification'])
 for sid in c['settings']:
  row=byid[sid];row['evidence']=list(dict.fromkeys(row['evidence']+c['definitionEvidence']));row['current']['externalProfileStatus']='unknown exact deployed --platform/file/package/owner profile values; schema/literal-equivalent controls are not operator selection'
save('common-field-case-proposals.json',cases)
old=read('case-proposals.json');ids={c['id'] for c in old};added=[]
for c in cases:
 if c['id'] in ids:
  i=next(i for i,x in enumerate(old) if x['id']==c['id']);old[i]=c
 else:old.append(c);added.append(c['id'])
rows['status']='incremental C0 source/definition work; common field cases integrated; C0 NOT CLOSED, independent semantic/exhaustive review pending'
save('case-proposals.json',old);save('inventory-fragment.json',rows)
save('common-case-integration.json',{'status':'bounded C0 integration; no production/test implementation','history':'checkpoints/runtime-closure-input','addedCases':added,'futureCases':len(cases),'allCases':len(old),'allFutureResultsRemainNotRun':all(c['result']=='not-run' for c in cases),'corrections':['currentOptionality inverted boolean repaired','current vs target profile authority distinguished','actual current schema failures retained, not claimed successful']})
print(json.dumps({'added':len(added),'totalCases':len(old)}))
