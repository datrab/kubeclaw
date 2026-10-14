from pathlib import Path
import json,hashlib,gzip,datetime,subprocess
R=Path('.').resolve();B=R/'docs/review/evidence/config-acceptance/c0-completion-20261013';A=B/'same-entry-role-browser-binding-01';O=B/'independent-same-entry-role-browser-binding-review-01';raws={};docs={};errors=[]
def raw(p):
 p=Path(p);p=p if p.is_absolute() else R/p;p=str(p)
 if p not in raws:raws[p]=Path(p).read_bytes()
 return raws[p]
def h(p):return hashlib.sha256(raw(p)).hexdigest()
def load(p):
 p=str(p)
 if p not in docs:docs[p]=json.loads(raw(p))
 return docs[p]
def at(x,ptr):
 for k in ptr.split('/')[1:]:x=x[int(k)] if isinstance(x,list) else x[k.replace('~1','/').replace('~0','~')]
 return x
def ref(r):
 expected=r.get('sha256',r.get('schemaSha256'))
 if expected and h(r['path'])!=expected:errors.append({'hash':r['path']})
 return at(load(r['path']),r['pointer']) if r.get('pointer') else load(r['path'])
inv=load(R/'docs/review/remediation/config-semantic-inventory.json');mat=load(R/'docs/review/remediation/config-acceptance-matrix.json');fields={r['id']:r for r in inv['rows']};cases={r['id']:r for r in mat['cases']};bodyRows=load(A/'original-body-and-input-conservation.json')['originalBodies'];observed=[]
for row in bodyRows:
 body=ref(row['originalRef']);expected=fields[row['id']] if row['kind']=='field' else cases[row['id']]
 if body!=expected:errors.append({'body':row['id']})
 observed.append({k:row[k] for k in ['family','kind','id']})
fcs=load(A/'current-field-node-concordance.json');by={f['id']:f for f in fcs};browser=[]
for f in fcs:
 if ref(f['ownerNode'])!=f['ownerNode']['exactNode']:errors.append({'ownerNode':f['id']})
 for r in f['receivingNodes']:
  if ref(r)!=f['ownerNode']['exactNode']:errors.append({'receiverNode':f['id']})
 if f['currentRootSchema']['sha256']!=h(A/'schemas/pipeline-entry.schema.json'):errors.append({'rootField':f['id']})
 if f['family']=='Browser':
  for r in f['receivingNodes']:
   if Path(r['path'])!=A/'schemas/provider-configuration.v2.schema.json':errors.append({'staleBrowserReceiver':f['id']})
  browser.append(f['id'])
ms=load(A/'current-case-member-concordance.json')
for m in ms:
 original=ref(m['originalRef']);f=by[m['settingId']]
 if original['settingId']!=m['settingId'] or m['ownerNode']!=f['ownerNode'] or m['receivingNodes']!=f['receivingNodes']:errors.append({'memberFieldJoin':m['caseId'],'settingId':m['settingId']})
for f in load(A/'current-field-instance-source-closure.json'):
 t=ref(f['actualRootTuple']);p=ref(f['physicalOwner']);s=ref(f['selectedCompleteProfile']);n=ref(f['currentTypedFieldNodes'])
 if t!=f['tuple'] or n['id']!=f['id'] or t['packageId']!=p['packageId'] or t['instanceId']!=p['instanceId'] or s!=p['profiles'][t['profileId']]:errors.append({'physicalClosure':f['id']})
 for c in f['actualComponentRoleServiceProfiles']:
  if ref(c['exactCurrentRootBinding'])!=c['tuple']:errors.append({'binding':f['id']})
  ref(c['selectedCompleteOwnerProfile'])
ctxs=load(A/'current-case-contexts.json')
for c in ctxs:
 if ref(c['originalCanonicalCaseRef'])!=cases[c['id']]:errors.append({'caseContext':c['id']})
 ref(c['nativeRef'])
gwf=load(A/'gateway-field-concordance.json');gwby={f['id']:f for f in gwf};gwn=load(A/'gateway-current-schema-node-concordance.json');gwm=load(A/'gateway-current-case-member-concordance.json');nodes=0;omissions=[]
for n in gwn:
 if 'sameCurrentOwnerSchemaNodes' not in n:omissions.append(n);continue
 for r in n['sameCurrentOwnerSchemaNodes']+n['currentTypedSReceivingSchemaNodes']:
  if ref(r)!=r['exactNode']:errors.append({'gatewaySchemaNode':n['id'],'profile':n['profileId']})
 ref(n['exactSourceDataRef']);nodes+=1
for f in gwf:
 if ref(f['originalContract'])['id']!=f['id']:errors.append({'gatewayOriginalField':f['id']})
 for pid,c in f['profiles'].items():
  if c.get('author'):
   value=ref(c['author']);view=load(A/'outputs/gateway'/f'{pid}.profile.json')
   if value!=c['exactNode'] or at(view,c['receivingPointer'])!=value or ref(c['ownContext'])['association']['ownerProfileId']!=pid:errors.append({'GatewayData':f['id'],'profile':pid})
