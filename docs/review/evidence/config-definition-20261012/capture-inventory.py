import json, hashlib, re, subprocess
from pathlib import Path
from collections import Counter
from datetime import datetime, timezone

root=Path(__file__).resolve().parents[4]
out=root/'docs/review/remediation/config-scope-inventory-20261012.json'
def relative(p): return str(p.relative_to(root))
def identity(p): return {'path':relative(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
schemas={}; plugins=[]; identities={}
def schema_fields(value, location='$'):
    if not isinstance(value,dict): return []
    rows=[]
    for key,spec in value.get('properties',{}).items():
        if not isinstance(spec,dict): continue
        path=location+'.'+key
        rows.append({'path':path,'required':key in value.get('required',[]),'type':spec.get('type'),
                     'reference':spec.get('$ref'),'hasDefaultAnnotation':'default' in spec,
                     'hasConst':'const' in spec,'enum':spec.get('enum'),
                     'classification':'requires actual consumer classification; schema declaration only'})
        rows+=schema_fields(spec,path)
    if isinstance(value.get('items'),dict): rows+=schema_fields(value['items'],location+'[]')
    for key in ['$defs','definitions']:
        for name,spec in value.get(key,{}).items(): rows+=schema_fields(spec,location+'.'+key+'.'+name)
    for key in ['allOf','anyOf','oneOf']:
        for i,spec in enumerate(value.get(key,[])): rows+=schema_fields(spec,location+'.'+key+'['+str(i)+']')
    return rows
for family in ['common','nova','buster']:
    directory=root/'skills'/family/'plugins'
    for manifest in sorted(directory.glob('*/plugin.json')):
        value=json.loads(manifest.read_text()); identities[relative(manifest)]=identity(manifest)
        registrations=[]
        for kind,items in value.items():
            if not isinstance(items,list):continue
            for item in items:
                if not isinstance(item,dict) or not any(k in item for k in ['configSchema','module','requiredCapabilities']):continue
                configs={k:v for k,v in item.items() if 'config' in k.lower() and isinstance(v,str)}
                for ref in configs.values():
                    p=manifest.parent/ref
                    if p.is_file() and p.suffix=='.json':
                        schema=json.loads(p.read_text());schemas[relative(p)]={'source':identity(p),'fields':schema_fields(schema)}
                        identities[relative(p)]=identity(p)
                registrations.append({'kind':kind,'id':item.get('id'),'type':item.get('type'),
                                      'module':item.get('module'),'configReferences':configs,
                                      'requiredCapabilities':item.get('requiredCapabilities',[])})
        plugins.append({'family':family,'id':value.get('id'),'manifest':relative(manifest),
                        'apiVersion':value.get('apiVersion'),'registrations':registrations,
                        'targetOwner':'plugin:'+value.get('id','unknown'),
                        'migrationStatus':'not inferred from presence of config schemas'})
production=[];candidates=[]
for directory in ['skills/common','skills/nova','skills/buster','skills/prism','skills/worker','tools','scripts','charts','docker','ops','gitops']:
    base=root/directory
    for p in sorted(base.rglob('*')):
        if not p.is_file() or p.suffix not in ['.ts','.mts','.js','.mjs','.c','.go','.sh','.json','.yaml','.yml']:continue
        parts=p.relative_to(root).parts
        if any(s in parts for s in ['tests','test','fixtures','node_modules','evidence','.git']) or re.search(r'\.(test|spec)\.',p.name) or p.name.endswith('_test.go'):continue
        production.append(p)
        if p.suffix not in ['.ts','.mts','.js','.mjs','.sh','.go']:continue
        text=p.read_text(errors='replace')
        for i,line in enumerate(text.splitlines(),1):
            markers=[]
            if re.search(r'process\.env|\benvironment\.[A-Z]|\benv\.[A-Z]|os\.Getenv|\$\{[A-Z][A-Z0-9_]*:',line):markers.append('environment-input candidate')
            if '??' in line and re.search(r'\d|http|path|model|timeout|limit|default|profile',line,re.I):markers.append('fallback candidate')
            if re.search(r'\bDEFAULTS?\b|\bdefault[A-Z]\w*\s*=',line):markers.append('named-default candidate')
            if markers:candidates.append({'path':relative(p),'line':i,'markers':markers,'status':'discovery only; not proof of configurable setting or migration gap'})
extra='''skills/common/plugin-runtime/foundation/config/swarm-bundle.ts
skills/common/plugin-runtime/foundation/config/swarm.ts
skills/common/plugin-runtime/foundation/config/swarm.schema.json
skills/common/plugin-runtime/foundation/config/swarm-components.schema.json
skills/common/plugin-runtime/foundation/config/platform.ts
skills/common/plugin-runtime/foundation/config/platform.schema.json
skills/common/plugin-runtime/foundation/registry/configuration.ts
skills/nova/core/cli.ts
skills/nova/core/execution/engine.ts
skills/nova/core/execution/engine-runtime.ts
skills/nova/core/test-gates/runtime-config.ts
skills/nova/project/cli.ts
skills/nova/project/compiler.ts
skills/nova/project/recovery.ts
skills/common/plugin-runtime/foundation/registry/schema.ts
skills/common/plugins/artifact-store/src/adapter.ts
skills/common/plugins/network-http/src/adapter.ts
skills/nova/plugins/review/src/repository-review-profile.ts
skills/prism/engine/design-providers.ts
skills/prism/server/control-config.ts
skills/prism/server/worker-config.ts
charts/kubeclaw/values.yaml
charts/prism/values.yaml
docs/review/remediation/decisions.md'''.splitlines()
def setting_paths(value, prefix='settings'):
    if isinstance(value,dict):
        return [row for key,child in value.items() for row in setting_paths(child,prefix+'.'+key)]
    return [{'path':prefix,'valueType':type(value).__name__,'source':'explicit component author; consumer classification still required'}]
components=[]
for p in sorted((root/'charts/kubeclaw/files/config').glob('*.config.json')):
    value=json.loads(p.read_text());components.append({'path':relative(p),'owner':value.get('owner'),'schemaVersion':value.get('schemaVersion'),'settingFields':setting_paths(value.get('settings',{}))})
    identities[relative(p)]=identity(p)
entry=root/'charts/kubeclaw/files/config/swarm.config.json';identities[relative(entry)]=identity(entry)
for s in extra:
    p=root/s;identities[s]=identity(p)
result={'observedAtUtc':datetime.now(timezone.utc).isoformat(),'head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),
        'mode':'read-only production code/schema discovery for definition; no implementation, activation or F1 completeness assertion',
        'pluginCounts':dict(Counter(p['family'] for p in plugins)), 'plugins':plugins,
        'configurationSchemas':schemas,'currentEntry':json.loads(entry.read_text()),'currentComponents':components,
        'scannedProductionFileCount':len(production),'discoveryCandidates':candidates,
        'sourceIdentities':list(identities.values()),
        'limits':['Only manifest-declared config schema fields captured; external $refs not expanded.',
                  'Discovery markers require semantic classification; absence of marker does not prove absence of code constants.',
                  'No test/image/consumer migration acceptance inferred.',
                  'Current pipeline CLI means workflow graph, not proposed system entry.',
                  'No secret environment or private credential files inspected.']}
out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'file':str(out),'plugins':len(plugins),'pluginCounts':result['pluginCounts'],'configSchemas':len(schemas),'sourcesBound':len(identities),'productionFilesScanned':len(production),'discoveryCandidates':len(candidates)}))
