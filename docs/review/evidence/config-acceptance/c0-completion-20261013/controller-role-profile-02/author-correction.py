import pathlib,json,hashlib,gzip,copy,datetime
ROOT=pathlib.Path('/home/node/.openclaw/workspace/kubeclaw-config-c0')
B=ROOT/'docs/review/evidence/config-acceptance/c0-completion-20261013'
OLD=B/'controller-role-profile-01'; OUT=B/'controller-role-profile-02'
def digest(b): return hashlib.sha256(b).hexdigest()
def read(p): return json.loads(p.read_text())
def write(name,obj):
 p=OUT/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(obj,indent=2,ensure_ascii=False)+'\n')
inputs=[]
def freeze(p):
 data=p.read_bytes(); sha=digest(data); rel=str(p.relative_to(ROOT)); target=OUT/'frozen-inputs'/f'{sha}.gz';target.parent.mkdir(exist_ok=True)
 target.write_bytes(gzip.compress(data,mtime=0)); rec={'path':rel,'sha256':sha,'bytes':len(data),'snapshot':str(target.relative_to(OUT))};inputs.append(rec);return rec
for p in sorted(OLD.rglob('*')):
 if p.is_file() and 'frozen-inputs' not in p.parts: freeze(p)
for name in ['REPORT.md','read-identities.json','conservation.json','receiving-node-challenge.json']:
 p=B/'independent-controller-role-profile-review-01'/name
 if p.exists():freeze(p)
oldpins=read(OLD/'read-identities.json')['inputs']
for pin in oldpins: freeze(ROOT/pin['path'])
provider=B/'runtime-provider-contracts-03/schemas/pipeline-entry.schema.json';providerpin=freeze(provider)
mapping=read(OLD/'original49-field-contracts.json'); corrected=copy.deepcopy(mapping)
def node(obj,pointer):
 for k in pointer.lstrip('/').split('/'):obj=obj[k.replace('~1','/').replace('~0','~')]
 return obj
for row in corrected['fields']:
 r=row['receivingProjection'];r['pointer']=r.get('pointer',r.get('profilePointer'))
 for role in ['A','B']:
  p=OLD/'profiles'/f'{role}.json';r[f'profileFile{role}']=str(p.relative_to(ROOT));r[f'sha256{role}']=digest(p.read_bytes())
  if row['id']=='DLV-NAMESPACE-CONTROLLER-BUSTER-READY-PRODUCER': r[f'typed{role}']=node(read(p),r['pointer'])
 r['definitionDependencyStatus']='exact local receiving reference only; proposed C3 receiving implementation and coordinated same-root ABI unaccepted; not field-semantic PASS'
 row['semanticAccepted']=False
corrected['qualification']='Additive CRPR-01 correction; original49 rows/body/history/case memberships unchanged. All98 physical A/B receiving nodes checked; no native or whole-C0 acceptance.'
write('original49-field-contracts.json',corrected)
write('original-case-refinements.json',read(OLD/'original-case-refinements.json'))
receiver=read(OLD/'receiver-and-epoch-contract.json')
receiver['entrySelectionABI']['coordinationContract']='deployment-binding-abi-contract.json and deployment-binding-fragment.schema.json in this additive package; version candidate explicitly unaccepted'
write('receiver-and-epoch-contract.json',receiver)
scenes=read(OLD/'case-scenes.json')
for s in scenes['scenes']:
 if s['originalCaseId']=='DLV-CASE-CONTROLLER-RESPONSE-EPOCH-CONTRACT':
  s['additive403Oracle']={'complete403':'kubeResponseError returns typed *apiError with statusCode=403 before json.Unmarshal(responseBody,out); no typed lease result or successful mutation receipt. Preserve original case body.','oversizedOrTruncated':'future response-cap/transport-incomplete boundary returns distinct typed rejection/uncertain result before successful lease decode; do not classify incomplete mutation as verified denied/notfound/conflict','outNil':'error classification still precedes out==nil short circuit','futureMutants':['move status classification after successful typed lease decode','treat complete403 as success/emptylease','treat incomplete mutation response as verified403/noeffect'],'currentSource':'cmd/buster-namespace-controller/main.go:1533-1539 and1553-1568'}
