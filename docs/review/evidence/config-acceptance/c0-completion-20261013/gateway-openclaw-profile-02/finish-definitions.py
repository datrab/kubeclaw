import pathlib,json,hashlib
root=pathlib.Path('/home/node/.openclaw/workspace/kubeclaw-config-c0');b=root/'docs/review/evidence/config-acceptance/c0-completion-20261013/gateway-openclaw-profile-02'
def load(p):return json.loads(p.read_text())
def put(p,v):p.write_text(json.dumps(v,indent=2)+'\n')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
# Refresh only additive projection identities, never nested original row/case/history.
p=b/'future-field-case-plans.json';j=load(p)
def walk(v):
 if isinstance(v,dict):
  if v.get('file') and '/gateway-openclaw-profile-01/' in v['file']:
   v['file']=v['file'].replace('/gateway-openclaw-profile-01/','/gateway-openclaw-profile-02/');v['sha256']=sha(root/v['file'])
  for k,val in v.items():
   if not k.startswith('original') and 'History' not in k:walk(val)
 elif isinstance(v,list):
  for vv in v:walk(vv)
walk(j);put(p,j)
contexts=load(b/'managed-bootstrap-context.json');recipes=load(b/'readonly-context-source-recipes.json')['recipes'];sourceInputs=contexts['contexts']['A']['association']['sourceInputs'];pattern='^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'
assoc=dict(type='object',additionalProperties=False,required=['ownerPath','ownerProfileId','receivingProfileId','role','instanceId','sourceRecipeId','sourceInputs'],properties=dict(ownerPath=dict(const='charts/kubeclaw/values.yaml'),ownerProfileId=dict(type='string',pattern=pattern),receivingProfileId=dict(type='string',pattern=pattern),role=dict(const='buster'),instanceId=dict(const='agent-buster-gateway'),sourceRecipeId=dict(enum=['A','B']),sourceInputs=dict(const=sourceInputs)))
branches=[]
for rid,recipe in recipes.items():
 props={k:dict(const=v) for k,v in recipe.items()};props['association']=json.loads(json.dumps(assoc));props['association']['properties']['sourceRecipeId']={'const':rid};branches.append(dict(type='object',additionalProperties=False,required=list(props),properties=props))
schema={'$schema':'https://json-schema.org/draft/2020-12/schema', 'type':'object','additionalProperties':False,'required':['contexts','nativeFullSchema'],'properties':{'nativeFullSchema':{'const':contexts['nativeFullSchema']},'contexts':{'type':'object','minProperties':1,'propertyNames':{'pattern':pattern},'additionalProperties':{'anyOf':branches}}}}
put(b/'managed-bootstrap-context.schema.json',schema)
contract=dict(qualification='proposed readonly same-generation source-derived context ABI; not current native bootstrap, author root, installed grant or epoch ledger',originalOwner='charts/kubeclaw/values.yaml',refSchema=load(b/'gateway-profile.schema.json')['properties']['readonlyBindings']['properties']['bootstrapContextRef'],captureFile='managed-bootstrap-context.json',captureSchema='managed-bootstrap-context.schema.json',codec='sha256 exact UTF-8 pretty2 JSON with final LF captured file bytes; physical loader must use exact raw file SHA, not canonicalize arbitrary transport bytes',association='ref pointer key == receivingProfileId; ownerPath/profileId, role, instanceId must equal exact requested existing author profile; native receiving profileId equals context receivingProfileId; sourceInputs exact frozen current Chart/configmap/my-values path SHA; modelRoute equal sourceRecipe.agentModel; no profile-name heuristics or absent/unknown fallback',validationOrder=['closed complete owner schema','closed context capture schema and all readonly source recipes','every declared owner profile resolves exact required ref path/hash/pointer and owner/profile/role/instance/source joins','whole managed leaf/source/default/domain validation for every declared profile','authorize one original caller tuple','resolve requested exact same-Chart profile','reject all ambient equal-or-different old-author overrides','no effect until external original C1/image/source/native/harness/grant/secret facts support selected branch'],roster='owner schema arbitrary valid profile keys preserved. new-C receivingC with own C context is a finite supported proposed B-recipe contrast; cannot borrow local-B context or imply installed image/grant. Other role recipes not supplied: finite local source/profile work required, not implicit B binding.',root='same-entry02 Gateway arm remains future closed extension, combinedv7 under review not adopted; no private root/7th component/mutable latest defaults',generatedTransport='readonly context capture generated alongside native full JSON/mount/receipt outside imagebaked author tree; final nofollow C1 tree and exact same-generation relative file-set receipt before original-native secret resolution. Materializer/bootstrap proposed not implemented.',credential='same existing Chart litellm.endpoint and named memory SOURCE/PROVIDER/ID authority/revision/access/confidential transport unchanged. Native hidden more-specific state authority must still be eliminated or captured at actual bootstrap; no plaintext Chart credential, resourceVersion-as-retention, runtime ENV override or new policy writer.',scope='S/H gateway service/host + retained original R run/session/model/grant/deadline/cleanup. No module-hot M. Context source IDs are not active grants.')
put(b/'context-reference-contract.json',contract)
# Small exact source cuts, not whole archive.
cuts=load(b/'pinned-native-source-cuts.json')
for name in ['duration-source/dist/parse-duration-DBWI377R.mjs','duration-source/dist/string-coerce-CIXf7egm.mjs','duration-source/ms/index.js']:
 p=b/name;lines=p.read_text().splitlines();cuts.append(dict(id='GWP02-DURATION-'+p.name,path=str(p.relative_to(root)),sourceSha256=sha(p),recordedSourceSha256=sha(p),line=1,endLine=len(lines),excerpt='\n'.join(lines)+'\n',excerptSha256=hashlib.sha256(('\n'.join(lines)+'\n').encode()).hexdigest(),qualification='exact archive member or locally pinned declared ms dependency; pure helper source proof not installed/native effect'))
put(b/'pinned-native-source-cuts.json',cuts)