for m in gwm:
 body=ref(m['originalCase'])
 if m['settingId'] not in body['settingIds'] or m['sameFieldCurrentProjection']!=gwby[m['settingId']]:errors.append({'GatewayCaseJoin':m['caseId']})
chart=load(A/'stand/charts/kubeclaw/values.yaml');controller=load(A/'controller-current-49-field-rejoin.json')
for f in controller:
 for side,recv in f['receiving'].items():
  if at(chart,recv['pointer'])!=recv['exactTypedValue']:errors.append({'ControllerReceiving':f['id'],'side':side})
plans=load(A/'gateway-context-source-recipes.json');contexts=load(A/'stand/managed-bootstrap-context.json')
for p in plans['profiles']:
 source=ref(p['originalControllerProfile']);managed=ref(p['explicitManagedPolicyInput']);recipe=ref(p['explicitReadonlyRecipeInput']);c=at(contexts,p['ownGeneratedContextPointer']);s=chart['profiles'][p['profileId']]
 if c['association']['ownerProfileId']!=p['profileId'] or c['association']['sourceRecipeId']!=p['recipeId'] or chart['profiles'][p['profileId']]['readonlyBindings']['bootstrapContextRef']['pointer']!=p['ownGeneratedContextPointer']:errors.append({'ownContext':p['profileId']})
 for k,v in source['settings'].items():
  if s['settings'][k]!=v:errors.append({'OldControllerSetting':p['profileId'],'key':k})
product=load(A/'product-off-local-closure.json')
if ref(product['originalBWholeProfile'])!=ref(product['soleCurrentOwner']):errors.append('ProductOffWholeProfile');
for r in load(A/'source-current-boundary.json')['sources']:
 captured=Path(r['path']);relative=captured.relative_to(A/'stand/source-current')
 if str(relative).startswith('generated/'):continue
 if raw(captured)!=raw(R/relative):errors.append({'SourceCapture':str(relative)})
for r in load(A/'source-author-tree-delta.json')['existingOriginalEightMovements']:
 if h(R/r['path'])!=r['sha256']:errors.append({'C1Source':r['path']})
for r in load(A/'frozen-dependency-manifest-identities.json'):
 if h(r['path'])!=r['sha256']:errors.append({'Dependency':r['path']})
physical=[p for d in ['stand','schemas','entries','outputs'] for p in (A/d).rglob('*') if p.is_file()];root=load(A/'stand/config/pipeline.config.json');set_=load(A/'file-set-stand.json');receipt=load(A/'generation-receipt-stand.json')
if receipt['inputMembers']!=set_['inputMembers'] or receipt['selections']['engineSelections']!=root['engineSelections']:errors.append('ReceiptInputEngineJoin')
prior=load(B/'same-entry-engine-binding-01/stand/config/pipeline.config.json')
if root['pluginSelections'][:9]!=prior['pluginSelections'] or root['bindings'][:11]!=prior['bindings']:errors.append('PriorTupleConservation')
canonical={'inventoryRaw':h(R/'docs/review/remediation/config-semantic-inventory.json'),'matrixRaw':h(R/'docs/review/remediation/config-acceptance-matrix.json'),'proposedVersion':root['schemaVersion'],'actualCurrentCanonicalVersion':inv['currentCombinedDefinitionGeneration']['proposedEntryVersion'],'sameCurrentMetadataBothRoots':inv['currentCombinedDefinitionGeneration']==mat['currentCombinedDefinitionGeneration']}
(O/'selected-frozen-inputs').mkdir();ids=[]
for p,b in sorted(raws.items()):
 digest=hashlib.sha256(b).hexdigest();dest=O/'selected-frozen-inputs'/(digest+'.gz')
 if not dest.exists():dest.write_bytes(gzip.compress(b,mtime=0))
 ids.append({'path':p,'bytes':len(b),'sha256':digest})
result={'qualification':'Direct source-specific physical/body/node/root comparisons only, not native or new generic validation','at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'originalPrimaryFieldOccurrences':sum(r['kind']=='field' and r['family']!='Controller' for r in observed),'originalControllerFields':len(controller),'originalCaseOccurrences':sum(r['kind']=='case' for r in observed),'uniqueOriginalCases':len({r['id'] for r in observed if r['kind']=='case'}),'currentFields':len(fcs),'BrowserCurrentTwelveArmFields':len(browser),'currentMemberEdges':len(ms),'GatewaySchemaRecords':len(gwn),'GatewaySchemaLeafPairs':nodes,'GatewayOmissions':omissions,'GatewayOriginalFields':len(gwf),'GatewayMemberEdges':len(gwm),'fullEntries':len(load(A/'current-entry-contexts.json')),'physicalRootSchemaEntryOutputMembers':len(physical),'inputCodecMembers':len(set_['inputMembers']),'canonical':canonical,'errors':errors};(O/'selected-read-identities.json').write_text(json.dumps(ids,indent=2)+'\n');(O/'physical-conservation-and-joins.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
