import copy,json,pathlib,subprocess,tempfile
root=pathlib.Path.cwd();parser=root/'scripts/deploy-observation.mjs'
def run(file,kind,namespace,value):
 return subprocess.run(['node',str(file),'resource',kind,'selected',namespace],input=json.dumps(value),capture_output=True,text=True)
kinds={'secret':('Secret','v1'),'configmap':('ConfigMap','v1'),'service':('Service','v1'),'deployment':('Deployment','apps/v1'),'job':('Job','batch/v1'),'validatingadmissionpolicy':('ValidatingAdmissionPolicy','admissionregistration.k8s.io/v1')}
for kind,(apiKind,version) in kinds.items():
 namespace='' if kind=='validatingadmissionpolicy' else 'guard-test'
 item={'kind':apiKind,'apiVersion':version,'metadata':{'name':'selected',**({'namespace':namespace} if namespace else {})}}
 for wrapper,wrapperVersion in [('List','v1'),(apiKind+'List',version)]:
  for items,state in [([], 'absent'),([item], 'present')]:
   result=run(parser,kind,namespace,{'kind':wrapper,'apiVersion':wrapperVersion,'items':items});assert result.returncode==0 and result.stdout==state,(kind,result.stderr)
  print('original accepted real supported list shapes',kind,wrapper)
 for mutation in ['name','namespace','kind','apiVersion','null','duplicate','envelope']:
  value={'kind':'List','apiVersion':'v1','items':[copy.deepcopy(item)]}
  if mutation=='name':value['items'][0]['metadata']['name']='other'
  elif mutation=='namespace':value['items'][0]['metadata']['namespace']='foreign'
  elif mutation in ['kind','apiVersion']:value['items'][0][mutation]='foreign'
  elif mutation=='null':value['items']=[None]
  elif mutation=='duplicate':value['items'].append(item)
  else:value['kind']='UnexpectedList'
  value['data']={'marker':'DO_NOT_PRINT_REVIEW_MARKER'}
  result=run(parser,kind,namespace,value);assert result.returncode!=0,(kind,mutation);assert 'DO_NOT_PRINT_REVIEW_MARKER' not in result.stdout+result.stderr
 print('original rejected 7 malformed cases without body disclosure',kind)
with tempfile.TemporaryDirectory(prefix='deploy-parser-mutant-') as directory:
 file=pathlib.Path(directory)/'mutant.mjs';source=parser.read_text();old=' || item?.apiVersion !== version';assert source.count(old)==1;file.write_text(source.replace(old,''))
 value={'kind':'List','apiVersion':'v1','items':[{'kind':'Secret','apiVersion':'foreign','metadata':{'name':'selected','namespace':'guard-test'}}]}
 assert run(parser,'secret','guard-test',value).returncode!=0
 mutant=run(file,'secret','guard-test',value);assert mutant.returncode==0 and mutant.stdout=='present'
 print('independent API-version-removal mutant detected by original rejection oracle')

for mode,kind,namespace in [('resource','secret','guard-test'),('helm-storage','secret','guard-test')]:
 for token in ['next-page',False,0,None,{},[]]:
  value={'kind':'List','apiVersion':'v1','metadata':{'continue':token},'items':[]}
  result=subprocess.run(['node',str(parser),mode,kind,'selected',namespace],input=json.dumps(value),capture_output=True,text=True)
  assert result.returncode!=0,(mode,token,result.stdout)
 print('reject incomplete or invalid continuation tokens',mode)
