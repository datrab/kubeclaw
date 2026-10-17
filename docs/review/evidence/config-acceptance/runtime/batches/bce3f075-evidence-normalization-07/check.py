"""Decisive reversible documentation reference checks; never F-MUT/runtime credit."""
from pathlib import Path
import json,gzip,hashlib,re,copy
P=Path('docs/review/evidence/config-acceptance/runtime');B=P/'batches/bce3f075-evidence-normalization-07';root=P.resolve();M=json.loads((B/'normalization-manifest.json').read_text());sha=lambda v:hashlib.sha256(v).hexdigest();canonical=lambda v:json.dumps(v,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode();isref=lambda v:isinstance(v,dict)and v.get('kind')=='immutable-observation-reference'
def artifact_path(value):
 p=Path(value)
 if p.is_absolute()or'..'in p.parts or not str(p).startswith(str(P)+'/'):raise ValueError('REFERENCE_PATH_ESCAPE')
 resolved=p.resolve()
 if not resolved.is_relative_to(root):raise ValueError('REFERENCE_SYMLINK_ESCAPE')
 if not p.is_file():raise ValueError('REFERENCE_ARTIFACT_ABSENT')
 return p

def pointer(document,raw):
 if not isinstance(raw,str)or(raw and not raw.startswith('/')):raise ValueError('REFERENCE_POINTER_INVALID')
 current=document
 for part in raw.split('/')[1:]if raw else[]:
  if re.search(r'~(?:[^01]|$)',part):raise ValueError('REFERENCE_POINTER_ESCAPE_INVALID')
  segment=part.replace('~1','/').replace('~0','~')
  if isinstance(current,list):
   if not re.fullmatch(r'0|[1-9][0-9]*',segment)or int(segment)>=len(current):raise ValueError('REFERENCE_POINTER_ABSENT')
   current=current[int(segment)]
  elif isinstance(current,dict)and segment in current:current=current[segment]
  else:raise ValueError('REFERENCE_POINTER_ABSENT')
 return current

def graph(ref,stack=()):
 p=artifact_path(ref['artifactPath']);key=(str(p.resolve()),ref['rfc6901Pointer'])
 if key in stack:raise ValueError('REFERENCE_CYCLE')
 value=pointer(json.loads(p.read_bytes()),ref['rfc6901Pointer']);stack=stack+(key,)
 def walk(v):
  if isref(v):graph(v,stack)
  elif isinstance(v,dict):
   for child in v.values():walk(child)
  elif isinstance(v,list):
   for child in v:walk(child)
 walk(value)

def resolve(ref):
 if set(ref)!=set(['kind','artifactPath','rfc6901Pointer','artifactSha256','valueSha256']):raise ValueError('REFERENCE_SHAPE_INVALID')
 graph(ref);p=artifact_path(ref['artifactPath']);raw=p.read_bytes()
 if sha(raw)!=ref['artifactSha256']:raise ValueError('REFERENCE_ARTIFACT_DRIFT')
 value=pointer(json.loads(raw),ref['rfc6901Pointer'])
 if sha(canonical(value))!=ref['valueSha256']:raise ValueError('REFERENCE_WRONG_VALUE')
 return value
beforegzip=Path(M['beforeRawArtifact']).read_bytes();assert sha(beforegzip)==M['beforeGzipSha256'];before=gzip.decompress(beforegzip);assert sha(before)==M['beforeRawSha256'];current=Path(M['afterArtifact']).read_bytes();assert sha(current)==M['afterRawSha256'];old=json.loads(before);new=json.loads(current);assert len(old)==len(new);byid={c['id']:c for c in new};assert len(byid)==len(new);edits=[]
for edit in M['edits']:
 c=byid[edit['caseId']];field=edit['inputProfileField'];ref=c['inputProfile'][field];assert ref==edit['reference'];value=resolve(ref);c['inputProfile'][field]=value;edits.append(edit)
assert old==new,'semantic casebody altered beyondexact observation references'
# Document-integrity negatives: each rejects at the stated exact reference boundary, restored references pass. NOT F-MUT.
controls=[];ref=copy.deepcopy(M['edits'][0]['reference'])
def reject(name,value,expected):
 try:resolve(value)
 except ValueError as e:
  assert str(e)==expected,(name,str(e),expected);controls.append({'name':name,'result':'rejected','boundary':str(e)});return
 raise AssertionError(name+' accepted malformedreference')
missing={**ref,'artifactPath':str(B/'does-not-exist.json')};reject('absent-artifact',missing,'REFERENCE_ARTIFACT_ABSENT');wrong={**ref,'rfc6901Pointer':'/observations/1'};reject('existing-wrong-pointer',wrong,'REFERENCE_WRONG_VALUE');reject('absent-pointer',{**ref,'rfc6901Pointer':'/absent'},'REFERENCE_POINTER_ABSENT');reject('invalid-RFC6901-escape',{**ref,'rfc6901Pointer':'/bad~2escape'},'REFERENCE_POINTER_ESCAPE_INVALID');reject('parent-path-escape',{**ref,'artifactPath':str(P/'../README.md')},'REFERENCE_PATH_ESCAPE');controlsdir=B/'controls';controlsdir.mkdir(exist_ok=True);drift=controlsdir/'drift.json';drift.write_text('{"changed":true}\n');reject('drifted-artifact',{**ref,'artifactPath':str(drift),'rfc6901Pointer':''},'REFERENCE_ARTIFACT_DRIFT');cyclefile=controlsdir/'cycle.json';cycle={**ref,'artifactPath':str(cyclefile),'rfc6901Pointer':''};cyclefile.write_text(json.dumps(cycle,indent=2)+'\n');reject('cycle-reference',{**cycle,'artifactSha256':sha(cyclefile.read_bytes())},'REFERENCE_CYCLE');symlink=controlsdir/'outside-link.json'
if symlink.is_symlink():symlink.unlink()
symlink.symlink_to(Path('package.json').resolve());reject('symlink-escape',{**ref,'artifactPath':str(symlink)},'REFERENCE_SYMLINK_ESCAPE');symlink.unlink();resolve(ref);controls.append({'name':'restored-original-reference','result':'passed','valueSha256':ref['valueSha256']})
# Restored positive again reconstructs every beforeobject and all originalcasefields, exactsnapshotbytes available.
result={'status':'passed narrow documentation normalization integrity only; NOT semantic/runtime acceptance or F-MUT','caseCount':len(old),'normalizedReferenceCount':len(edits),'fullBeforeAndAfterCasesObjectEquivalent':True,'originalBeforeBytesPreservedSha256':sha(before),'beforeGzipSha256':sha(beforegzip),'currentNormalizedBytesSha256':sha(current),'controls':controls,'sourceCommit':M['sourceCommit'],'sourceTree':M['sourceTree'],'testDigests':{str(B/'check.py'):sha((B/'check.py').read_bytes()),str(B/'normalize.py'):sha((B/'normalize.py').read_bytes())},'inputDigests':{str(B/'normalization-manifest.json'):sha((B/'normalization-manifest.json').read_bytes()),**{p:a['sha256']for p,a in M['artifacts'].items()}},'reviewerConfirmation':'pending','unchanged':M['unchanged']};(B/'observations.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
