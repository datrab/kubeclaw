import json,hashlib
from pathlib import Path
O=Path('docs/review/evidence/config-acceptance/c0-completion-20261013/browser-provider-contracts-01');read=lambda p:json.loads(Path(p).read_text());sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest();write=lambda n,x:(O/n).write_text(json.dumps(x,indent=2)+'\n')
p=O/'schemas/kubeclaw.axe.schema.json';s=read(p);node=s['properties']['profiles']['additionalProperties']['properties']['processing']['properties']['profiles'];node['maxProperties']=34;node['description']='Derived complete owned merged business map domain: current2 builtin presets plus up to32 distinct custom profiles can expose34 total. Fixed raw legacy import custom32 guard remains current-only; future captured map has no unowned builtin fallback. No native combination/browser/grant cap is raised.';write('schemas/kubeclaw.axe.schema.json',s)
fields=read(O/'field-definitions.json')['rows']
for f in fields:
 if f['provider']=='axe'and f['classification']!='task-data':
  b=f['targetSchemaBinding'];b['sha256']=sha(p);n=s
  for k in b['pointer'].strip('/').split('/'):n=n[k]
  b['exactNode']=n
write('field-definitions.json',{'rows':fields});by={f['id']:f for f in fields};cases=read(O/'case-definitions.json')
for c in cases['cases']:
 for m in c['perMemberFieldContracts']:m['completeOwnerSchemaRef']=by[m['settingId']]['targetSchemaBinding']
write('case-definitions.json',cases)
base=read(O/'stand/config/plugins/kubeclaw.axe.config.json');q=base['profiles']['A']['processing'];custom={f'custom-{i:02}':dict(q['profiles']['desktop'])for i in range(32)};write('task-fixtures/repository/current-custom32-profile-domain.json',{'schemaVersion':'kubeclaw.browser-profiles.v1','profiles':custom});merged={**q['profiles'],**custom};owner=read(O/'stand/config/plugins/kubeclaw.axe.config.json');owner['profiles']['A']['processing']['profiles']=merged;write('fixtures/axe-merged34-complete-owner-control.json',owner)
write('axe-merged-map-domain-contract.json',{'actualCurrentMeaning':'readProfiles starts with source BUILTIN desktop/mobile2, then accepts up to32 custom names; if none overwrite builtin names, mergedmap34 exists. Selected list1..16 and native combination32 constrain actual requests separately. Target complete map captures these explicit34 businessprofiles, no unowned builtin fallback. Prior source rawcustom32 guard and retired rawfile admission preserved, no native count cap widened.','currentImportFixture':'task-fixtures/repository/current-custom32-profile-domain.json','completeTargetControl':'fixtures/axe-merged34-complete-owner-control.json','currentControlSelections':[list(custom)[:16],list(custom)[16:],['desktop','mobile']],'futureCurrentWireQualification':'Only existing named2-profile A/B maps have full disposable rawfile translation. 34 merged source map control uses genuine32-entry legacy customfile plus real source builtin2; a34-custom rawfile is INVALID. New v2 captured sole owner replaces this import path explicitly, not silently passing34 through currentrawfile reader.','effectStatus':'not-run; grammar/merged-map domain proof not native browser launch/render/version/grant evidence'})
print(json.dumps({'derivedCapturedMapMax':34,'currentRawCustomMax':32,'noNativeCapIncrease':True}))
