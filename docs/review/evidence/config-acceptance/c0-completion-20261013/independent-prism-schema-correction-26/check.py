import json, hashlib, pathlib, subprocess, shutil
R=pathlib.Path.cwd(); B=pathlib.Path('docs/review/evidence/config-acceptance/c0-completion-20261013'); O=B/'independent-prism-schema-correction-26'
identities={}; errors=[]; checks={}
def read(p):
 p=pathlib.Path(p); raw=p.read_bytes(); identities[str(p)]=hashlib.sha256(raw).hexdigest(); dest=O/'inputs'/p; dest.parent.mkdir(parents=True,exist_ok=True); dest.write_bytes(raw); return raw
def load(p):return json.loads(read(p))
def check(name, ok):
 checks[name]=bool(ok)
 if not ok:errors.append(name)
def pointer(d,p):
 for s in p[2:].split('/'):
  s=s.replace('~1','/').replace('~0','~');d=d[int(s)] if isinstance(d,list) else d[s]
 return d
for p in ['docs/review/remediation/GOAL-START.md','docs/review/remediation/OPENCLAW-CONFIG-GOAL.md']:read(p)
review=B/'independent-prism-service-storage-network-25'; oldid=load(review/'identity-and-conservation.json')
for p in sorted(review.rglob('*')):
 if p.is_file():read(p)
a=load(B/'delivery/batch-33/source-field-definitions.json');b=load(B/'delivery/batch-34/source-field-definitions.json');frozen=load(review/'reviewed-package/source-field-definitions.json')
for name,digest in oldid['packageFiles'].items():
 check('frozen25:'+name, hashlib.sha256(read(review/'reviewed-package'/name)).hexdigest()==digest)
 check('unchanged33:'+name, hashlib.sha256(read(B/'delivery/batch-33'/name)).hexdigest()==digest)
for n in [33,34]:
 m=load(B/f'delivery/batch-{n}/package-manifest.json')
 for item in m['files']:check('manifest:'+item['path'],hashlib.sha256(read(item['path'])).hexdigest()==item['sha256'])
 check(f'no acceptance manifest{n}',m['acceptance'] is None)
original=load(B/'delivery/candidate-dispositions.json');queue=load(B/'delivery/batch-24/remaining-batches.json');base={r['id']:r for r in original['candidates']}
check('original candidates hash',identities[str(B/'delivery/candidate-dispositions.json')]==oldid['originalCandidatesSha256'])
check('queue hash',identities[str(B/'delivery/batch-24/remaining-batches.json')]==oldid['queueSha256'])
check('frozen rows equal33',a==frozen)
check('supersedes33 pin',b['supersedesDefinitionRef']['sha256']==identities[str(B/'delivery/batch-33/source-field-definitions.json')])
ai={r['candidateId']:r for r in a['rows']};bi={r['candidateId']:r for r in b['rows']}
check('56 unique equal IDs',len(b['rows'])==len(bi)==len(ai)==56 and ai.keys()==bi.keys())
check('56 exact original bodies',all(r['originalCandidate']==base[i]==ai[i]['originalCandidate'] for i,r in bi.items()))
qs={i for s in queue['bySource'] if s['source'] in {r['sourceRef']['path'] for r in b['rows']} for i in s['candidateIds']}
check('56 exact original queue IDs',qs==set(bi))
changed=[i for i in bi if ai[i]!=bi[i]];expected={'SRC-d0e0f3642fa1eb69','SRC-1d99e33649073a2d','SRC-9fe4a037d3eec9f2','SRC-3bb5de68b990eeef','SRC-30dce6bcfff73707','SRC-4ea73f1582c54391','SRC-2fc11d26120ef2b0'}
check('exact7 changed49 unchanged',set(changed)==expected and len(bi)-len(changed)==49)
for i in changed:
 check('only correction fields:'+i,{k:v for k,v in bi[i].items() if k not in ['currentDomainAndRelations','resolvedCurrentSchemaRefs','enabledConditionalRequiredField']}=={k:v for k,v in ai[i].items() if k not in ['currentDomainAndRelations','resolvedCurrentSchemaRefs','enabledConditionalRequiredField']})
