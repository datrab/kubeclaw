from pathlib import Path
import json,hashlib,datetime
base=Path('docs/review/evidence/config-runtime-remote-plugin-inventory-20260921');report=Path('docs/review/remediation/implementation/config-runtime-remote-plugin-inventory-20260921.md');text=report.read_text();rows=[];coverage=[];sources=set()
for plugin,registrations in [('skills/common/plugins/runtime-dispatch',{'runtime':'config.schema.json','openclaw':'openclaw-config.schema.json'}),('skills/nova/plugins/remote-test-gate',{'plan':'config.schema.json','evidence':'evidence-config.schema.json'})]:
 root=Path(plugin);sources.update(root.glob('src/*.ts'));sources.update([root/'plugin.json',root/'package.json'])
 for registration,schemafile in registrations.items():
  p=root/'schemas'/schemafile;sources.add(p);schema=json.loads(p.read_text());fields=[]
  for key,value in schema['properties'].items():
   assert key in text,key;fields.append({'path':key,'required':key in schema.get('required',[]),'schema':value})
   nested=value.get('additionalProperties')
   if isinstance(nested,dict) and 'properties' in nested:
    for nk,nv in nested['properties'].items():
     assert nk in text,nk;fields.append({'path':key+'.*.'+nk,'requiredInTarget':nk in nested.get('required',[]),'schema':nv})
  coverage.append({'plugin':plugin,'registration':registration,'schema':str(p),'fields':fields,'conditionalConstraints':schema.get('allOf',[])})
for name in ['production','remote-dispatch','remote-dispatch-store','remote-result-import','secure-endpoint','source-snapshot','source-git','source-process-lifecycle','dispatch-operation','http-response','deadline']:
 sources.add(Path('skills/nova/core/test-gates')/(name+'.ts'))
for name in ['configuration','capabilities','capability-vocabulary']:
 sources.add(Path('skills/common/plugin-runtime/foundation/registry')/(name+'.ts'))
sources.update([Path('skills/nova/core/execution/authorization.ts'),Path('skills/common/plugins/network-http/src/adapter.ts'),report])
for p in sorted(sources):
 data=p.read_bytes();dest=base/'sources'/p;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data);rows.append({'path':str(p),'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)})
(base/'schema-coverage.json').write_text(json.dumps({'scope':'All four registration schemas including map containers, target properties and nested/conditional constraints','fieldPatterns':sum(len(x['fields']) for x in coverage),'registrations':coverage},indent=2)+'\n')
(base/'source-identities.json').write_text(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'runtimeExecuted':False,'scope':'Named source inventory, not a complete runtime dependency closure or deployed configuration','files':rows},indent=2)+'\n')
print(len(rows),'sources;',[(x['registration'],len(x['fields'])) for x in coverage])
