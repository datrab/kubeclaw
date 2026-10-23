from pathlib import Path
import json, hashlib, subprocess, re
R=Path.cwd(); E=R/'docs/review/evidence/config-acceptance/c0-completion-20261013'; O=E/'independent-swarm-clauses-19'; D=E/'delivery'
inputs=set()
def read(p):
 p=R/p if not isinstance(p,Path) else p
 inputs.add(p.relative_to(R).as_posix());return p.read_text()
def j(p):return json.loads(read(p))
def sha(p):return hashlib.sha256((R/p).read_bytes()).hexdigest()
def pointer(v,p):
 for s in p.lstrip('#/').split('/'):v=v[s.replace('~1','/').replace('~0','~')]
 return v
A=j(D/'batch-27/source-field-definitions.json'); C=j(D/'candidate-dispositions.json'); Q=j(D/'batch-24/remaining-batches.json'); M=j(D/'batch-27/package-manifest.json')
for f in ('README.md','define.py','local-check.json'):read(D/'batch-27'/f)
for p in ('docs/review/remediation/GOAL-START.md','docs/review/remediation/OPENCLAW-CONFIG-GOAL.md'):read(p)
S=j('charts/kubeclaw/files/config/swarm-components.schema.json'); defs=S['$defs']; source=read('charts/kubeclaw/templates/_swarm-config.tpl').splitlines(); results=[]
def ck(name,condition,detail=None):
 results.append(dict(check=name,passed=bool(condition),detail=detail))
rows=A['rows']; byline={r['sourceRef']['line']:r for r in rows}; originals={c['id']:c for c in C['candidates']}; ids=next(x['candidateIds'] for x in Q['bySource'] if x['source']=='charts/kubeclaw/templates/_swarm-config.tpl')
ck('exact_twenty_queue_ids',len(rows)==20 and len(set(r['candidateId'] for r in rows))==20 and set(ids)=={r['candidateId'] for r in rows})
for r in rows:
 ck('original_body:'+r['candidateId'],r['originalCandidate']==originals[r['candidateId']])
 for ref in [r['sourceRef'],r['actualReaderRef']]+r['callerRefs']:
  body=read(ref['path']);ck('pin:'+r['candidateId']+':'+ref['path']+':'+str(ref['line']),sha(ref['path'])==ref['sha256'] and body.splitlines()[ref['line']-1]==ref['expression'])
 for m in r['members']:
  path,ptr=m['currentAuthor'].split('#');doc=j('charts/kubeclaw/'+path);v=pointer(doc,ptr)
  ck('document_member:'+r['candidateId']+':'+ptr,doc['owner']==m['owner'],dict(currentValue=v))
  if 'schemaPointer' in m:ck('schema_domain:'+r['candidateId']+':'+ptr,pointer(S,m['schemaPointer'])==m['schemaDomain'])
for ref in [A['schemaRef'],A['priorQueueRef']]:ck('top_ref:'+ref['path'],sha(ref['path'])==ref['sha256'])
for f in M['files']:read(f['path']);ck('manifest:'+f['path'],sha(f['path'])==f['sha256'])
def members(n):return {m['currentAuthor'].split('#')[1] for m in byline[n]['members']}
def loop_members(section,name,exclude=()):return {'/settings/'+section+'/'+k for k in defs[name]['required'] if k not in exclude}
expected=set()
for section in ['processInput','provider','reports','observation','store-attempts','store-admission']:
 expected |= loop_members('execution/'+section.replace('store-','stores/'),'buster-execution-'+section)
ck('execution_required_loop_44',members(91)==expected,dict(expected=sorted(expected),covered=sorted(members(91))))
expected=loop_members('admission','buster-admission')|loop_members('dependencyReadiness','buster-dependency-readiness')
ck('admission_readiness_required_loop_5',members(117)==expected)
ck('preparation_required_loop_26',members(130)==loop_members('preparation','buster-preparation',('resourcePolicy',)))
def cluster(v,p='/settings/clusterInvokers'):
 if v['type']=='integer':return {p:v}
 out={}
 for k in v.get('required',[]):out.update(cluster(v['properties'][k],p+'/'+k))
 if v['type']=='array':out.update(cluster(v['items'],p+'/<item>'))
 return out
expected=cluster(defs['buster-cluster-invokers']);actual={m['currentAuthor'].split('#')[1]:m['schemaDomain'] for m in byline[260]['members']}
ck('recursive_cluster_integer_25',actual==expected,dict(expected=expected))
for n,keys,prefix in [(52,['drainTimeoutMs','cancellationTimeoutMs','replayLimit'],'localRuntime/'),(54,['drainTimeoutMs','cancellationTimeoutMs','replayLimit'],'localRuntime/'),(147,['port','controlTimeoutMs'],''),(150,['port','controlTimeoutMs'],''),(195,['uid','gid','maximumOwnershipRecords','maximumOwnershipBytes','maximumOutputBytes','maximumJournalBytes','pollIntervalMs','drainTimeoutMs','closeTimeoutMs'],'supervisor/'),(197,['uid','gid','maximumOwnershipRecords','maximumOwnershipBytes','maximumOutputBytes','maximumJournalBytes','pollIntervalMs','drainTimeoutMs','closeTimeoutMs'],'supervisor/')]:
 ck('literal_loop:'+str(n),members(n)=={'/settings/'+prefix+k for k in keys})
# Preserve the adjacent real renderer cap as semantic evidence; do not execute author generation or Helm/native work.
capkeys=re.findall(r'"([A-Za-z]+)"',source[213]);cap_evidence=dict(keys=capkeys,rendererMaximum=2147483647,rendererLines=source[213:215],candidateId=byline[130]['candidateId'],documentedSchemaMaximum={m['currentAuthor'].split('/')[-1]:m['schemaDomain']['maximum'] for m in byline[130]['members'] if m['currentAuthor'].split('/')[-1] in capkeys},currentDomainAndRelations=byline[130]['currentDomainAndRelations'])
(O/'checks.json').write_text(json.dumps(dict(checks=results,allMechanicalChecksPassed=all(x['passed'] for x in results),adjacentRendererCap=cap_evidence),indent=2)+'\n')
for filename,args in [('status.stdout',['git','status','--porcelain=v1','--untracked-files=all']),('patch.stdout',['git','diff','--binary']),('head.stdout',['git','rev-parse','HEAD','HEAD^{tree}'])]:
 (O/filename).write_bytes(subprocess.check_output(args))
identities=[dict(path=p,sha256=sha(p),bytes=(R/p).stat().st_size,tracked=subprocess.run(['git','ls-files','--error-unmatch',p],capture_output=True).returncode==0) for p in sorted(inputs)]
(O/'input-identities.json').write_text(json.dumps(dict(reviewer='/root/swarm_clause_review_19',scope='twenty batch27 renderer clauses',files=identities,patchSha256=hashlib.sha256((O/'patch.stdout').read_bytes()).hexdigest()),indent=2)+'\n')
print(json.dumps(dict(checks=len(results),failed=[x['check'] for x in results if not x['passed']],adjacentRendererCap=cap_evidence),indent=2))