sc=load('charts/prism/values.schema.json'); pins=0; expressions=0
for r in b['rows']:
 for key in ['sourceRef','actualRendererOrGeneratedScriptReaderRef','contextualSourceRefs']:
  refs=r.get(key,[]);refs=refs if isinstance(refs,list) else [refs]
  for ref in refs:
   raw=read(ref['path']);check('source identity:'+str(ref),identities[ref['path']]==ref['sha256'])
   if ref.get('expression'):
    check('exact line:'+str(ref),raw.decode().splitlines()[ref['line']-1]==ref['expression']);expressions+=1
 for ref in r.get('currentSchemaRefs',[])+r.get('resolvedCurrentSchemaRefs',[]):
  check('schema pin:'+r['candidateId']+ref['pointer'],ref['sha256']==identities[ref['path']] and pointer(sc,ref['pointer'])==ref['domain']);pins+=1
 check('scope flags:'+r['candidateId'],r['definitionAccepted'] is False and r['runtimeResult']=='not-run')
resolved=sum(len(r.get('resolvedCurrentSchemaRefs',[])) for r in b['rows']);check('29 added resolved refs',resolved==29)
for i in ['SRC-d0e0f3642fa1eb69','SRC-1d99e33649073a2d','SRC-9fe4a037d3eec9f2']:
 r=bi[i];owner='ingestion' if i=='SRC-d0e0f3642fa1eb69' else 'control'
 check('exact image chain:'+i,[x['pointer'] for x in r['resolvedCurrentSchemaRefs']]==['#/properties/images/properties/'+owner,'#/$defs/image','#/$defs/image/properties/pullPolicy'] and sc['properties']['images']['properties'][owner]=={'$ref':'#/$defs/image'} and sc['$defs']['image']['properties']['pullPolicy']=={'enum':['IfNotPresent','Never']})
for i,field in [('SRC-3bb5de68b990eeef','requests.cpu'),('SRC-30dce6bcfff73707','requests.memory'),('SRC-4ea73f1582c54391','limits.cpu'),('SRC-2fc11d26120ef2b0','limits.memory')]:
 pair,unit=field.split('.');r=bi[i]
 check('exact resource chain:'+i,r['enabledConditionalRequiredField']=='ingestion.resources.'+field and [x['pointer'] for x in r['resolvedCurrentSchemaRefs']]==['#/properties/ingestion/allOf/0',f'#/properties/ingestion/allOf/0/then/properties/resources/properties/{pair}','#/$defs/ingestionResourcePair',f'#/$defs/ingestionResourcePair/properties/{unit}','#/$defs/resourceQuantity'])
check('enabled condition',sc['properties']['ingestion']['allOf'][0]['if']=={'properties':{'enabled':{'const':True}}} and 'enabled' in sc['properties']['ingestion']['required'])
check('pair required',sc['$defs']['ingestionResourcePair']['required']==['cpu','memory'])
check('positive number/string',sc['$defs']['resourceQuantity']['anyOf'][1]=={'type':'number','exclusiveMinimum':0} and sc['$defs']['resourceQuantity']['anyOf'][0]['type']=='string' and 'pattern' in sc['$defs']['resourceQuantity']['anyOf'][0])
for path,digest in oldid['readSourceIdentities'].items():check('review25 source conserved:'+path,hashlib.sha256(read(path)).hexdigest()==digest)
for k in ['priorQueueRef','remainingQueueUnchanged','globalC0Accepted']:check('scope metadata:'+k,b[k]==a[k])
head=subprocess.check_output(['git','rev-parse','HEAD','HEAD^{tree}'],text=True).splitlines();branch=subprocess.check_output(['git','branch','--show-current'],text=True).strip();(O/'reviewed-status.txt').write_bytes(subprocess.check_output(['git','status','--porcelain=v1','--untracked-files=all']))
result={'reviewer':'/root/prism_schema_domain_recheck_26','head':head[0],'tree':head[1],'branch':branch,'inputSha256':identities,'checks':checks,'errors':errors,'counts':{'rows':len(bi),'changedRows':len(changed),'unchangedRows':49,'resolvedRefs':resolved,'allSchemaPinsMatched':pins,'expressionPinsMatched':expressions},'changedIds':changed,'verdict':'PASS bounded PSSN25-001/002 correction' if not errors else 'NOT ACCEPTED','runtimeResult':'not-run','globalC0Accepted':False,'implementationAuthorization':None}
(O/'checks.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items() if k not in ['inputSha256','checks']},indent=2))
