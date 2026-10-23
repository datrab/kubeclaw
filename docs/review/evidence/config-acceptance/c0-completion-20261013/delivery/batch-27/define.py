"""Concrete inventory for twenty template clauses; writes only this package."""
from pathlib import Path
import hashlib, json

R = Path.cwd()
P = R / 'docs/review/evidence/config-acceptance/c0-completion-20261013/delivery'
O = P / 'batch-27'
S = 'charts/kubeclaw/templates/_swarm-config.tpl'
SC = 'charts/kubeclaw/files/config/swarm-components.schema.json'
defs = json.loads((R / SC).read_text())['$defs']

def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

def ref(path, line):
    p = R / path
    return dict(path=path, line=line, expression=p.read_text().splitlines()[line-1], sha256=sha(p))

def fields(owner, prefix, keys):
    return [dict(owner=owner, currentAuthor=f'files/config/{owner}.config.json#/settings/{prefix}{key}') for key in keys]

execution = []
for section in ['processInput', 'provider', 'reports', 'observation', 'store-attempts', 'store-admission']:
    prefix = 'execution/' + (section.replace('store-', 'stores/') if section.startswith('store-') else section) + '/'
    for key, domain in defs['buster-execution-' + section]['properties'].items():
        execution.append(dict(owner='buster-engine', currentAuthor=f'files/config/buster-engine.config.json#/settings/{prefix}{key}', schemaPointer=f'#/$defs/buster-execution-{section}/properties/{key}', schemaDomain=domain))
admission = []
for section, name in [('admission','buster-admission'),('dependencyReadiness','buster-dependency-readiness')]:
    for key, domain in defs[name]['properties'].items():
        admission.append(dict(owner='buster-engine', currentAuthor=f'files/config/buster-engine.config.json#/settings/{section}/{key}', schemaPointer=f'#/$defs/{name}/properties/{key}', schemaDomain=domain))
preparation = [dict(owner='buster-engine', currentAuthor=f'files/config/buster-engine.config.json#/settings/preparation/{key}', schemaPointer=f'#/$defs/buster-preparation/properties/{key}', schemaDomain=domain) for key,domain in defs['buster-preparation']['properties'].items() if key != 'resourcePolicy']
core = fields('worker-core','localRuntime/',['drainTimeoutMs','cancellationTimeoutMs','replayLimit'])
studio = fields('prism-studio','',['port','controlTimeoutMs'])
supervisor = fields('prism-worker','supervisor/',['uid','gid','maximumOwnershipRecords','maximumOwnershipBytes','maximumOutputBytes','maximumJournalBytes','pollIntervalMs','drainTimeoutMs','closeTimeoutMs'])
storage = fields('buster-engine','preparation/',['maximumArchiveBytes','maximumRequestBytes','maximumHeaderBytes','maximumMetadataBytes','maximumInputBytes','maximumJournalBytes','maximumResultBytes','maximumOutputBytes'])

