import json,hashlib,subprocess
from pathlib import Path
O=Path('docs/review/evidence/config-acceptance/c0-completion-20261013/runtime-provider-contracts-02');read=lambda p:json.loads(Path(p).read_text());sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest();digest=lambda x:hashlib.sha256(json.dumps(x,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
def write(name,x):(O/name).write_text(json.dumps(x,indent=2)+'\n')
logs=O/'logs';logs.mkdir(exist_ok=True)
command=['node',str(O/'check-corrections.mjs')];result=subprocess.run(command,capture_output=True,text=True);(logs/'final-replay.stdout').write_text(result.stdout);(logs/'final-replay.stderr').write_text(result.stderr)
write('commands-and-exits.json',{'workingDirectory':str(Path.cwd()),'commands':[{'argv':command,'exit':result.returncode,'stdout':'logs/final-replay.stdout','stderr':'logs/final-replay.stderr','qualification':'Specific local author schema/source definition checks only; no native/provider/network/activation/API/browser/Eval'}],'priorToolOutputReferences':['d69d62','8756a8','508367','c738e7','a91db3','a90ab4','7464ab','e19b0d','2642e2','7c7366'],'priorFailure':'prior-definition-attempt.json'})
assert result.returncode==0,result.stderr
frozen=read(O/'frozen-input-identities.json')['inputs'];changed=[r['path'] for r in frozen if sha(r['path'])!=r['sha256']];assert not changed,changed
coords=read(O/'current-source-coordinates.json');mismatches=[r for r in coords if sha(r['path'])!=r['sha256'] or Path(r['path']).read_text().splitlines()[r['line']-1]!=r['text']];assert not mismatches
I=read('docs/review/remediation/config-semantic-inventory.json');M=read('docs/review/remediation/config-acceptance-matrix.json');rows={r['id']:r for r in I['rows']};cases={c['id']:c for c in M['cases']};fd=read(O/'field-definitions.json')['rows'];cd=read(O/'case-definitions.json')['cases'];assert len(fd)==67 and all(r['originalRow']==rows[r['id']] for r in fd);assert len(cd)==408 and all(c['originalCanonicalCase']==cases[c['id']] for c in cd)
for r in fd:
 b=r['targetSchemaBinding'];node=read(b['path'])
 for part in b['pointer'].strip('/').split('/'):node=node[int(part)] if isinstance(node,list) else node[part.replace('~1','/').replace('~0','~')]
 assert node==b['exactNode'],r['id']
owners={p.stem.replace('.config',''):read(p) for p in (O/'config/plugins').glob('*.json')}
for ref in read(O/'profile-index.json'):
 owner=next(o for o in owners.values() if o['registrationId']==ref['registrationId']);assert digest(owner['profiles'][ref['profileId']])==ref['wholePolicySha256']
write('final-conservation-receipt.json',{'qualification':'Author conservation/source-pointer receipt; no independent/global/runtime acceptance','unchangedFrozenInputs':len(frozen),'frozenInputMismatches':changed,'originalRowsExactAgainstCurrentCanonical':67,'originalCasesExactAgainstCurrentCanonical':408,'sourceCoordinatesExact':len(coords),'targetSchemaBindingsExact':len(fd),'wholeProfileIndexHashesExact':len(read(O/'profile-index.json')),'canonicalIdentity':{'semanticInventorySha256':sha('docs/review/remediation/config-semantic-inventory.json'),'acceptanceMatrixSha256':sha('docs/review/remediation/config-acceptance-matrix.json')},'futureImplementationResults':'not-run'})
for filename in ['README.md','COMMANDS.md']:
 p=O/filename;text=p.read_text().replace('reports241 checks','reports274 checks');p.write_text(text)
files=[p for p in sorted(O.rglob('*')) if p.is_file() and p.name!='artifact-identities.json'];write('artifact-identities.json',{'qualification':'Frozen additive02 definition files; manifest excluded from its own hash','files':[{'path':str(p),'sha256':sha(p),'bytes':p.stat().st_size} for p in files]})
print(json.dumps({'checks':len(read(O/'correction-observations.json')['observations']),'artifactPins':len(files),'frozenInputsUnchanged':len(frozen),'sourceCoordinatesExact':len(coords),'rowsExact':67,'casesExact':408,'independentAcceptance':False}))
