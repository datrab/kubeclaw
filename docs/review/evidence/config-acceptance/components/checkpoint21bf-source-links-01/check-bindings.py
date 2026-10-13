from pathlib import Path
import json,hashlib,copy,subprocess
root=Path.cwd();out=Path(__file__).parent;load=lambda path:json.loads((root/path).read_text());sha=lambda b:hashlib.sha256(b).hexdigest();batch=json.loads((out/'source-coordinate-definitions.json').read_text());original=load('docs/review/evidence/config-acceptance/components/semantic-fragment.json')['rows'];rows={x['id']:x for x in original};schema=load('skills/common/plugin-runtime/foundation/config/swarm-components.schema.json');profiles=load('docs/review/evidence/config-acceptance/components/refined-case-profiles.json');refset=json.loads((out/'committed-input-references.json').read_text())['refs'];observations=[]
def require(v,message):
 if not v:raise ValueError('SOURCE_BINDING:'+message)
def pointer(j,p):
 for key in p.split('/')[1:]:j=j[int(key)] if isinstance(j,list) else j[key.replace('~1','/').replace('~0','~')]
 return j
def validate(v):
 require(len(v['records'])==16 and len({r['candidateId'] for r in v['records']})==16,'missing/duplicate candidate')
 for r in v['records']:
  expected=next(x for x in batch['records'] if x['candidateId']==r['candidateId']);require([m['settingId'] for m in r['members']]==[m['settingId'] for m in expected['members']],'enumerated member set/order drift')
  require(r['noNewSettingAuthor'] is True,'duplicate author proposal');s=r['source'];require(sha((root/s['path']).read_bytes())==s['sha256'],'source digest drift');require((root/s['path']).read_text().splitlines()[s['line']-1]==s['exactText'],'line/text drift');require(r['memberCount']==len(r['members']),'missing member')
  if s['line']==225:require(r['class']=='nonsetting-forbidden-legacy-writer' and r['members']==[],'legacy input fabricated as setting')
  else:require(bool(r['members']),'unlinked validator')
  for m in r['members']:
   orig=pointer({'rows':original},m['sourceRow']['rfc6901Pointer']);require(orig['id']==m['settingId'] and orig['source']['field']==m['selectedField'] and orig['reader']==m['reader'],'source row/reader mismatch');require(m['caseIds']==orig['caseIds'] and bool(m['caseIds']),'case requirements lost');require(pointer(schema,m['schema']['rfc6901Pointer'])==m['schema']['resolvedCurrentScalarDomain'],'schema pointer/domain drift');require(pointer(profiles,m['completeABProfile']['rfc6901Pointer']) is not None,'full profile link missing')
 for r in refset:
  b=str((root/r['path']).readlink()).encode() if r.get('gitEntryKind')=='symlink' else (root/r['path']).read_bytes();require(sha(b)==r['sha256'],'committed before input drift')
  if r.get('gitEntryKind')=='symlink':require(sha((root/r['path']).read_bytes())==r['effectiveContentSha256'],'symlink effective domain drift')
validate(batch);observations.append({'id':'all16-exact-source-members-and-schema-pointers','result':'passed-definition-binding-integrity-only'})
def negative(id,fn):
 v=copy.deepcopy(batch);fn(v)
 try:validate(v)
 except (ValueError,KeyError,IndexError) as e:observations.append({'id':id,'result':'intended-document-integrity-rejection','boundary':str(e)});return
 raise AssertionError('escaped '+id)
negative('candidate-omitted',lambda v:v['records'].pop());negative('member-omitted',lambda v:v['records'][0]['members'].pop());negative('member-and-advertised-count-omitted',lambda v:(v['records'][0]['members'].pop(),v['records'][0].update(memberCount=v['records'][0]['memberCount']-1)));negative('source-digest-changed',lambda v:v['records'][0]['source'].update(sha256='0'*64));negative('wrong-schema-pointer',lambda v:v['records'][0]['members'][0]['schema'].update(rfc6901Pointer='/$defs/positiveTimerInteger/type'));negative('reader-alias-changed',lambda v:v['records'][0]['members'][0].update(reader={'unproved':'different reader'}));negative('case-links-omitted',lambda v:v['records'][0]['members'][0].update(caseIds=[]));negative('new-duplicate-author',lambda v:v['records'][0].update(noNewSettingAuthor=False));validate(batch);observations.append({'id':'restored-bindings','result':'passed-definition-binding-integrity-only'});(out/'binding-integrity-controls.json').write_text(json.dumps({'scope':'Pure source/binding integrity, NOT independent semantic review, Helm/render/native/runtime/field acceptance or F-MUT','observations':observations},indent=2)+'\n');print('8 intended documentation negatives /2 positives; no emitter/behavior actions')
