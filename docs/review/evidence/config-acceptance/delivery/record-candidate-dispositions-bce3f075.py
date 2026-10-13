"""Coordinate-only source/caller inventory; never export operator credential values."""
import pathlib,json,hashlib,re
import yaml
out=pathlib.Path(__file__).resolve().parent;repo=out.parents[4];v=json.loads((out/'inventory-fragment.json').read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def primary(f,line):return [r['id'] for r in v['rows'] if r['source']['path']==f and r['source'].get('line')==line]
records=[]
# Exact authored default YAML coordinates; member values and operator overlay bytes are not reproduced.
for p in [*sorted((repo/'charts').glob('*/values.yaml')),*sorted((repo/'my-values').glob('*.yaml'))]:
 f=str(p.relative_to(repo));chart='prism' if p.name=='prism-values.yaml' else 'kubeclaw' if p.parent.name=='my-values' else p.parent.name
 body=yaml.safe_load(p.read_text());members=[]
 def visit(value,parts):
  field='.'.join(parts)
  exact=[r['id'] for r in v['rows'] if r['source']['path']==f'charts/{chart}/values.yaml' and r['source']['field']==field]
  if isinstance(value,dict):
   if not value:members.append({'coordinate':'/'+ '/'.join(parts),'type':'empty-object','aliasIds':exact,'disposition':'linked authored map header, not active dynamic member proof' if exact else 'explicit empty current map; future active member schema/author/consumer/cases required'})
   for k,x in value.items():visit(x,parts+[str(k)])
  elif isinstance(value,list):
   if not value:members.append({'coordinate':'/'+'/'.join(parts),'type':'empty-array','aliasIds':exact,'disposition':'linked authored array' if exact else 'unlinked exact current empty collection'})
   for i,x in enumerate(value):visit(x,parts+[str(i)])
  else:
   # Only exact path alias, never infer ownership from equal values or ancestor headers.
   indexed=[r['id'] for r in v['rows'] if r['source']['path']==f'charts/{chart}/values.yaml' and r['source']['field']==re.sub(r'\.\d+(?=\.|$)','',field)]
   members.append({'coordinate':'/'+'/'.join(parts),'type':type(value).__name__,'aliasIds':exact,'arrayPatternCandidateIds':indexed if not exact else [],'disposition':'exact authored-field alias; overlay is current caller input, not separate proposed authority' if exact else 'not semantically disposed: exact active member needs productive field reader/one-owner/domain/profile/observer; pattern candidate is NOT accepted alias'})
 visit(body,[]);records.append({'path':f,'sha256':sha(p),'kind':'current Chart author or actual operator overlay caller','coordinates':members,'secrets':'coordinate/type only; no values, credential bytes or unrelated operator fields exported','limit':'same coordinate does not establish same release/selected deployed profile; no default/coercion/API/runtime acceptance inferred'})
# Docker ENV literals are not covered by ARG rows merely because they are in the same file.
for p in sorted((repo/'docker').glob('Dockerfile*'))+[repo/'ops/pod/Dockerfile',repo/'tools/ops-mcp/Dockerfile']:
 if not p.is_file():continue
 f=str(p.relative_to(repo));coords=[]
 for line,s in enumerate(p.read_text().splitlines(),1):
  m=re.match(r'\s*(ARG|ENV|USER|ENTRYPOINT|CMD|HEALTHCHECK)\s+(.+)',s)
  if not m:continue
  names=re.findall(r'([A-Za-z_][A-Za-z0-9_]*)=',m[2]) if m[1] in ['ARG','ENV'] else []
  ids=primary(f,line);coords.append({'line':line,'instruction':m[1],'fieldNames':names,'exactPrimaryIds':ids,'disposition':'exact source coordinate linked; instruction continuation/native effect obligations separate' if ids else 'not semantically disposed: baked process/environment/default/identity/health instruction policy requires exact reader and field contract; not automatically version'})
 records.append({'path':f,'sha256':sha(p),'kind':'Docker authored ARG/ENV/native process instruction coordinates','coordinates':coords})
for p in sorted((repo/'.github/workflows').glob('*.y*ml')):
 f=str(p.relative_to(repo));coords=[]
 for line,s in enumerate(p.read_text().splitlines(),1):
  if re.search(r'\b(paths|paths-ignore|filters|roleMatrix|build-args|context|dockerfile|platforms|concurrency|timeout-minutes|permissions|branches|tags|retry|retention-days)\s*:',s):
   ids=primary(f,line);coords.append({'line':line,'key':s.strip().split(':')[0],'exactPrimaryIds':ids,'disposition':'exact primary linked; key membership/condition matrix still needs wholecaller proof' if ids else 'explicit remaining productive selector/build/permission/retention policy coordinate; no count/source-hash closure'})
 records.append({'path':f,'sha256':sha(p),'kind':'CI productive selector/build/runtime instruction coordinates','coordinates':coords})
sourceDispositions=[]
for source in v['sources']:
 rows=[r for r in v['rows'] if r['source']['path']==source['path'] or r['id'] in source.get('settingIds',[])]
 sourceDispositions.append({'path':source['path'],'sha256':source['sha256'],'fieldIds':sorted({r['id'] for r in rows}),'declaredUnusedFieldIds':[r['id'] for r in rows if r['status']=='source-traced-declared-unused'],'disposition':source.get('disposition'),'limit':'explicit inspected fields only; reference/hash/zero marker gaps does not classify every literal/default/branch in this source'})
(out/'delivery-source-candidate-dispositions-bce3f075.json').write_text(json.dumps({'scope':'field-coordinate dispositions and exact undisposed candidate roster; source closure is not C0 completeness','records':records,'sourceDispositions':sourceDispositions,'generatedReleaseRule':'generated release copies alias actual original materializer/role/bundle source records and receipt chain, never additional editable owners; current field equality alone is not proof of generation identity','remaining':'unlinked coordinates are explicitly open; active dynamic members cannot be closed by a map header; scripts and external installed/operator roster still require independently complete enumeration'},indent=2)+'\n')
print(json.dumps({'sourceRosters':len(sourceDispositions),'coordinateSources':len(records),'disposition':'explicit bounded field links and remaining coordinates, NOT exhaustive acceptance'}))
