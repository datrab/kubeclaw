import pathlib,json,hashlib,gzip,tarfile,datetime,platform,subprocess
root=pathlib.Path('/home/node/.openclaw/workspace/kubeclaw-config-c0');b=root/'docs/review/evidence/config-acceptance/c0-completion-20261013';out=b/'gateway-openclaw-profile-02';old=b/'gateway-openclaw-profile-01'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def load(p):return json.loads(p.read_text())
def put(p,v):p.write_text(json.dumps(v,indent=2)+'\n')
reads=load(out/'read-identities.json');inherited=load(old/'read-identities.json')['inputs'];changed=[]
for x in reads['inputs']+inherited:
 p=pathlib.Path(x['path']);p=p if p.is_absolute() else root/p
 if not p.exists() or sha(p)!=x['sha256']:changed.append({'path':x['path'],'expected':x['sha256'],'current':sha(p) if p.exists() else None})
conservation=[]
for rel,keys in [('docs/review/remediation/config-semantic-inventory.json',['rows']),('docs/review/remediation/config-acceptance-matrix.json',['cases','requirements'])]:
 pin=next(x for x in inherited if x['path']==rel);frozen=json.loads(gzip.decompress((old/pin['snapshot']).read_bytes()));current=load(root/rel)
 conservation.append(dict(path=rel,sha256=sha(root/rel),arrays={k:{'exactBodyEqual':frozen[k]==current[k],'members':len(current[k])}for k in keys}))
fields=load(out/'original70-field-contracts.json')['fields'];rows={x['id']:x for x in load(root/'docs/review/remediation/config-semantic-inventory.json')['rows']};cases={x['id']:x for x in load(root/'docs/review/remediation/config-acceptance-matrix.json')['cases']}
fm=[x['id'] for x in fields if x['originalRow']!=rows[x['id']]];cm=[x['id'] for x in load(out/'original-case-contracts.json')['cases'] if x['originalBody']!=cases[x['id']]]
archive=pathlib.Path('/tmp/kubeclaw-c0-delivery-openclaw-2026.9.5/openclaw-2026.9.5.tgz');archiveChecks=[]
with tarfile.open(archive,'r:gz') as t:
 for name in ['dist/parse-duration-DBWI377R.mjs','dist/string-coerce-CIXf7egm.mjs','package.json']:
  raw=t.extractfile('package/'+name).read();archiveChecks.append({'member':'package/'+name,'archiveSha256':sha(archive),'bytesEqual':raw==(out/'duration-source'/name).read_bytes(),'memberSha256':hashlib.sha256(raw).hexdigest()})
put(out/'end-read-and-conservation.json',dict(time=datetime.datetime.now(datetime.timezone.utc).isoformat(),readPinCount=len(reads['inputs']),inheritedReadPinCount=len(inherited),changedInputs=changed,original70FieldBodyMismatch=fm,original75CaseBodyMismatch=cm,fullCanonicalBodyConservation=conservation,archiveMemberEquality=archiveChecks,globalC0Accepted=False,freshIndependentReviewRequired=True))
# Exact historical script byte snapshots, retained only if raw recorded script identity matches.
s=(out/'check-gateway-definition.mjs').read_text();schemaDecl="const validContextCapture=ajv.compile(read(path.join(base,'managed-bootstrap-context.schema.json')));\n";schemaCheck="assert(validContextCapture(capture),'CONTEXT_CAPTURE_SCHEMA:'+JSON.stringify(validContextCapture.errors));";pointerCheck="assert(ref.pointer==='/contexts/'+c.association.receivingProfileId,'CONTEXT_POINTER_PROFILE_ASSOCIATION');assert(capture.nativeFullSchema===contextCapture.nativeFullSchema,'CONTEXT_NATIVE_SCHEMA_SOURCE');"
for name,version in [('check-01',s.replace(schemaDecl,'').replace(schemaCheck,'').replace(pointerCheck,'')),('check-02',s.replace(schemaDecl,'').replace(schemaCheck,'')),('check-03',s)]:
 assert hashlib.sha256(version.encode()).hexdigest()==load(out/'raw'/f'{name}.json')['scriptSha256'],name+' historical script identity reconstruction mismatch'
 (out/'raw'/f'{name}.script.mjs').write_text(version)
commands=[]
for name in ['historical-quiet-miss','check-01','check-02','check-03','check-04']:
 p=out/'raw'/f'{name}.json'
 if not p.exists():continue
 j=load(p);commands.append({'command':'node '+str((out/('historical-quiet-miss.mjs' if name=='historical-quiet-miss' else 'check-gateway-definition.mjs')).relative_to(root)),'cwd':str(root),'rawStdout':str(p.relative_to(out)),'exitCode':1 if j['failures'] else 0,'observations':len(j['observations']),'failures':j['failures'],'scriptSha256':j['scriptSha256'],'scriptSnapshot':'historical-quiet-miss.mjs' if name=='historical-quiet-miss' else ('raw/'+name+'.script.mjs' if name!='check-04' else 'check-gateway-definition.mjs'),'qualification':'source-specific pure definition extraction/schema/receiver checks, no native/credential/network effect'})
put(out/'commands-and-exits.json',dict(node=load(out/'raw/check-04.json')['node'],python=platform.python_version(),commands=commands,authoringScripts='author-correction.py/adapt-collector.py/finish-definitions.py are exact historical authoring commands run exit0; not final rerun/reproducers. Final collector is check-gateway-definition.mjs; freeze-conservation.py current pure evidence freeze.',archiveInspection='Python tarfile exact member read only, no extraction path traversal, external executable or native parser entrypoint'))
assert not changed and not fm and not cm and all(v['exactBodyEqual'] for a in conservation for v in a['arrays'].values())
files=[]
for p in sorted(out.rglob('*')):
 if p.is_file() and p.name!='manifest.json':files.append(dict(path=str(p.relative_to(out)),sha256=sha(p),bytes=p.stat().st_size))
put(out/'manifest.json',dict(qualification='GWP01/02 author correction only; fresh independent material review required; no native/global acceptance',files=files))
print(json.dumps({'inputPins':len(reads['inputs']),'inheritedPins':len(inherited),'changedInputs':len(changed),'originalFields':len(fields),'originalCases':len(load(out/'original-case-contracts.json')['cases']),'conservation':conservation,'manifestSha256':sha(out/'manifest.json')}))
