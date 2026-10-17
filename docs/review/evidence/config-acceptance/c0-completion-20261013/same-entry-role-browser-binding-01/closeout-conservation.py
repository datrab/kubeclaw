from pathlib import Path
import json,hashlib
R=Path('/home/node/.openclaw/workspace/kubeclaw-config-c0');B=R/'docs/review/evidence/config-acceptance/c0-completion-20261013';O=B/'same-entry-role-browser-binding-01';E=B/'same-entry-engine-binding-01';W=B/'browser-provider-contracts-01';G=B/'gateway-openclaw-profile-02'
inputs={};cache={}
def h(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def load(p):
 p=Path(p);inputs[str(p)]=h(p)
 if str(p) not in cache:cache[str(p)]=json.loads(p.read_text())
 return cache[str(p)]
def at(x,ptr):
 for k in ptr.strip('/').split('/') if ptr else []:x=x[int(k)] if isinstance(x,list) else x[k.replace('~1','/').replace('~0','~')]
 return x
def ref(p,ptr=None):
 x={'path':str(p),'sha256':h(p)}
 if ptr:x['pointer']=ptr
 return x

def write(n,x):(O/n).write_text(json.dumps(x,indent=2)+'\n')
inv=R/'docs/review/remediation/config-semantic-inventory.json';mat=R/'docs/review/remediation/config-acceptance-matrix.json';inventory=load(inv);matrix=load(mat);rows={x['id']:x for x in inventory['rows']};cases={x['id']:x for x in matrix['cases']};observed=[]
for family,path,key in [('Provider',B/'runtime-provider-contracts-03/field-definitions.json','rows'),('Security',B/'security-provider-contracts-01/field-definitions.json','rows'),('Browser',W/'field-definitions.json','rows'),('Gateway',G/'original70-field-contracts.json','fields'),('Controller',B/'controller-role-profile-01/original49-field-contracts.json','fields'),('Prism',B/'prism-agent-launcher-profile-01/original-bodies.json','fields')]:
 for i,f in enumerate(load(path)[key]):
  body=f['originalRow'] if family!='Prism' else f;assert rows[f['id']]==body,f['id'];observed.append({'family':family,'kind':'field','id':f['id'],'originalRef':ref(path,'/'+key+'/'+str(i)+('/originalRow' if family!='Prism' else '')),'bodyExact':True})
for i,c in enumerate(load(E/'current-original-case-contexts.json')):
 r=c['originalCanonicalCaseRef'];assert cases[c['id']]==at(load(r['path']),r['pointer']);observed.append({'family':c['family'],'kind':'case','id':c['id'],'originalRef':r,'bodyExact':True})
for family,path,key,bodyKey in [('Browser',W/'case-definitions.json','cases','originalCanonicalCase'),('Gateway',G/'original-case-contracts.json','cases','originalBody'),('Prism',B/'prism-agent-launcher-profile-01/original-bodies.json','cases',None)]:
 for i,c in enumerate(load(path)[key]):
  body=c[bodyKey] if bodyKey else c;assert cases[c['id']]==body,c['id'];observed.append({'family':family,'kind':'case','id':c['id'],'originalRef':ref(path,'/'+key+'/'+str(i)+('/'+bodyKey if bodyKey else '')),'bodyExact':True})
controller=[];owner=load(O/'stand/charts/kubeclaw/values.yaml')
for f in load(B/'same-entry-deployment-binding-02/controller-receiver-rejoin.json')['fields']:
 row={'id':f['id'],'originalConcordance':ref(B/'same-entry-deployment-binding-02/controller-receiver-rejoin.json'),'currentRootSchema':ref(O/'schemas/pipeline-entry.schema.json'),'currentOwner':ref(O/'stand/charts/kubeclaw/values.yaml'),'receiving':{}}
 for side in ['A','B']:
  r=f['receiving'+side];assert at(owner,r['pointer'])==r['exactTypedValue'];row['receiving'][side]={'pointer':r['pointer'],'exactTypedValue':r['exactTypedValue']}
 controller.append(row)
write('controller-current-49-field-rejoin.json',controller)
gwf={x['id']:x for x in load(O/'gateway-field-concordance.json')};gwMembers=[]
for i,c in enumerate(load(G/'original-case-contracts.json')['cases']):
 for id in c['originalBody']['settingIds']:
  if id in gwf:gwMembers.append({'caseId':c['id'],'settingId':id,'originalCase':ref(G/'original-case-contracts.json','/cases/'+str(i)+'/originalBody'),'sameFieldCurrentProjection':gwf[id],'currentRootSchema':ref(O/'schemas/pipeline-entry.schema.json')})
write('gateway-current-case-member-concordance.json',gwMembers)
write('prism-current-root-rejoin.json',{'historicalExact12fields13cases':ref(E/'prism-current-root-rejoin.json'),'currentRoot':ref(O/'stand/config/pipeline.config.json'),'currentRootSchema':ref(O/'schemas/pipeline-entry.schema.json'),'currentEngine':ref(O/'stand/config/engines/prism-agent.config.json'),'currentSelection':load(O/'stand/config/pipeline.config.json')['engineSelections'][0],'currentSReceiverSchema':ref(O/'schemas/prism-agent-service-policy.schema.json'),'originalJSchema':ref(O/'schemas/launcher-policy-binding.schema.json'),'currentOwnerSelectionBeforeClaim':'Same original Control agent_job/envelope capture, source/role/model grant/task/fence/claim/SQL deadline; no reset or taskintentspread/privateledger/native proof'})
# Existing source paths, exact lines and complete original rosters for deliberate local role work.
roleInputs=['charts/kubeclaw/templates/configmap-gateway.yaml','charts/kubeclaw/templates/deployment.yaml','charts/kubeclaw/values.yaml','my-values/nova-values.yaml','my-values/prism-values.yaml']
roleRefs=[]
for relative in roleInputs:
 p=R/relative;inputs[str(p)]=h(p);roleRefs.append({**ref(p),'lines':[{'line':i,'text':line} for i,line in enumerate(p.read_text().splitlines(),1) if any(s in line for s in ['agentRole','kubeclaw-prism','observer','model:','primary:','existingSecret','existingSecretKey','doctor --','Config Setup'])]})
write('remaining-local-role-recipes.json',{'status':'Not declared/supported in this combined cut. LOCAL explicit source recipe completion, not generic external blocker','roles':['nova','prism'],'originalGatewayFieldIds':list(gwf),'originalGatewayCaseIds':[x['id'] for x in load(G/'original-case-contracts.json')['cases']],'actualSourceInputs':roleRefs,'finiteNextDefinition':['For each actual selected role/instance produce a complete sameexistingChartprofile, own generated source/context ref +closed contextschema arm, selected model/endpoint sameauthor aliases and actual conditional Astra branch','Derive role plugin entries/allowlist/skills from exact actual Chart ConfigMap+startup and image/source inventory. Nova neither Buster observer nor Prism plugin; Prism has exact kubeclaw-prism controlUrl branch. No fabricated installed membership','Same original SOURCE/PROVIDER/ID and provider allowlist/native refinement/confidential revision-retention/access grants; role-specific Secret locator receipts never resourceVersion/latest or credential bytes','Full source native bootstrap/model/commands/Discord rules and doctor ordering for the role; unknown roles and borrowed B contexts reject before any caller','Add explicit sameversion root schema/owner/profile/context equality, complete known role A/B and negative cases tied to original roster; authentic image/installation/source/grants remain activation receipts'], 'wholeGatewayC0Closed':False})
metadata=[]
for p,initial in [(inv,inventory),(mat,matrix)]:
 final=json.loads(p.read_text());before={k:v for k,v in initial.items() if k!='currentCombinedDefinitionGeneration'};after={k:v for k,v in final.items() if k!='currentCombinedDefinitionGeneration'};assert before==after,'UNEXPECTED_CANONICAL_CHANGE';metadata.append({'path':str(p),'startRawSha256':inputs[str(p)],'endRawSha256':h(p),'onlyPermittedConcurrentMetadataKey':'currentCombinedDefinitionGeneration','fullPreviousNonmetadataObjectEquality':True,'startMetadata':initial.get('currentCombinedDefinitionGeneration'),'endMetadata':final.get('currentCombinedDefinitionGeneration')})
for p,initial in inputs.items():
 if p not in [str(inv),str(mat)]:assert h(p)==initial,p
write('original-body-and-input-conservation.json',{'originalBodies':observed,'counts':{'primaryFieldFamilyOccurrences':sum(x['kind']=='field' and x['family']!='Controller' for x in observed),'controllerOriginalFields':49,'caseFamilyOccurrences':sum(x['kind']=='case' for x in observed),'uniqueCaseIds':len({x['id'] for x in observed if x['kind']=='case'}),'mismatches':0,'GatewayCaseMembers':len(gwMembers)},'canonicalCounts':{'fields':len(rows),'cases':len(cases)},'concurrentCanonicalMetadata':metadata,'inputIdentities':[{'path':p,'sha256':v,'endSha256':h(p)} for p,v in inputs.items()],'nativeCasesRun':0})
print(json.dumps({'bodyFamilyOccurrences':len(observed),'mismatches':0,'GatewayCaseMembers':len(gwMembers),'controllerFields':len(controller),'inputPins':len(inputs)}))
