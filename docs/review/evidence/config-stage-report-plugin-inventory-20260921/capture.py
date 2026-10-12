from pathlib import Path
import json,hashlib,re,datetime
b=Path(__file__).parent
sources=set(); roster=[]; registrations=[]
for p in sorted(Path('skills').rglob('plugin.json')):
 d=json.loads(p.read_text());sources.add(p)
 roster.append({'path':str(p),'pluginId':d['id'],'stages':[r['id'] for r in d.get('stages',[])],'reportAdapters':[r['id'] for r in d.get('reportAdapters',[])]})
 for kind in ['stages','reportAdapters']:
  for r in d.get(kind,[]):
   root=p.parent;sources.update(q for q in root.rglob('*') if q.is_file())
   schema=json.loads((root/r['configSchema']).read_text()) if 'configSchema' in r else None
   fields=[];defaults=[]
   def walk(v,ptr='$',field='',seen=()):
    if not isinstance(v,dict):return
    if 'default' in v:defaults.append({'pointer':ptr,'field':field,'value':v['default']})
    if '$ref' in v and v['$ref'].startswith('#/') and v['$ref'] not in seen:
     t=schema
     for bit in v['$ref'][2:].split('/'):t=t[bit.replace('~1','/').replace('~0','~')]
     walk(t,ptr+'->'+v['$ref'],field,seen+(v['$ref'],))
    for k,t in v.get('properties',{}).items():
     f=field+'.'+k if field else k
     occurrences=[]
     for q in sorted((root/'src').rglob('*')):
      if q.is_file() and q.suffix in ['.ts','.js','.mjs']:
       occurrences.extend({'path':str(q),'line':n,'text':line.strip()} for n,line in enumerate(q.read_text().splitlines(),1) if re.search(r'\b'+re.escape(k)+r'\b',line))
     fields.append({'field':f,'pointer':ptr+'/properties/'+k,'requiredByContainingObject':k in v.get('required',[]),'schema':t,'sourceOccurrences':occurrences,'classification':'historical-format-selector' if k.endswith('Encoding') else 'stage-definition-policy-or-input; semantic classification in report'})
     walk(t,ptr+'/properties/'+k,f,seen)
    for k in ['items','additionalProperties','if','then','else']:
     if isinstance(v.get(k),dict):walk(v[k],ptr+'/'+k,field+('[]' if k=='items' else ''),seen)
    for k in ['oneOf','anyOf','allOf']:
     for n,t in enumerate(v.get(k,[])):walk(t,ptr+'/'+k+'/'+str(n),field,seen)
   if schema:walk(schema)
   registrations.append({'pluginId':d['id'],'kind':kind,'registration':r,'manifest':str(p),'module':str(root/r['module']),'rawConfigSchema':schema,'fields':fields,'schemaDefaults':defaults,'defaultApplication':'none in stage registry validation; actual code fallbacks captured separately' if kind=='stages' else 'no report-adapter config schema'})
for folder in ['skills/common/plugin-runtime/foundation/registry','skills/common/plugin-runtime/foundation/policy','skills/nova/core/execution','skills/buster/engine/test-gates']:
 sources.update(p for p in Path(folder).rglob('*') if p.is_file() and p.suffix in ['.ts','.mjs','.json'])
for p in Path('skills/common/plugin-sdk').rglob('*'):
 if p.is_file() and p.suffix in ['.ts','.json']:sources.add(p)
expressions=[]
for p in sorted(sources):
 if p.suffix not in ['.ts','.js','.mjs']:continue
 for n,line in enumerate(p.read_text().splitlines(),1):
  if re.search(r'\?\?|\bconst [A-Z][A-Z_]+\s*=|process.env|readFile|settingsFile|!== false|=== true',line):expressions.append({'path':str(p),'line':n,'text':line.strip(),'interpretation':'source expression index, not an assertion that every literal is operator policy'})
(b/'mapping.json').write_text(json.dumps({'manifestCount':len(roster),'roster':roster,'registrations':registrations,'topLevelFieldOccurrences':sum(len(r['rawConfigSchema'].get('properties',{})) for r in registrations if r['rawConfigSchema']),'nestedFieldOccurrences':sum(len(r['fields']) for r in registrations)},indent=2)+'\n')
(b/'source-expressions.json').write_text(json.dumps(expressions,indent=2)+'\n')
report=Path('docs/review/remediation/implementation/config-stage-report-plugin-inventory-20260921.md')
if report.exists():sources.add(report)
rows=[]
for p in sorted(sources):
 data=p.read_bytes();dest=b/'sources'/p;dest.parent.mkdir(parents=True,exist_ok=True)
 if dest.exists() and dest.read_bytes()!=data:raise Exception('snapshot already differs: '+str(p))
 if not dest.exists():dest.write_bytes(data)
 rows.append({'path':str(p),'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'snapshot':str(dest.relative_to(b))})
(b/'source-identities.json').write_text(json.dumps({'capturedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'source inventory, not runtime closure or execution proof','runtimeExecuted':False,'files':rows},indent=2)+'\n')
print(json.dumps({'manifests':len(roster),'stages':sum(r['kind']=='stages' for r in registrations),'reports':sum(r['kind']=='reportAdapters' for r in registrations),'stagePackages':len(set(r['pluginId'] for r in registrations if r['kind']=='stages')),'sources':len(rows),'fields':sum(len(r['fields']) for r in registrations)}))
