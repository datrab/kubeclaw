import json,copy,hashlib
from pathlib import Path
b=Path('docs/review/evidence/config-acceptance/c0-completion-20261013/runtime-provider-contracts-01');d=json.load(open(b/'field-definitions.json'));base=lambda pkg:json.load(open(b/'task-fixtures/config'/f'{pkg}.task.json'));spec=json.load(open(b/'task-fixtures/repository/spec-a.json'));specB=copy.deepcopy(spec);specB['paths']['/other']=specB['paths'].pop('/ok');(b/'task-fixtures/repository/spec-b.json').write_text(json.dumps(specB,indent=2)+'\n')
paramSchema={'anyOf':[{'type':'string'},{'type':'number'},{'type':'boolean'}]};typed=copy.deepcopy(spec);response=copy.deepcopy(spec['paths']['/ok']['get']['responses']);typed['paths']['/items/{value}']={'get':{'operationId':'typedParameters','parameters':[{'name':'value','in':'path','required':True,'schema':paramSchema},{'name':'q','in':'query','required':False,'schema':paramSchema},{'name':'x-proof','in':'header','required':False,'schema':{'type':'string'}}],'responses':response}}
typed['paths']['/submit']={'post':{'operationId':'submit','requestBody':{'required':True,'content':{'application/json':{'schema':{'type':'object','required':['business'],'properties':{'business':{'type':'string'}},'additionalProperties':False}}}},'responses':response}}
typed['paths']['/cleanup']={'get':{'operationId':'cleanCheck','responses':response}};(b/'task-fixtures/repository/spec-typed.json').write_text(json.dumps(typed,indent=2)+'\n')
index=[]
for r in d['rows']:
 if r['activeDisposition']!='task intent':continue
 id=r['id'];pkg=r['originalRow']['owner'].split('.')[-1];ptr=r['originalRow']['source']['field'];leaf=ptr.split('/')[2];A=base(pkg);B=copy.deepcopy(A);inputs=[];meaning='Exact actual task-member selection/assertion/encoding; actual endpoint/grant/provenance unavailable, no provider/network execution.'
 if leaf in ['flowFile','specFile']:B[leaf]='flow-b.json' if leaf=='flowFile' else 'spec-b.json'
 elif leaf=='url':B['url']='https://alternate.fixture.invalid'
 elif leaf=='endpointName':
  A.pop('url');B.pop('url');A['endpointName']='service-a';B['endpointName']='service-b';inputs=[{'name':'deployment','kind':'value','schemaId':'kubeclaw.kubernetes-deployment-fixture@1','value':{'schemaVersion':'kubernetes-deployment-fixture.v1','endpoints':[{'name':'service-a','url':'https://fixture.invalid'},{'name':'service-b','url':'https://alternate.fixture.invalid'}]}}];meaning='Unsigned data-shape endpoint choice only. Authentic lease/owner/expiry/grant/image/manifest provenance NOT fabricated; inputs are NOT activation-ready.'
 elif pkg=='http':
  vals={'path':('/ok','/other'),'method':('GET','HEAD'),'accept':('application/json','text/plain'),'expectedStatuses':([200],[201]),'expectedText':('C0-local','different-task-text'),'expectedContentType':('application/json','text/plain')};a,z=vals[leaf];A[leaf]=a;B[leaf]=z
  if leaf=='method':B.pop('expectedText',None);meaning+=' HEAD task explicitly has no body-text assertion; coupled constraint, not isolated field transplant.'
 elif leaf=='tags':
  A.pop('operations',None);B.pop('operations',None);A['tags']=['proof'];B['tags']=['other-proof'];meaning+=' Selecting unmatched tag yields source OPENAPI_SELECTION_EMPTY; an alternative genuine tagged spec/task is required for positive alternate.'
 else:
  A['specFile']=B['specFile']='spec-typed.json';A['operations']=[{'operationId':'typedParameters','pathParameters':{'value':'alpha'},'query':{'q':'alpha'},'headers':{'x-proof':'alpha'},'cleanup':False,'expectedStatuses':[200]}];B['operations']=copy.deepcopy(A['operations']);opA=A['operations'][0];opB=B['operations'][0]
  if 'pathParameters' in ptr or '/query' in ptr:
   k='pathParameters' if 'pathParameters' in ptr else 'query';name='value' if k=='pathParameters' else 'q'
   if '/anyOf/1' in ptr:x,y=1,2
   elif '/anyOf/2' in ptr:x,y=True,False
   else:x,y='alpha','beta'
   opA[k][name]=x;opB[k][name]=y
  elif '/headers' in ptr:opA['headers']={'x-proof':'alpha'};opB['headers']={'x-proof':'beta'}
  elif '/body' in ptr:
   for op in [opA,opB]:op['operationId']='submit';op['pathParameters']={};op['query']={};op['headers']={}
   opA['body']={'business':'C0-local'};opB['body']={'business':'other-task-value'}
  elif '/cleanup' in ptr:
   A['operations']=[{'operationId':'checkOk','cleanup':False},{'operationId':'cleanCheck','cleanup':False}];B['operations']=[{'operationId':'checkOk','cleanup':False},{'operationId':'cleanCheck','cleanup':True}]
  elif '/expectedStatuses' in ptr:opA['expectedStatuses']=[200];opB['expectedStatuses']=[201]
  else:opA['operationId']='checkOk';opB['operationId']='cleanCheck';opA['pathParameters']={};opB['pathParameters']={};opA['query']={};opB['query']={};opA['headers']={};opB['headers']={}
 folder=b/'task-fixtures/pairs'/id;folder.mkdir(parents=True,exist_ok=True)
 for side,t in [('A',A),('B',B)]: (folder/(side+'.json')).write_text(json.dumps(t,indent=2)+'\n')
 descriptor={'id':id,'ownerRegistration':r['originalRow'].get('scope',{}),'taskA':str(folder/'A.json'),'taskB':str(folder/'B.json'),'policySelection':'Complete owner profile A for BOTH task alternatives; native resource association unchanged to isolate task intent.','unsignedInputsDefinition':inputs,'meaning':meaning,'taskFilesNeverMovedIntoCONFIG':True,'futureResult':'not-run'};index.append(descriptor);r['taskPairRef']='task-pair-index.json#'+id
# Typed body/headers tasks require this existing native header policy membership, not an implicit provider exception.
p=b/'network-resource-association.json';assoc=json.load(open(p));assoc['nativeResourcePolicy']['allowedRequestHeaders'].append('x-proof');p.write_text(json.dumps(assoc,indent=2)+'\n')
(b/'task-pair-index.json').write_text(json.dumps(index,indent=2)+'\n');(b/'field-definitions.json').write_text(json.dumps(d,indent=2)+'\n');print('complete task pairs',len(index))
