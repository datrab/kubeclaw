from pathlib import Path
import json,hashlib,subprocess
root=Path.cwd();out=Path(__file__).parent;commit='21bf51bc2075abec1191fdc091952492b6cb484e';b='docs/review/evidence/config-acceptance/components/';path='skills/common/plugin-runtime/foundation/config/swarm-components.schema.json';load=lambda p:json.loads((root/p).read_text());sha=lambda v:hashlib.sha256(v).hexdigest();refs={}
def ref(p,ptr=None):
 raw=subprocess.check_output(['git','show',commit+':'+p]);assert raw==(root/p).read_bytes();v={'commit':commit,'path':p,'sha256':sha(raw),'gitBlob':subprocess.check_output(['git','rev-parse',commit+':'+p],text=True).strip()};refs[p]=v.copy()
 if ptr is not None:v['rfc6901Pointer']=ptr
 return v
schema=load(path);rows=load(b+'semantic-fragment.json')['rows'];profiles=load(b+'refined-case-profiles.json');project=load(b+'checkpoint6606-canonical-questions/source-marker-canonical-projection.json')['candidates'];coords=load(b+'source-candidates-bce3f075/source-json-coordinates.json')['coordinates'];old=load(b+'checkpoint6606-canonical-questions/remaining-backlog.json');openids=set(old['remainingExactSourceLinkCandidateIds']);previous=json.loads((root/(b+'checkpoint21bf-source-links-01/remaining-source-link-ledger.json')).read_text());remaining=set(previous['remainingExactDetailCandidateIds']);lines=(root/path).read_text().splitlines()
def node(ptr):
 v=schema
 for k in ptr.split('/')[1:]:v=v[k.replace('~1','/').replace('~0','~')]
 return v
members=[]
for r in rows:
 if not r['source']['field'].startswith('/settings/') or not r['schema']['rootDefinition']:continue
 ptr=r['schema']['rootDefinition'].removeprefix('#');v=node(ptr);trace=[]
 def resolve(v,ptr):
  trace.append(ptr)
  while '$ref' in v:ptr=v['$ref'].removeprefix('#');trace.append(ptr);v=node(ptr)
  return v,ptr
 for key in r['source']['field'].removeprefix('/settings/').split('/'):
  v,ptr=resolve(v,ptr);v=v['properties'][key];ptr+='/properties/'+key
 v,ptr=resolve(v,ptr);cid='CMP-C1-EFFECT-'+r['id'].removeprefix('CMP-');assert cid in profiles
 members.append({'settingId':r['id'],'owner':r['owner'],'field':r['source']['field'],'schemaPathsTraversed':trace,'effectiveScalarPointer':ptr,'row':ref(b+'semantic-fragment.json','/rows/'+str(rows.index(r))),'reader':r['reader'],'caseIds':r['caseIds'],'completeAB':ref(b+'refined-case-profiles.json','/'+cid),'currentResolvedLeafSchema':v,'currentVsProposed':'This schema maximum is a current loader domain guard. It is not an operator default or automatically the universal target/current native/physical capacity; retain existing field-specific proposals/consumer constraints and future cases.'})
# Named public validation APIs consume the same selected Buster preparation/admission objects
# at swarm.ts:172-176,190,207, not aliases inferred from equal numeric literals.
for m in members:
 for section,definition,line in [('preparation','buster-preparation',207),('admission','buster-admission',190)]:
  prefix='/settings/'+section+'/'
  if m['owner']=='buster-engine' and m['field'].startswith(prefix):
   ptr='/$defs/'+definition;v=node(ptr);trail=[]
   def resolve_alt(v,ptr):
    trail.append(ptr)
    while '$ref' in v:ptr=v['$ref'].removeprefix('#');trail.append(ptr);v=node(ptr)
    return v,ptr
   for key in m['field'].removeprefix(prefix).split('/'):
    v,ptr=resolve_alt(v,ptr);v=v['properties'][key];ptr+='/properties/'+key
   v,ptr=resolve_alt(v,ptr);assert v==m['currentResolvedLeafSchema'],(m['settingId'],v,m['currentResolvedLeafSchema'])
   m['namedAPIAlternativeSchemaEntry']={'definition':definition,'schemaPathsTraversed':trail,'effectiveScalarPointer':ptr,'reader':{**ref('skills/common/plugin-runtime/foundation/config/swarm.ts'),'line':line,'flow':'loadBusterSettings validates .operator.buster.'+section+' with same exact named validator; no alternate setting author'},'compiler':ref('skills/common/plugin-runtime/foundation/config/swarm-bundle.ts'),'fullResolvedLeafEqualityVerified':True}
