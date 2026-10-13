"""Independent source-graph/profile audit; no import of candidate validator."""
import hashlib,json,subprocess
from collections import Counter
from pathlib import Path
BASE='21bf51bc2075abec1191fdc091952492b6cb484e'; C='docs/review/evidence/config-acceptance/components/'
def frozen(p):
    b=subprocess.check_output(['git','show',BASE+':'+p]); assert Path(p).read_bytes()==b; return json.loads(b)
def ptr(v,p):
    for k in p.split('/')[1:]: v=v[int(k)] if isinstance(v,list) else v[k]
    return v
s=frozen('skills/common/plugin-runtime/foundation/config/swarm-components.schema.json'); rows=frozen(C+'semantic-fragment.json')['rows']; profiles=frozen(C+'refined-case-profiles.json')
def trace(root,fields):
    path=root; n=ptr(s,path); traversed=[]
    for f in fields+[None]:
        traversed.append(path)
        while '$ref' in n:
            path=n['$ref'][1:]; n=ptr(s,path); traversed.append(path)
        if f is not None: path+='/properties/'+f; n=n['properties'][f]
    return traversed
applicable=[]
for i,r in enumerate(rows):
    if not r['source']['field'].startswith('/settings/') or not r['schema']['rootDefinition']: continue
    fields=r['source']['field'][10:].split('/'); paths=trace(r['schema']['rootDefinition'][1:],fields)
    if r['owner']=='buster-engine' and fields[0] in ['preparation','admission']: paths+=trace('/$defs/buster-'+fields[0],fields[1:])
    applicable.append((i,r,set(paths)))
def selected(owner,prefixes=None,exact=None,exclude=None,numeric=False):
    return [r['id'] for i,r,t in applicable if r['owner']==owner and (prefixes is None or any(r['source']['field'].startswith('/settings/'+p) for p in prefixes)) and (exact is None or r['source']['field'][10:] in exact) and (exclude is None or exclude not in r['source']['field']) and (not numeric or ptr(s,next(p for p in t if p.endswith('/'+r['source']['field'].split('/')[-1]))) .get('type') in ['integer','number'])]
# Exact selectors audited against frozen template loops and relational operands.
g={52:selected('worker-core',['localRuntime/']),54:selected('worker-core',['localRuntime/']),91:selected('buster-engine',['execution/']),99:selected('buster-engine',exact=['execution/provider/terminationGraceMs','execution/provider/terminationTimeoutMs']),103:selected('buster-engine',exact=['execution/reports/memoryBytes','execution/reports/runtimeMemoryReserveBytes','execution/reports/maximumSourceBytes','execution/reports/maximumAggregateResultBytes']),117:selected('buster-engine',['admission/','dependencyReadiness/']),130:selected('buster-engine',['preparation/'],exclude='/resourcePolicy/'),147:selected('prism-studio',exact=['port','controlTimeoutMs']),150:selected('prism-studio',exact=['port','controlTimeoutMs']),195:selected('prism-worker',['supervisor/']),197:selected('prism-worker',['supervisor/']),211:selected('prism-worker',exact=['ingress/maximumActiveRequests','ingress/maximumProbeRequests','ingress/maximumConnections']),217:selected('buster-engine',exact=['preparation/'+f for f in ['maximumArchiveBytes','maximumRequestBytes','maximumHeaderBytes','maximumMetadataBytes','maximumInputBytes','maximumJournalBytes','maximumResultBytes','maximumOutputBytes']]),218:selected('buster-engine',exact=['preparation/closeTimeoutMs','preparation/drainTimeoutMs']),225:[],260:selected('buster-engine',['clusterInvokers/'],numeric=True)}
project=frozen(C+'checkpoint6606-canonical-questions/source-marker-canonical-projection.json')['candidates']; backlog=set(frozen(C+'checkpoint6606-canonical-questions/remaining-backlog.json')['remainingExactSourceLinkCandidateIds']); details=[]
for batch in ['01','02']:
    f='source-coordinate-definitions.json' if batch=='01' else 'schema-coordinate-definitions.json'; data=json.loads(Path(C+'checkpoint21bf-source-links-'+batch+'/'+f).read_bytes()); source='charts/kubeclaw/templates/_swarm-config.tpl' if batch=='01' else 'skills/common/plugin-runtime/foundation/config/swarm-components.schema.json'; coords=[x for x in project if x['id'] in backlog and x['source']==source]; assert Counter(x['id'] for x in coords)==Counter(x['candidateId'] for x in data['records'])
    count=0
    for rec in data['records']:
        members=rec['members']
        if batch=='01': required=g[rec['source']['line']]
        else:
            parent=rec['source']['rfc6901Pointer'].rsplit('/',1)[0]; required=[r['id'] for i,r,t in applicable if parent in t]
        assert Counter(required)==Counter(m['settingId'] for m in members),(batch,rec['candidateId'])
        for m in members:
            i,r,_=next(x for x in applicable if x[1]['id']==m['settingId']); ref=m['completeABProfile' if batch=='01' else 'completeAB']; cid='CMP-C1-EFFECT-'+r['id'][4:]; assert ref['rfc6901Pointer']=='/'+cid; assert m['owner']==r['owner']; assert m['selectedField' if batch=='01' else 'field']==r['source']['field']; assert m['caseIds']==r['caseIds']; assert cid in r['caseIds']; profile=profiles[cid]; assert profile['delta']['owner']==r['owner'] and profile['delta']['field']==r['source']['field']; assert [ptr(profile[p][r['owner']],r['source']['field']) for p in ['A','B']]==[profile['delta']['A'],profile['delta']['B']]; assert profile['delta']['A']!=profile['delta']['B']; assert ref['sha256']==hashlib.sha256(Path(C+'refined-case-profiles.json').read_bytes()).hexdigest(); count+=1
    details.append({'batch':batch,'coordinates':len(coords),'memberOccurrencesAudited':count,'canonicalMemberSetsAndExactProfileBindings':True})
print(json.dumps({'independentSourceAudit':details,'runtimeAcceptance':False},indent=2))
