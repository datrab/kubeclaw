import pathlib,json,hashlib,shutil,tarfile,datetime
root=pathlib.Path('/home/node/.openclaw/workspace/kubeclaw-config-c0');b=root/'docs/review/evidence/config-acceptance/c0-completion-20261013';old=b/'gateway-openclaw-profile-01';out=b/'gateway-openclaw-profile-02'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def load(p):return json.loads(p.read_text())
def put(p,v):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(v,indent=2)+'\n')
inputs=[]
for directory in [old,b/'independent-gateway-openclaw-profile-review-01']:
 for p in sorted(directory.rglob('*')):
  if p.is_file():inputs.append(dict(path=str(p.relative_to(root)),sha256=sha(p),bytes=p.stat().st_size))
# Preserve authoritative inherited definitions, NOT previous raw execution/snapshots as new evidence.
for name in ['original70-field-contracts.json','original-case-contracts.json','future-field-case-plans.json','gateway-profile.schema.json','existing-chart-owner.schema.json','existing-chart-owner-proposal.json','managed-bootstrap-context.json','memory-credential-authority-contract.json','same-entry-root-and-sole-author-contract.json','gateway-service-selection.proposed.schema.json','pinned-native-source-cuts.json','check-gateway-definition.mjs']:
 shutil.copyfile(old/name,out/name)
for label in ['A','B']: (out/'profiles').mkdir(exist_ok=True);shutil.copyfile(old/'profiles'/f'{label}.json',out/'profiles'/f'{label}.json')
archive=pathlib.Path('/tmp/kubeclaw-c0-delivery-openclaw-2026.9.5/openclaw-2026.9.5.tgz');assert sha(archive)=='1fb6ef4fae447af14f1e3b1028334f39146d181a66a4cce2848d4f741c636340'
inputs.append(dict(path=str(archive),sha256=sha(archive),bytes=archive.stat().st_size,qualification='exact original npm archive; not installed image proof; no complete archive copy'))
with tarfile.open(archive,'r:gz') as t:
 for name in ['dist/parse-duration-DBWI377R.mjs','dist/string-coerce-CIXf7egm.mjs','package.json']:
  raw=t.extractfile('package/'+name).read();p=out/'duration-source'/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(raw)
  inputs.append(dict(path=str(pathlib.Path('/tmp/kubeclaw-c0-delivery-openclaw-2026.9.5/package')/name),sha256=hashlib.sha256(raw).hexdigest(),bytes=len(raw),archiveMember='package/'+name,archiveSha256=sha(archive),snapshot=str(p.relative_to(out))))
assert load(out/'duration-source/package.json')['dependencies']['ms']=='2.1.3'
assert load(root/'node_modules/ms/package.json')['version']=='2.1.3'
for name in ['index.js','package.json']:
 p=root/'node_modules/ms'/name;q=out/'duration-source/ms'/name;q.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,q);inputs.append(dict(path=str(p.relative_to(root)),sha256=sha(p),bytes=p.stat().st_size,snapshot=str(q.relative_to(out)),qualification='locally installed exact declared ms2.1.3 bytes; pinned pure checker input, not native image dependency proof'))
for p in [root/'charts/kubeclaw/values.yaml',root/'charts/kubeclaw/templates/configmap-gateway.yaml',root/'my-values/buster-values.yaml']:
 inputs.append(dict(path=str(p.relative_to(root)),sha256=sha(p),bytes=p.stat().st_size))
contexts=load(out/'managed-bootstrap-context.json');recipes=json.loads(json.dumps(contexts['contexts']))
put(out/'readonly-context-source-recipes.json',dict(qualification='frozen package01 exact source-derived recipes; readonly not policy author or installed grant',recipes=recipes))
sourceInputs=[dict(path=x['path'],sha256=x['sha256']) for x in inputs[-3:]]
for label,c in contexts['contexts'].items():
 c['association']=dict(ownerPath='charts/kubeclaw/values.yaml',ownerProfileId='local-'+label,receivingProfileId=label,role='buster',instanceId='agent-buster-gateway',sourceRecipeId=label,sourceInputs=sourceInputs)