# The same fields share a clause only where the actual template loop does.
D = {
 52: ('worker-core local runtime bounds',core,'replayLimit 1..1000000; drain/cancellation milliseconds 1..2147483647; integral JSON numbers, no fallback'),
 54: ('worker-core local runtime rejection',core,'Reject nonintegral, below1 or above the distinct per-key maximum; numeric type check occurs at53'),
 91: ('Buster execution numeric schema validation',execution,'Use each exact schema minimum/exclusiveMinimum/maximum/type; multipleOf at92-95 is a separate actual gate, no common timer domain'),
 99: ('provider termination ordering',fields('buster-engine','execution/provider/',['terminationGraceMs','terminationTimeoutMs']),'terminationGraceMs < terminationTimeoutMs, selected same provider profile'),
 103: ('reports memory relation',fields('buster-engine','execution/reports/',['memoryBytes','runtimeMemoryReserveBytes','maximumSourceBytes','maximumAggregateResultBytes']),'memoryBytes >= runtimeMemoryReserveBytes + 3*maximumSourceBytes + 2*maximumAggregateResultBytes; current addf/mulf renderer check, not proof of native capacity'),
 117: ('admission and dependency readiness integers',admission,'Each exact schema minimum..maximum inclusive and integral; no shared arbitrary timer maximum'),
 130: ('preparation scalar integer schema',preparation,'Each non-resourcePolicy preparation scalar must match its exact schema minimum/maximum and integer type; nested resourcePolicy validated separately'),
 147: ('Studio port and timer bounds',studio,'port 1..65535 and controlTimeoutMs 1..2147483647; both integral'),
 150: ('Studio integer rejection',studio,'Reject outside key-specific bounds or fractional; type check149 precedes conversion'),
 195: ('worker supervisor key-specific bounds',supervisor,'maximumJournalBytes up to9007199254740991, all other listed fields up to2147483647; minimum1 integral including uid/gid in this current template'),
 197: ('worker supervisor integer rejection',supervisor,'Reject outside those distinct bounds/fractional; type check196; target uid/gid domain must not be confused with host capacity or generalized Unix valid IDs'),
 211: ('worker connection budget',fields('prism-worker','ingress/',['maximumActiveRequests','maximumProbeRequests','maximumConnections']),'maximumActiveRequests + maximumProbeRequests <= maximumConnections; this fail belongs to condition210'),
 217: ('preparation storage relation',storage,'archive<=request; header<metadata; input<=journal; result+4*input<=output; header+4*input<=result; output<=journal. Preserve all six distinct relations'),
 218: ('preparation close ordering',fields('buster-engine','preparation/',['closeTimeoutMs','drainTimeoutMs']),'closeTimeoutMs > drainTimeoutMs'),
 225: ('retired duplicate bundle author',[],'Any presence of Values.swarmConfigJson rejects, including empty/null; no settings author here. Bundle comes from seven entry/component documents at228-233'),
 260: ('cluster policy integer schema vocabulary',[],'Recursive integer leaf validation uses exact schema.minimum/maximum and integral float64 at258-260; object/array/string/boolean branches are distinct, no default injection'),
 265: ('selected complete Buster document required',[],'Values.busterComponentFile must be present; full document selection, not keywise merge'),
 266: ('Buster selection path',[],'String matching ^files/config/(profiles/)?buster-engine([.][a-z0-9-]+)?[.]config[.]json$ at267-268; required nonempty file at273, owner/schema identity275'),
 269: ('retired Buster namespace author envelope',[],'Presence of Values.busterNamespaceBroker triggers retired-key inspection; not blanket prohibition of all deployment/broker keys'),
 271: ('retired lease API duplicate authors',fields('buster-engine','clusterInvokers/shared/',['leaseApiGroup','leaseApiVersion']),'Reject presence of either Values.busterNamespaceBroker.leaseApiGroup or leaseApiVersion including null; selected same-Buster component owns the API identity'),
}
# Enumerate actual integer leaves for the recursive cluster clause.
def leaves(node, pointer='clusterInvokers'):
    if node.get('type') == 'integer':
        yield dict(owner='buster-engine',currentAuthor=f'files/config/buster-engine.config.json#/settings/{pointer}',schemaDomain=node)
    for key, child in node.get('properties',{}).items():
        yield from leaves(child,pointer+'/'+key)
    if 'items' in node:
        yield from leaves(node['items'],pointer+'/<item>')
D[260] = (D[260][0],list(leaves(defs['buster-cluster-invokers'])),D[260][2])
queue = json.loads((P/'batch-24/remaining-batches.json').read_text())
ids = set(next(x['candidateIds'] for x in queue['bySource'] if x['source']==S))
originals = json.loads((P/'candidate-dispositions.json').read_text())['candidates']
rows = []
for c in originals:
    if c['id'] not in ids:
        continue
    n = c['line']; name, members, domain = D[n]
    rows.append(dict(candidateId=c['id'],originalCandidate=c,sourceRef=ref(S,n),field=name,members=members,currentDomainAndRelations=domain,
        classification='source validation or generated selection; not an independent numeric settings author',
        actualReaderRef=ref(S,210 if n==211 else n),
        callerRefs=[ref('charts/kubeclaw/templates/configmap-swarm-config.yaml',10),ref('charts/prism/templates/_swarm-config.tpl',18)],
        proposedAuthority='Retain each current component owner in selected complete generation; rename system entry to pipeline.config.json only in approved C1. Loader/protocol/schema limits remain explicit separately from adjustable policy.',
        activation='Validate complete selected component documents before Chart rendering; no per-key overlays or hidden defaults. Actual native caller acceptance remains distinct.',
        recovery='Retain the original full selected document and content identity; do not reselect latest or substitute another Buster profile during an existing run.',
        requiredFutureChecks=['exact original/corrected profile and schema joins','boundary type/range and each relation rejection at this productive renderer','same-generation runtime consumer and recovery cases'],
        definitionAccepted=False,runtimeResult='not-run'))
assert len(rows)==20 and {x['candidateId'] for x in rows}==ids
out=dict(scope='20 exact remaining Swarm template clauses, source definitions only',schemaRef=dict(path=SC,sha256=sha(R/SC)),priorQueueRef=dict(path=str((P/'batch-24/remaining-batches.json').relative_to(R)),sha256=sha(P/'batch-24/remaining-batches.json')),rows=rows,remainingQueueUnchanged=True,globalC0Accepted=False)
(O/'source-field-definitions.json').write_text(json.dumps(out,indent=2)+'\n')
print('20 original candidate bodies retained; concrete loop members/domains and renderer readers pinned; no semantic/native acceptance')