records=[]
for c in project:
 if c['source']!=path or c['id'] not in remaining:continue
 assert lines[c['line']-1]==c['exactText'];match=[x for x in coords if x['path']==path and x['line']==c['line'] and x['pointer'].endswith('/maximum')];assert len(match)==1,(c['id'],match);ptr=match[0]['pointer'];ownerNode=ptr.rsplit('/',1)[0];applicable=[m for m in members if ownerNode in m['schemaPathsTraversed'] or m['effectiveScalarPointer']==ownerNode or ownerNode in m.get('namedAPIAlternativeSchemaEntry',{}).get('schemaPathsTraversed',[])];assert applicable,(c['id'],ptr)
 records.append({'candidateId':c['id'],'source':{**ref(path,ptr),'line':c['line'],'exactText':c['exactText'],'currentMaximum':node(ptr)},'class':'duplicate-current-schema-domain-not-setting','exactRule':'Maximum applies only through the explicit declared local-ref/property graph to the enumerated exact existing members. Value remains supplied by each existing owner, no schema-generated fallback. Larger representable integer is not guaranteed buffer/timer/native syscall/physical capacity support.','sourceCoordinate':ref(b+'source-candidates-bce3f075/source-json-coordinates.json','/coordinates/'+str(coords.index(match[0]))),'historicalMarker':ref(b+'checkpoint6606-canonical-questions/source-marker-canonical-projection.json','/candidates/'+str(project.index(c))),'memberCount':len(applicable),'members':applicable,'noNewSettingAuthor':True,'futureCases':'All per-member EFFECT/invalid/competing/recovery/mutation obligations remain required and NOTRUN; prior loader profile definitions are not native behavior acceptance.','status':'author exact source-link proposal; fresh independent semantic review pending'})
assert len(records)==105;ids={r['candidateId'] for r in records};ref(b+'checkpoint6606-canonical-questions/remaining-backlog.json');ref(path);(out/'schema-coordinate-definitions.json').write_text(json.dumps({'baselineCommit':commit,'scope':'105 individual current schema maximum source links; not max-knob proposals or automatic native/domain/global closure','records':records,'sharedValidatorSemantics':'Shared helper schema reuse does not coalesce field purposes/owners/caller generations. Each member retains own reader/case/profile.','unknownPhysicalInputs':'Actual installed runtime/node/grants/capacity/consumer acceptance remain separate prerequisites.'},indent=2)+'\n');(out/'remaining-source-link-ledger.json').write_text(json.dumps({'historicalRemainingCount':808,'priorBatchDefinitions':16,'newIndividualDefinitions':105,'remainingCount':len(remaining-ids),'remainingExactDetailCandidateIds':[x for x in previous['remainingExactDetailCandidateIds'] if x not in ids],'originalBacklog':ref(b+'checkpoint6606-canonical-questions/remaining-backlog.json'),'priorBatch':'docs/review/evidence/config-acceptance/components/checkpoint21bf-source-links-01/remaining-source-link-ledger.json','scope':'All121 new bindings await fresh nonauthor semantic review;687 exact source-link obligations remain,60 owner aliases unchanged, no field/runtime closure from counts.'},indent=2)+'\n');(out/'committed-input-references.json').write_text(json.dumps({'refs':list(refs.values()),'scope':'Exact21bf Git blob/contents; no copied huge unchanged source artifacts'},indent=2)+'\n');print('records',len(records),'uniqueMembers',len({m['settingId'] for r in records for m in r['members']}),'remaining',len(remaining-ids))
