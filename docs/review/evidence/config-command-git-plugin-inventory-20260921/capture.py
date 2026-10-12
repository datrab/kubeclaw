from pathlib import Path
import json,hashlib,datetime
base=Path('docs/review/evidence/config-command-git-plugin-inventory-20260921');report=Path('docs/review/remediation/implementation/config-command-git-plugin-inventory-20260921.md');text=report.read_text()
fields=[];closure=[]
for plugin in ['command-runner','git-workspace']:
 root=Path('skills/common/plugins')/plugin
 closure += [root/'plugin.json',root/'package.json',root/'schemas/config.schema.json',*sorted((root/'src').glob('*.ts'))]
 schema=json.loads((root/'schemas/config.schema.json').read_text())
 for key,value in schema['properties'].items():
  assert '`'+key+'`' in text,key
  fields.append({'plugin':plugin,'field':key,'required':key in schema['required'],'completeSchemaConstraints':value,'reportCovered':True})
assert len(fields)==14
closure += [Path(p) for p in ['skills/common/plugin-runtime/foundation/processes/linux-process-group.ts','skills/common/plugin-runtime/foundation/registry/configuration.ts','skills/common/plugin-runtime/foundation/registry/capability-vocabulary.ts','skills/common/plugin-runtime/foundation/registry/digest.ts','skills/nova/core/execution/authorization.ts','skills/nova/core/execution/engine-snapshots.ts','skills/buster/engine/test-gates/direct-command-runtime.ts']]
rows=[]
for p in closure+[report]:
 data=p.read_bytes();dest=base/'sources'/p;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data);rows.append({'path':str(p),'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)})
(base/'schema-coverage.json').write_text(json.dumps({'topLevelFieldCount':len(fields),'command':6,'git':8,'nestedConstraintsPreserved':True,'fields':fields},indent=2)+'\n')
(base/'source-identities.json').write_text(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Named source inventory, not runtime proof or complete external dependency inventory','runtimeExecuted':False,'files':rows},indent=2)+'\n')
print(len(rows),'source snapshots;',len(fields),'schema fields')
