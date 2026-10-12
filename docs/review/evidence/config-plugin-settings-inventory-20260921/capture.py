from pathlib import Path
import hashlib,json
root=Path.cwd(); evidence=root/'docs/review/evidence/config-plugin-settings-inventory-20260921'
selected=['operator-messaging','wait-store','notification-observer','telemetry-observer','network-http','secret-resolver','telemetry-store']
registrations=[]; manifests=[]
for p in sorted((root/'skills').glob('*/plugins/*/plugin.json')):
 d=json.loads(p.read_text());manifests.append({'path':str(p.relative_to(root)),'id':d['id'],'stages':len(d.get('stages',[])),'testProviders':len(d.get('testProviders',[]))})
 for kind in ['adapters','observers']:
  for entry in d.get(kind,[]):
   registrations.append({'id':d['id']+':'+entry['id'],'kind':kind,'manifest':str(p.relative_to(root)), 'module':str((p.parent/entry['module']).relative_to(root)), 'schema':str((p.parent/entry['configSchema']).relative_to(root)), 'provides':entry.get('providesCapabilities',[]),'requires':entry.get('requiredCapabilities',[]),'failurePolicy':entry.get('failurePolicy'),'inspection':'bounded field inventory' if p.parent.name in selected and p.parts[-4]=='common' else 'registration only; settings uninspected'})
(evidence/'registrations.json').write_text(json.dumps({'kind':'repository manifest roster, not deployed activation evidence','manifests':manifests,'registrations':registrations},indent=2)+'\n')
coverage=[]
for name in selected:
 p=root/'skills/common/plugins'/name/'schemas/config.schema.json';d=json.loads(p.read_text())
 properties=d.get('properties',{});item={'plugin':'kubeclaw.'+name,'schema':str(p.relative_to(root)),'topLevelProperties':list(properties),'required':d.get('required',[]),'additionalProperties':d.get('additionalProperties'),'defaults':{k:v['default'] for k,v in properties.items() if 'default' in v}}
 if name=='operator-messaging':
  target=next(iter(properties['targets']['patternProperties'].values()));item['targetProperties']=list(target['properties']);item['targetDefaults']={k:v['default'] for k,v in target['properties'].items() if 'default'in v};item['targetRequiredModes']=target['anyOf']
 coverage.append(item)
(evidence/'schema-coverage.json').write_text(json.dumps(coverage,indent=2)+'\n')
files=set()
for name in selected:
 directory=root/'skills/common/plugins'/name
 files.update(p for p in directory.rglob('*') if p.is_file() and p.suffix in {'.ts','.json','.mjs','.md'})
for row in manifests:files.add(root/row['path'])
for name in ['platform.ts','platform.schema.json']:files.add(root/'skills/common/plugin-runtime/foundation/config'/name)
for name in ['configuration.ts','schema.ts','capabilities.ts','capability-vocabulary.ts','activation.ts','discovery.ts']:files.add(root/'skills/common/plugin-runtime/foundation/registry'/name)
for name in ['engine-runtime.ts','adapters.ts','adapter-startup.ts','authorization.ts']:files.add(root/'skills/nova/core/execution'/name)
for name in ['observers.ts','observer-delivery.ts']:files.add(root/'skills/nova/core/telemetry'/name)
for name in ['scripts/observability-retirement/operator-authority.mjs','scripts/retire-wait-value.mjs','scripts/retire-operator-request.mjs','docker/buster-runtime-entrypoint.sh','skills/nova/core/cli.ts','skills/nova/project/cli.ts','skills/nova/project/legacy-import-cli.ts','docs/review/remediation/implementation/config-platform-inventory-20260921.md','docs/review/remediation/implementation/config-inventory-20260920.json']:
 files.add(root/name)
rows=[]
for p in sorted(files):
 b=p.read_bytes();relative=p.relative_to(root);snapshot=evidence/'source'/Path(str(relative)+'.snapshot');snapshot.parent.mkdir(parents=True,exist_ok=True);snapshot.write_bytes(b);rows.append({'path':str(relative),'sha256':hashlib.sha256(b).hexdigest(),'snapshot':str(snapshot.relative_to(root))})
(evidence/'source-identities.json').write_text(json.dumps(rows,indent=2)+'\n')
historical=json.loads((root/'docs/review/remediation/implementation/config-inventory-20260920.json').read_text())['entries']; prefix=tuple('skills/common/plugins/'+name+'/' for name in selected)
matches=[row for row in historical if row.get('source','').startswith(prefix)]
(evidence/'historical-rows.json').write_text(json.dumps({'note':'Preserved discovery rows relevant to selected packages; not completeness evidence','entries':matches},indent=2)+'\n')
print(json.dumps({'repositoryManifests':len(manifests),'adapterObserverRegistrations':len(registrations),'boundedRegistrations':sum(r['inspection']=='bounded field inventory' for r in registrations),'uninspectedRegistrations':sum(r['inspection']!='bounded field inventory' for r in registrations),'boundFiles':len(rows),'historicalDiscoveryRows':len(matches)}))
