from pathlib import Path
import json,hashlib,datetime
base=Path(__file__).parent
report=Path('docs/review/remediation/implementation/config-transport-observers-plugin-inventory-20260921.md')
sources={report}; coverage=[]
for name,regs in [('redis-transport',['publisher','telemetry']),('transport-publisher',['publisher']),('agent-observability',['ingester','evidence']),('openclaw-agent-events',['source'])]:
 root=Path('skills/common/plugins')/name
 sources.update(p for p in root.rglob('*') if p.is_file())
 schema=json.loads((root/'schemas/config.schema.json').read_text());fields=[]
 for key,value in schema.get('properties',{}).items():
  assert key in report.read_text();fields.append({'path':key,'required':key in schema.get('required',[]),'schema':value})
  nested=value.get('additionalProperties')
  if isinstance(nested,dict) and 'properties' in nested:
   for k,v in nested['properties'].items():
    assert k in report.read_text();fields.append({'path':key+'.*.'+k,'requiredInTarget':k in nested.get('required',[]),'schema':v})
 coverage.append({'plugin':name,'registrations':regs,'fields':fields})
for p in ['skills/common/plugin-runtime/foundation/registry/configuration.ts','skills/common/plugin-runtime/foundation/registry/schema.ts','skills/common/plugin-runtime/foundation/registry/capabilities.ts','skills/common/plugin-runtime/foundation/registry/capability-vocabulary.ts','skills/nova/core/execution/authorization.ts','skills/nova/core/execution/adapter-startup.ts','skills/nova/core/telemetry/observer-delivery.ts','skills/nova/core/telemetry/observers.ts','skills/common/plugin-runtime/sdk/src/values.ts','skills/common/plugin-runtime/foundation/observability/durable-records.ts','skills/common/plugin-runtime/foundation/observability/durable-delivery.ts','skills/common/plugins/network-http/src/adapter.ts']:
 sources.add(Path(p))
rows=[]
for p in sorted(sources):
 data=p.read_bytes(); dest=base/'sources'/p;dest.parent.mkdir(parents=True,exist_ok=True)
 if dest.exists(): assert dest.read_bytes()==data, str(dest)
 else:
  with dest.open('xb') as f:f.write(data)
 rows.append({'path':str(p),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
(base/'source-identities.json').write_text(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'runtimeExecuted':False,'scope':'Named inventory sources and all four plugin trees; not a full transitive executable closure','files':rows},indent=2)+'\n')
(base/'schema-coverage.json').write_text(json.dumps({'uniqueConfigFieldPatterns':sum(len(x['fields']) for x in coverage),'registrationConfigFieldPatterns':sum(len(x['fields'])*len(x['registrations']) for x in coverage),'plugins':coverage},indent=2)+'\n')
print(len(rows),'sources',sum(len(x['fields']) for x in coverage),'unique config field patterns')
