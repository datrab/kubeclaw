import pathlib,json,collections
root=pathlib.Path('contracts/pipeline-worker-core/v1/schemas')
registry={}
for p in sorted(root.glob('*.json')):
 d=json.loads(p.read_text());registry[d['$id']]=(str(p),d)
rows=[]
def walk(source,doc,node,definition,coordinate,seen):
 if '$ref' in node:
  sid,_,frag=node['$ref'].partition('#');target=registry[sid][1] if sid else doc
  token=(target['$id'],frag)
  if token in seen:
   rows.append(dict(path=source,definition=definition,field=coordinate,domain={'recursiveRef':node['$ref']}));return
  resolved=target
  for piece in frag.strip('/').split('/') if frag else []:resolved=resolved[piece.replace('~1','/').replace('~0','~')]
  walk(source,target,resolved,definition,coordinate,seen|{token});return
 children=False
 for keyword in ['allOf','anyOf','oneOf']:
  for i,child in enumerate(node.get(keyword,[])):
   children=True;walk(source,doc,child,definition,coordinate+'/branch'+str(i),seen)
 for prop,child in node.get('properties',{}).items():
  children=True;walk(source,doc,child,definition,coordinate+'/'+prop,seen)
 if isinstance(node.get('items'),dict):children=True;walk(source,doc,node['items'],definition,coordinate+'/*',seen)
 if not children:rows.append(dict(path=source,definition=definition,field=coordinate or '/',domain=node))
for source,doc in registry.values():
 for definition,node in doc['$defs'].items():walk(source,doc,node,definition,'',set())
selected=[x for x in rows if x['definition'] in ['workerAttemptEnvelope','workerProfile','workerAttemptResult']]
res=json.loads(pathlib.Path('docs/review/evidence/config-acceptance/components/residual-fragment.json').read_text())
key=lambda x:(x['path'],x['definition'],x['field'])
mine={key(x) for x in selected};theirs={key(x) for x in res['schemaFieldDispositions']}
out={'allDefinitionFields':rows,'selectedScopeFields':selected,'missingSelected':sorted(mine-theirs),'unexpectedSelected':sorted(theirs-mine),'definitionCounts':dict(collections.Counter(x['definition'] for x in rows)),'limits':'Independent logical schema coordinate expansion, not settings count or behavioral coverage. Recursive JSON captured as ref; full schema predicates still apply.'}
pathlib.Path('docs/review/evidence/config-acceptance/independent-core-domain/expected-schema-obligations.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps({'allDefinitionFields':len(rows),'selected':len(selected),'missingSelected':len(mine-theirs),'unexpectedSelected':len(theirs-mine),'allDefinitionCounts':out['definitionCounts']}))