put(out/'managed-bootstrap-context.json',contexts)
refschema=dict(type='object',additionalProperties=False,required=['path','pointer','sha256'],properties=dict(path=dict(const='managed-bootstrap-context.json'),pointer=dict(type='string',pattern=r'^/contexts/[A-Za-z0-9][A-Za-z0-9._-]*$'),sha256=dict(type='string',pattern='^[a-f0-9]{64}$')))
for name in ['gateway-profile.schema.json','existing-chart-owner.schema.json']:
 s=load(out/name)
 def walk(v):
  if isinstance(v,dict):
   if 'bootstrapContextRef' in v.get('properties',{}):v['properties']['bootstrapContextRef']=refschema
   for vv in v.values():walk(vv)
  elif isinstance(v,list):
   for vv in v:walk(vv)
 walk(s);put(out/name,s)
owner=load(out/'existing-chart-owner-proposal.json')
for label in ['A','B']:
 ref=dict(path='managed-bootstrap-context.json',pointer='/contexts/'+label,sha256=sha(out/'managed-bootstrap-context.json'))
 p=load(out/'profiles'/f'{label}.json');p['readonlyBindings']['bootstrapContextRef']=ref;put(out/'profiles'/f'{label}.json',p)
 owner['profiles']['local-'+label]['readonlyBindings']['bootstrapContextRef']=ref
put(out/'existing-chart-owner-proposal.json',owner)
f=load(out/'original70-field-contracts.json')
for x in f['fields']:
 for kind in ['receivingProjection','authorProjection']:
  for r in x[kind].values():
   if r.get('file') and '/gateway-openclaw-profile-01/' in r['file']:
    r['file']=r['file'].replace('/gateway-openclaw-profile-01/','/gateway-openclaw-profile-02/');r['sha256']=sha(root/r['file'])
 if x['id']=='DLV-GATEWAY-OPENCLAW-AGENTS-DEFAULTS-CONTEXTPRUNING-TTL':
  x['package01TargetDomainHistory']=x['targetDomain']['domain'];x['targetDomain']['domain']={'type':'string','semantic':'exact archived parseDurationMs defaultUnit m; rounded nonnegative safe integer milliseconds including >2^31; zero disables expired pruning. No timer cap. Required malformed/overflow rejection before current native silent 300000ms fallback. Finite safe timestamp subtraction admission separate from parser.'};x['durationCorrectionRef']='duration-consumer-contract.json'
put(out/'original70-field-contracts.json',f)
put(out/'duration-consumer-contract.json',dict(fieldId='DLV-GATEWAY-OPENCLAW-AGENTS-DEFAULTS-CONTEXTPRUNING-TTL',originalCaseIds=next(x['originalCaseIds'] for x in f['fields'] if x['id'].endswith('CONTEXTPRUNING-TTL')),parser=dict(archiveSha256=sha(archive),module='duration-source/dist/parse-duration-DBWI377R.mjs',sha256=sha(out/'duration-source/dist/parse-duration-DBWI377R.mjs'),normalization='exact archived string-coerce-CIXf7egm.mjs',msVersion='2.1.3',msInputSha256=sha(out/'duration-source/ms/index.js'),qualification='extracted pure helper only; locally installed declared ms bytes do not prove image equality'),domain='native parseDurationMs trims/lowercases, single/default minute or adjacent composite ms/s/m/h/d; rounds total and requires nonnegative safe integer. No 2^31 cap. Exact helper dictates grammar, not a new regex.',consumer='actual elapsed now-lastCacheTouchAt < ttlMs, not setTimeout; no-prune if !pruneNewRounds or !lastCacheTouchAt or ttlMs<=0; mode off/ineligible provider never install cache guard; passing age guard alone does not prove result effect: transcript cutoff, occupancy, tool eligibility also required.',proposedAdmission='always parse required TTL for whole supported profile even off/ineligible; reject malformed/overflow without fallback. At original run timestamp receiver require Date-compatible integer timestamps abs<=8640000000000000 and safe integer elapsed difference; no now+ttl scheduling/addition or arbitrary duration <=Date cap; 0 sentinel means no touch; clock regression yields native not-expired. Runtime authenticity and real eligibility remain external.',agentTimeout='separate timeout-Bjg7ga80.mjs timer guard unchanged; its timer cap must not transfer to elapsed TTL',nativeCurrentFallback='resolveCacheTtlPruningSettings catches bad parse and silently retains300000ms; target rejects before entry; current source counterexample not accepted parser admission'))
put(out/'read-identities.json',dict(time=datetime.datetime.now(datetime.timezone.utc).isoformat(),inputs=inputs,inheritedFrozenNativeInputs={'path':str((old/'read-identities.json').relative_to(root)),'sha256':sha(old/'read-identities.json'),'qualification':'all233 earlier pins retained; exact native cuts reread by collector, original snapshots reused by reference; no mutable latest adoption'}))