write('case-scenes.json',scenes)
fragment=receiver['entrySelectionABI']['proposedExactSelectionFragment']
fragment={'schemaVersion':'pipeline-entry.v6-controller-proposal',**fragment}
write('deployment-binding-fragment-A.json',fragment)
bf=copy.deepcopy(fragment);bf['deploymentBindings']['kubeclaw']['profile']='local-B';write('deployment-binding-fragment-B.json',bf)
def obj(properties):return {'type':'object','additionalProperties':False,'required':list(properties),'properties':properties}
schema={'$schema':'https://json-schema.org/draft/2020-12/schema',**obj({'schemaVersion':{'const':'pipeline-entry.v6-controller-proposal'},'deploymentBindings':obj({'kubeclaw':obj({'file':{'const':'charts/kubeclaw/values.yaml'},'profile':{'type':'string','pattern':'^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'},'bindings':{'type':'array','minItems':1,'maxItems':1,'items':obj({'role':{'const':'buster'},'instanceId':{'const':'agent-buster'},'consumer':{'const':'namespace-controller'},'serviceInstanceId':{'const':'agent-buster-namespace-controller'}})}})})})}
write('deployment-binding-fragment.schema.json',schema)
abi={'status':'finite C0 proposed ABI definition; NOT ACCEPTED/NOT IMPLEMENTED, full-root integration and independent review still required','physicalRoot':'config/pipeline.config.json','versionCoordination':{'frozenProviderRoot':providerpin,'currentVersion':'pipeline-entry.v5','candidateNewVersion':'pipeline-entry.v6-controller-proposal','meaning':'candidate coordinated next version only; never allow deploymentBindings through current closed v5 schema. This fragment is NOT a standalone runtime root. Parent must integrate all unchanged component/binding/plugin selections and whole v5 semantic refinements into one closed next root schema; freeze resulting full root before approval.'},'soleAuthor':'charts/kubeclaw/values.yaml#/profiles/<explicitSelectedProfile>/settings/busterNamespaceBroker','readonlyBindingAuthority':'existing same-generation Buster CMP shared lease group/version and Control Product enable/signer/issuer/operators plus authenticated H/API/grants; no editable generated ENV or new writer','selection':{'role':'buster','instanceId':'agent-buster','consumer':'namespace-controller','serviceInstanceId':'agent-buster-namespace-controller','profile':'exact explicit root selection, never inferred from root tuning/profile/ENV; fullname agent-buster from helper not release name'},'schemaFiles':{'root':'coordinated closed next pipeline-entry schema incorporating unchanged frozen v5 and this fragment (local integration OPEN)','fragment':'deployment-binding-fragment.schema.json','controllerProfile':{'path':str((OLD/'controller-role-profiles.schema.json').relative_to(ROOT)),'sha256':digest((OLD/'controller-role-profiles.schema.json').read_bytes())}},'fileSet':{'inputMembers':['config/pipeline.config.json','six exact selected components from unchanged components/bindings','exact plugin selections/owner profiles from unchanged v5','charts/kubeclaw/values.yaml selected full role profile','controller profile schema','root schema','authenticated image/build/compiler/source/grant/issuer/secret revision references'],'generatedMembers':['/etc/kubeclaw/buster-namespace-controller/policy.json','existing Chart controller Deployment/ServiceAccount/RBAC/CRD/mount/ENV projections and enabled Ready route/client refs'],'receiptFields':['relativePath','exactBytesSha256','schemaSha256','selectedProfile','sourceIdentity','role','instanceId','serviceInstanceId','immutableGenerationDigest'],'closure':'all referenced members present in single authenticated generation; fixed relative input refs, no symlink/include/merge/Latest; generated members readonly and derived, never authors'},'materializerContract':{'pipeline':'existing same-root pipeline materializer/Chart receiving path, not a controller-private entry/index','steps':['effect-free parse closed coordinated root and full selected owner profiles; unknown/duplicate/missing/retired ENV/Helm override rejected','join exact Buster shared API group/version and Control enable/signer/issuer/operator authority; reject mismatched role/instance/generation even equal values','check all source capability/quantity/domain/cross-field and native installed CRD preservation predicates before publishing generated members','materialize exact complete controller policy and same generation existing Chart projections including Ready port and conditional omitted roles','hash exact inputs/generated members and freeze manifest before managed startup; no defaults/coercion or mutable late lookup','future Go --config decoder verifies generation/file/schema/role/authority identities before token/CA/key/listener/API effects; this loader currently absent'],'conditionalRoles':'broker-off omits controller/resources/RBAC/mounts/policy; ReadyProduct-off omits Ready/Product policy members/port/TLS/client route and grants; old active A receipts still require authenticated drain/preservation before omission','activeOriginalA':'publication never rewrites original epoch/UID/RV/CAS/config_epoch/expiry/cleanup budgets/grants/trust; installed old CRD TTL domain remains compatible or B publication rejected/drained'},'remainingLocalWork':['coordinate next root version and full closed root schema with frozen Provider03/C3 definitions; not completed by fragment','define same pipeline production materializer exact implementation/source and generated file-set receipts; no present support claimed','implement approved Go managed decoder/epoch readback and Chart/CRD/role/drain projection later C1-C6; no C0 implementation here'],'externalActivationInputs':receiver['externalActivationInputs']}
write('deployment-binding-abi-contract.json',abi)
drifts=[]
for pin in oldpins:
 p=ROOT/pin['path']; now=digest(p.read_bytes())
 if now!=pin['sha256']:
  prior=json.loads(gzip.decompress((OLD/pin['snapshot']).read_bytes()));current=read(p)
  base=copy.deepcopy(current);metadata=base.pop('currentProviderFieldAdoption',None)
  drifts.append({'path':pin['path'],'priorSha256':pin['sha256'],'currentSha256':now,'onlyTopLevelCurrentProviderFieldAdoption':base==prior,'currentMetadata':metadata})
