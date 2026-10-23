"""Inventory of exact Chart transport/readiness source clauses, not native proof."""
from pathlib import Path
import hashlib,json

R=Path.cwd(); P=R/'docs/review/evidence/config-acceptance/c0-completion-20261013/delivery'; O=P/'batch-31'
K='charts/kubeclaw/templates/'; Q='charts/prism/templates/'
sources=[K+'_worker-trust-readiness.tpl',K+'configmap-worker-trust.yaml',Q+'_worker-trust-readiness.tpl',Q+'configmap-worker-trust.yaml']
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def ref(path,n):
    f=R/path;return dict(path=path,line=n,expression=f.read_text().splitlines()[n-1],sha256=sha(f))
def matches(path,needle):
    return [ref(path,i) for i,line in enumerate((R/path).read_text().splitlines(),1) if needle in line]
queue=json.loads((P/'batch-24/remaining-batches.json').read_text())
ids=set().union(*(set(next(x['candidateIds'] for x in queue['bySource'] if x['source']==s)) for s in sources))
originals=json.loads((P/'candidate-dispositions.json').read_text())['candidates'];rows=[]
for c in originals:
    if c['id'] not in ids:continue
    s=c['source']; n=c['line']; is_k=s.startswith(K); is_ready=s.endswith('_worker-trust-readiness.tpl')
    renderer=ref(s,n);refs=[]
    if is_ready:
        cm=(K if is_k else Q)+'configmap-worker-trust.yaml'
        refs=matches(cm,'trustReadinessListeners')+matches(cm,'trustReadinessCluster')
        if n==16:
            name='readiness request override header removal';kind='protocol-invariant'
            author='fixed readiness-only routing boundary, not a user-authored header allowlist'
            domain='Exactly five removed request controls: x-envoy-upstream-rq-timeout-ms, x-envoy-upstream-rq-per-try-timeout-ms, x-envoy-retry-on, x-envoy-max-retries, x-envoy-hedge-on-per-try-timeout. Current probe listener routes only GET health/bootstrap/ready plus404 fallback; no business route in this helper.'
        else:
            name='readiness self-check route timeout';kind='transport-probe-budget-policy'
            author='current inline1s readiness route budget; target selected same transport/readiness policy owner'
            domain='Current GET /ready routes to worker-trust-self-check with timeout1s. Adjacent helper request/stream timeouts2s, cluster connect0.5s, max_requests_per_connection1, circuit-breaker limits4 and max_retries0 are separate policies/invariants. Target positive finite duration, coherent selected generation; no implicit default budget. This is not Prism/Buster task timeout or grant.'
        refs+=matches(s,'request_timeout:')+matches(s,'connect_timeout:')+matches(s,'max_retries:')
    elif is_k:
        D={
          1:('agent proxy ConfigMap applicability','generated-applicability','Values.workerTrust.spiffe.enabled','Current Helm if truthiness; target strict boolean selects role-compatible proxy generation, not task authority.'),
          2:('actual release ServiceAccount requirement','deployment-identity-constraint','Values.serviceAccount.create + generated kubeclaw.fullname + Release.Namespace','When enabled, false create fails. Actual deployment ServiceAccount name and ServiceAccount metadata use the same fullname; genuine SPIRE registration is a separate external fact.'),
          5:('agent trust domain','approved-transport-reference','Values.workerTrust.spiffe.trustDomain','Current required checks nonempty only; target exact approved domain consistent with declared principals and real bundle/registrations, not a freely selectable alternate actor.'),
          17:('proxy service cluster name','generated-role-label','Values.agentRole','Generated kubeclaw-<role> name; separate from peer authentication. Enabled whole template supports only nova/buster/prism (explicit fail for others).'),
          23:('Nova egress listener selection','generated-role-topology','Values.agentRole == nova','Fixed two current listeners: buster-plan loopback28891 to buster-plan cluster; prism-agent loopback28080 to prism-agent cluster. Separate installed endpoints and approved peers must agree.'),
          35:('Buster ingress listener selection','generated-role-topology','Values.agentRole == buster','Current buster-plan ingress0.0.0.0:18891, exact same namespace agent-nova peer, sanitized forwarded URI, local cluster loopback28891. Native certificate/proxy effect is not established by the template.'),
          84:('Prism agent ingress/egress selection','generated-role-topology','Values.agentRole == prism','Current ingress18082 accepts exact same namespace agent-nova/prism-control/prism-test-runner principals, bridge-local18080; Control egressloopback28080. Identity match does not create actors/grants.'),
          128:('agent SDS socket','installed-provider-location-reference','Values.workerTrust.spiffe.socketPath','Current quoted Unix pipe path read into spire-agent cluster. Target absolute selected path matching actual CSI mount and installed SPIRE provider; nonempty string/quote alone is no native availability proof.'),
          129:('Nova remote transport clusters','generated-role-topology','Values.agentRole == nova','Fixed buster-plan hostagent-buster:18891 peeragent-buster and prism-agent hostagent-prism:8080 peeragent-prism, using selected trustDomain/Release.Namespace. Do not replace peer identity with an arbitrary endpoint domain.'),
          165:('Buster local transport cluster','generated-role-topology','Values.agentRole == buster','Current buster-plan-local static127.0.0.1:28891, connect_timeout1s; no independently authored remote peer here.'),
          175:('Prism agent transport clusters','generated-role-topology','Values.agentRole == prism','Current prism-bridge-local127.0.0.1:18080 and prism-control prism-control-internal:8443 with exact same-namespace prism-control SAN. Endpoint, timeout and peer authorities are distinct.'),
        }
        name,kind,author,domain=D[n]
        refs=matches(K+'deployment.yaml','/etc/kubeclaw-worker-trust/envoy.yaml')+matches(K+'deployment.yaml','-worker-trust')
        if n==2:refs+=matches(K+'deployment.yaml','serviceAccountName:')+matches(K+'serviceaccount.yaml','name:')
    else:
        if n==2:
            name='Prism proxy ConfigMap applicability';kind='generated-applicability';author='Values.workerTrust.spiffe.enabled'
            domain='Current Helm if truthiness, target strict boolean; emits control.yaml/worker.yaml/runner.yaml configurations. Workload role sidecar applicability is independently limited to Control/worker; runner uses its own consumer.'
        elif n==3:
            name='Prism trust domain';kind='approved-transport-reference';author='Values.workerTrust.spiffe.trustDomain'
            domain='Current required nonempty check, not complete domain validation. Same selected domain combines with Release.Namespace and fixed control/worker/test-runner ServiceAccounts, and declared Nova/agent namespace+SA refs. Real trust bundle/registrations external.'
        elif n in (67,179,220):
            role={67:'control',179:'worker',220:'test-runner'}[n]
            name=role+' SDS socket';kind='installed-provider-location-reference';author='Values.workerTrust.spiffe.socketPath'
            domain='Current pipe projection for '+role+' config. Target one absolute path compatible with actual selected mount/SPIRE driver; CSI installation, node registration and real SDS/socket availability remain unproven. Not a JS application socket reader.'
        else:
            is_nova=n==32;who='Nova' if is_nova else 'Prism agent'
            name=who+' exact transport principal';kind='generated-approved-principal';author='Values.workerTrust.spiffe.trustDomain + '+('novaNamespace/novaServiceAccount' if is_nova else 'agentNamespace/agentServiceAccount')
            domain='Exact declared '+who+' URI SAN generated from same selected domain/namespace/ServiceAccount. Must match original authorized registered actor and corresponding ENV/peer routes. No wildcard or independent SAN override author, no actor/grant expansion. Current printf/quote is not full native identity validation.'
        refs=matches(Q+'workloads.yaml','/etc/kubeclaw-worker-trust/%s.yaml')+matches(Q+'workloads.yaml','mountPath: /etc/kubeclaw-worker-trust')
        # Runner has a distinct productive configuration delivery path.
        if n in (220,257):
            refs=matches('scripts/deploy.sh','/etc/kubeclaw-worker-trust/runner.yaml')+matches('scripts/deploy.sh','configMap: { name: prism-worker-trust')
            if n==220:
                refs+=matches('scripts/deploy.sh','csi: { driver: csi.spiffe.io')
                domain+=' Runner deploy script currently fixes driver csi.spiffe.io rather than reading the Chart csiDriver setting; target same-generation provider/location join must migrate or explicitly constrain this separate physical author.'
    rows.append(dict(candidateId=c['id'],originalCandidate=c,sourceRef=renderer,field=name,classification=kind,currentAuthorOrGeneratedRef=author,currentDomainAndRelations=domain,
        actualRendererReaderRef=renderer,deliveryOrHelperCallerRefs=refs,
        downstreamConsumer='Selected Envoy image parses generated config; SPIRE/CSI/Kubernetes provider facts and real certificate/socket/route behavior are separate future gates',nativeConsumerProven=False,
        proposedAuthority='Retain original selected deployment-role/transport-policy owner and approved peer references; generated proxy config cannot compete as author. Whole schema/profile and exact requirement/case joins remain open.',
        activation='Validate complete selected role, image, domain, peer, socket/mount/provider and probe policy generation before delivery. No mutable latest value into an existing module/run.',
        recovery='Recover original image/config generation and authentic provider/peer/namespace/SA identities, without altering actors/grants or reclassifying new values as old run facts.',
        remaining=['whole selected schema and complete role-specific profile joins','concrete exact setting/requirement/future executable case links','authentic pinned Envoy/SPIRE/CSI/Kubernetes effect/rejection and recovery evidence','fresh independent definition review'],definitionAccepted=False,runtimeResult='not-run'))
assert len(rows)==24 and {x['candidateId'] for x in rows}==ids
(O/'source-field-definitions.json').write_text(json.dumps(dict(scope='24 original transport/readiness clauses; source definitions only',rows=rows,priorQueueRef=dict(path=str((P/'batch-24/remaining-batches.json').relative_to(R)),sha256=sha(P/'batch-24/remaining-batches.json')),remainingQueueUnchanged=True,globalC0Accepted=False),indent=2)+'\n')
print('24 original candidates conserved; renderer/caller expressions pinned; native and full profile/case gates remain open')
