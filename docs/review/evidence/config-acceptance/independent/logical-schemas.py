import pathlib,json,subprocess,collections,hashlib
root=pathlib.Path.cwd();out=root/'docs/review/evidence/config-acceptance/independent'
paths=[p for p in subprocess.check_output(['git','ls-files','-z']).decode().split('\0') if p and p.endswith('.json') and ('schema' in pathlib.Path(p).name) and not p.startswith('docs/review/')]
rows=json.load(open(root/'docs/review/remediation/config-semantic-inventory.json'))['rows']; expected=[]; unresolved=[]
def pointer(doc,s):
 for k in s.removeprefix('#/').split('/'):doc=doc[k.replace('~1','/').replace('~0','~')]
 return doc
def walk(doc,node,path,field='',trail=(),depth=0):
 if not isinstance(node,dict) or depth>30:return
 if '$ref' in node:
  ref=node['$ref'];key=(path,ref)
  if key in trail:unresolved.append({'path':path,'field':field,'ref':ref,'reason':'recursive-schema-needs-pattern-disposition'});return
  try:
   file,sep,frag=ref.partition('#');target=(root/path).parent/file if file else root/path
   if file.startswith('http:') or file.startswith('https:'):raise ValueError('remote')
   target=target.resolve();d=json.load(open(target));n=pointer(d,'#'+frag) if sep and frag else d
   walk(d,n,str(target.relative_to(root)),field,trail+(key,),depth+1)
  except Exception as e:unresolved.append({'path':path,'field':field,'ref':ref,'reason':str(type(e).__name__)})
  return
 props=node.get('properties',{})
 for k,v in props.items():
  f=field+'.'+k if field else k
  matches=[r['id'] for r in rows if r.get('source',{}).get('path')==path and (r.get('field')==f or r.get('source',{}).get('field','').replace('#/properties/','').replace('/properties/','.').replace('/','.')==f)]
  expected.append({'path':path,'logicalField':f,'requiredHere':k in node.get('required',[]),'hasAuthoredSchemaDefault':'default' in v,'hasConst':'const' in v,'rowIdsExact':matches})
  walk(doc,v,path,f,trail,depth+1)
 if isinstance(node.get('items'),dict):walk(doc,node['items'],path,field+'[*]',trail,depth+1)
 for branch in ['allOf','anyOf','oneOf']:
  for n in node.get(branch,[]):walk(doc,n,path,field,trail,depth+1)
 for branch in ['if','then','else','additionalProperties']:
  if isinstance(node.get(branch),dict):walk(doc,node[branch],path,field+('{*}' if branch=='additionalProperties' else ''),trail,depth+1)
 for pat,n in node.get('patternProperties',{}).items():walk(doc,n,path,field+'{pattern:'+pat+'}',trail,depth+1)
for p in paths:
 try:
  doc=json.load(open(root/p));walk(doc,doc,p)
  # Orphan defs are expected even if current root has no reader/reference.
  for key,node in doc.get('$defs',{}).items():walk(doc,node,p,'$defs.'+key)
 except Exception as e:unresolved.append({'path':p,'reason':type(e).__name__})
(out/'expected-logical-schema-fields.json').write_text(json.dumps({'schemas':paths,'logicalFieldObligations':expected,'unresolvedReferences':unresolved,'limits':'All tracked schema documents, including contract/task/protocol/test/example scopes. Exact-row absence demands independent disposition, not automatic missing-setting finding. $defs and root views can duplicate the same logical field; retained rather than hidden.'},indent=2)+'\n')
print(json.dumps({'schemas':len(paths),'logicalFields':len(expected),'exactMatched':sum(bool(x['rowIdsExact']) for x in expected),'unresolvedReferences':unresolved[:25],'unresolvedCount':len(unresolved)},indent=2))