write('canonical-metadata-drift.json',drifts)
write('read-identities.json',{'time':datetime.datetime.now(datetime.timezone.utc).isoformat(),'inputs':inputs,'noNativeExecution':True,'globalC0Accepted':False})
conservation={'fields':[],'cases':[]}
inventory=read(ROOT/'docs/review/remediation/config-semantic-inventory.json');matrix=read(ROOT/'docs/review/remediation/config-acceptance-matrix.json')
currentrows={r['id']:r for r in inventory['rows']};currentcases={r['id']:r for r in matrix['cases']}
for r in corrected['fields']:conservation['fields'].append({'id':r['id'],'originalBodyEqual':currentrows[r['id']]==r['originalRow'],'priorContractOriginalEqual':r['originalRow']==next(x for x in mapping['fields'] if x['id']==r['id'])['originalRow'],'bodyHash':r['originalRowBodySha256']})
for c in read(OLD/'original-case-refinements.json')['cases']:conservation['cases'].append({'id':c['id'],'originalBodyEqual':currentcases[c['id']]==c['originalBody'],'bodyHash':c['originalBodySha256']})
write('conservation.json',conservation)
print(json.dumps({'frozenInputs':len(inputs),'originalFieldsConserved':sum(x['originalBodyEqual'] for x in conservation['fields']),'originalCasesConserved':sum(x['originalBodyEqual'] for x in conservation['cases']),'drifts':[(x['path'],x['onlyTopLevelCurrentProviderFieldAdoption']) for x in drifts]}))
