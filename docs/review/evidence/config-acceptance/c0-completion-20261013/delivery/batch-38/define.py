"""Thirty-one exact Ops Chart/deployment clauses; static inventory only."""
from pathlib import Path
import json,hashlib
R=Path.cwd();P=R/'docs/review/evidence/config-acceptance/c0-completion-20261013/delivery';O=P/'batch-38';T='charts/ops-pod/templates/';W=T+'workload.yaml';DEP='scripts/deploy-ops-pod.sh';CFG='tools/ops-mcp/src/config.mjs'
sources=[T+n for n in ['kubeconfig.yaml','network.yaml','rbac.yaml','tailscale-storage.yaml','workload.yaml']]+[DEP]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def ref(s,n):
 p=R/s;return dict(path=s,line=n,expression=p.read_text().splitlines()[n-1],sha256=sha(p))
def find(s,text):return [ref(s,n) for n,line in enumerate((R/s).read_text().splitlines(),1) if text in line]
DW={
 2:('Codex image identity guard','release-reference','Selected codexImage must match^.+@sha256:[a-f0-9]{64}$, separate from actual registry/compatibility/source identity proof.'),
 5:('Ops MCP image identity guard','release-reference','Same exact digest-qualified reference guard for mcpImage; not every optional sidecar image is covered by these two guards.'),
 51:('Codex container image','generated-release-projection','Actual selected codexImage container field; image entrypoint/Docker supervisor/client/persistent authstate and real image receipt must agree.'),
 54:('Codex default namespace projection','generated-scope-projection','OPS_DEFAULT_NAMESPACE from selected defaultNamespace; generated kubeconfig default context also uses it when exec enabled. Does not itself grant API access.'),
 55:('Codex execution namespace projection','generated-permission-projection','Comma join of explicit rbac.execNamespaces. Current in-pod verify.py reads this ENV to check token mount and can-i get/create pods/exec; it is NOT an independently proven per-command runtime grant enforcer.'),
 56:('Codex kubeconfig ENV applicability','generated-permission-applicability','Nonempty execNamespaces emitsKUBECONFIG fixed selected mount path. Empty list suppresses env andCodex API/kubeconfig mounts, not MCP token projection.'),
 74:('Codex API credential/config mount applicability','generated-permission-applicability','Nonempty execNamespaces mounts projected kube-api and generated kubeconfig into Codex. MCP always mounts kube-api. Both use pod Release ServiceAccount, not separate container-specific RBAC principals.'),
 86:('Ops MCP container image','generated-release-projection','Actual mcpImage container field with separate digest guard; HTTP/namespace/credential config and real installed loader/image identity require coherent generation.'),
 90:('MCP default namespace projection','generated-scope-projection','Selected defaultNamespace feeds actual MCP config loader. It must be included in parsed allowed list; names are references to existing scope, not new grants.'),
 91:('MCP allowed namespace projection','generated-permission-projection','Comma join of rbac.namespaces; MCP loader splits without trimming, validates every member and default namespace membership, then removes duplicates using [...new Set(namespaces)]. Helm RoleBindings range the original list without downstream MCP deduplication; declaration is separate from actual native scope/permissions.'),
 92:('MCP Argo namespace projection','installed-service-reference','Selected argoNamespace independently validatedDNS shape but not required in MCPallowedlist; actual Argo reader uses this separate namespace, whose real RoleBinding/provider availability is an unclosed join.'),
 113:('Tailscale sidecar applicability','generated-provider-applicability','Selected tailscale.enabled emits userspace sidecar with own state PVC/mount, authSecret, localSOCKS1055, noNET_ADMIN. No login/connectivity/proxy availability proof from rendering.'),
 115:('Tailscale sidecar image','release-reference','Direct selected tailscale.image string; current default istag-qualified, no immutable regex guard for this sidecar in workloadtemplate. Selected provider/version/digest compatibility remains separate approval/release definition.'),
 123:('Tailscale hostname projection','installed-provider-reference','TS_HOSTNAME selected reference, not newly authorized tailnet actor/domain/provider registration; authentic original tailnet identity required.'),
 124:('Tailscale extra argument projection','provider-configuration-policy','TS_EXTRA_ARGS explicit selected string; current default--accept-dns=false. Exact supported CLI semantics/identity/proxy effects require selected installed provider, no arbitrary grant expansion.'),
 138:('kubeconfig volume applicability','generated-permission-applicability','Nonempty execNamespaces emits release kubeconfigConfigMap volume; actual Codex mount and env gates independent source clauses withsame selection.'),
 160:('Tailscale state/temp volume applicability','generated-provider-applicability','Enabled creates64Mi ephemeral temp plus persistent release-tailscale PVC mount; false omitspod references. KeptPVC/authstate is not silently deleted or replaced by empty state on recovery.'),
}
q=json.loads((P/'batch-24/remaining-batches.json').read_text());ids=set().union(*(set(next(x['candidateIds'] for x in q['bySource'] if x['source']==s)) for s in sources));originals=json.loads((P/'candidate-dispositions.json').read_text())['candidates'];rows=[]
for c in originals:
 if c['id'] not in ids:continue
 s=c['source'];n=c['line'];base=Path(s).name;refs=[]
 if s==W:
  name,kind,domain=DW[n]
  if n in (54,56,74,138):refs=find(T+'kubeconfig.yaml','execNamespaces')+find(T+'kubeconfig.yaml','namespace:')
  if n==55:refs=find('ops/pod/verify.py','exec_namespaces')+find('ops/pod/verify.py','subresource=exec')
  if n in (90,91,92):refs=find(CFG,'defaultNamespace')+find(CFG,'argoNamespace')
  if n==91:refs += [ref(CFG,7),ref(T+'rbac.yaml',28)]
  if n in (113,160):refs=find(T+'tailscale-storage.yaml','tailscale.enabled')+find(T+'network.yaml','tailscale.enabled')
 elif base=='kubeconfig.yaml':
  name='exec kubeconfig applicability' if n==1 else 'exec default namespace context';kind='generated-permission-applicability' if n==1 else 'generated-scope-projection'
  domain='Nonempty execNamespaces emits fixed in-cluster HTTPS/CA/tokenFile kubeconfig, current-contextops. It selects a client location/principal, not per-container different ServiceAccount or native authorization proof.' if n==1 else 'defaultNamespace projected as kubeconfig contextnamespace; independentexecNamespaces roleprofile determines granted namespaces and Codex tokenmount; default context doesnot itself prove membership/permission.'
  refs=find(W,'KUBECONFIG')+find(W,'name: kubeconfig')
 elif base=='rbac.yaml':
  name='observer namespace bindings' if n==28 else 'explicit execution namespace permissions';kind='operator-permission-profile'
  domain='For eachrbac.namespaces createRoleBinding inthatnamespace torelease readerClusterRole/get-listresources, originalsingleReleaseServiceAccount subject. Separate cluster-reader binding coversnodes/Ciliumcluster policies. Valuesnamespaces isnot an installed/native grantproof.' if n==28 else 'For eachexecNamespaces validate string/DNSregex/len<=63 then createRole andBinding: podsget/list andpods/execget/create. Explicit operator permission selection, not task data. SubjectsameReleaseServiceAccount usedby bothcontainers; Codexmountgate differsfrom sharedRBACprincipal.'
  refs=find(W,'serviceAccountName:')+find(W,'OPS_ALLOWED_NAMESPACES' if n==28 else 'OPS_EXEC_NAMESPACES')
 elif base=='network.yaml':
  D={1:('Ops network policy applicability','generated-network-topology','Enabled gates BOTH ordinary NetworkPolicy andoptionalCilium policy; ingress[] andexactegresspeers/ports retained. No actual CNI effect/network denial proof.'),2:('API endpoint CIDR prerequisite','installed-provider-reference','Enabled requiresnonemptyapiServerCIDRs regardlessofCiliumflag. Bootstrap derives hostCIDRs fromactual selectedcontext endpoint/serviceaddresses; syntax/referenceisnot authentic native endpointproof.'),21:('API endpoint CIDR members','installed-provider-reference','Individualselected CIDRs rendered into distinctipBlock entries; nativeKubernetesCIDRvalidity/addresscoverage/provideridentity remainsactualexternalfact.'),24:('API server network ports','generated-network-topology','Ordinarypolicy permitsTCP443 AND selectedapiServerPort toAPI CIDRpeers. This isnetworktransport projection, notalternateAPI/CA/tokenauthor or authenticatedidentity.'),30:('Tailscale UDP applicability','generated-provider-topology','Enabled emitsUDP3478/41641 publicipBlockwithownexceptlist; ordinaryHTTPSegress andDNS remainindependent. Do notassume identicalHTTPS/UDP private-range exclusions.'),37:('Cilium API-server policy applicability','generated-provider-topology','Selectedcilium flag emitscilium.io/v2 policy tokube-apiserver entity onlyinside enabledouterpolicy. ActualCRD/provider/node enforcement mustexist; declaredflagdoesnotinstallprovider.'),50:('Cilium API-server port projection','generated-network-topology','CiliumtoPortsTCP443 andselectedapiServerPort quotedstring, same selectedendpointport asordinarypolicy but different providerdocument. No nativeeffectiveunion/auth guarantee.')}
  name,kind,domain=D[n];refs=find('ops/pod/bootstrap.py','cidrs =')+find('ops/pod/bootstrap.py','ports =')+find('ops/pod/bootstrap.py','networkPolicy')
 elif base=='tailscale-storage.yaml':
  name='Tailscale persistent state applicability';kind='generated-provider-storage';domain='Enabled emitskeptrelease-tailscale PVC1Gi RWO, optional persistence.storageClass else clusterdefault. Actualretainedvolume/provider capacity/authidentity/recovery facts mustbepinned, notfreshdefault-state substitution.';refs=find(W,'claimName:')+find(W,'mountPath: /var/lib/tailscale')
 else:
  name='deployment repository location' if n==3 else 'observer Secret denial verification source';kind='generated-build-location' if n==3 else 'future-native-verification-source'
  domain='Derive absolute repositoryparentofscript; feeds release verifier/renderer/values/bootstrap sources, not user runtimeconfig author.' if n==3 else 'verify branch52–53 executes GET selecteddefaultNamespace/secrets with MCPmountedactualtoken. OnlyKubernetesAPI403countspositive; 401/missingfile/networkerror reject. It doesNOTverifyexecution-role denial, pairing, fullread-onlyprincipal or livepipelinehealth. Sourceisnot an executed result duringC0.'
  if n==53:refs=find('tools/ops-mcp/src/kubernetes.mjs','createKubeRequest')+find('tools/ops-mcp/src/kubernetes.mjs','Kubernetes API ${')
 rows.append(dict(candidateId=c['id'],originalCandidate=c,sourceRef=ref(s,n),field=name,classification=kind,currentDomainAndRelations=domain,actualRendererOrVerificationSourceRef=ref(s,n),relatedConsumerRefs=refs,
  proposedAuthority='Retain one selected Ops deployment/provider/permission/release/credential-reference policy owner; generatedENV/kubeconfig/RBAC/network/PVC objects are not independentauthors. Read/exec scope and actualsharedServiceAccount authority mustbeexplicit in completeprofiles, not inferredfrom container labels.',
  activation='Validate complete image/namespace/rolegrants/provider/credential/location/storage generation and exactrealrelease inputs beforedeployment. Nativeexec/connectivity/authstate/effects unobserved; no task/module approval from a generatedrole.',
  recovery='Preserveoriginal releaseServiceAccount/role/namespace/PVC/provider/credential revision andscope; keptstatecannotbereplacedwith newlyselected latest identity or emptyvolume. Fullmodule/run andcompatiblecredentialrotation contract remainsopen.',remaining=['whole schema/profile/setting/requirement/executable futurecase joins','authentic installedrole/provider/RBAC/CNI/API/credential/storage and real effect/rejection/recovery evidence','fresh independent source definition review'],definitionAccepted=False,runtimeResult='not-run'))
assert len(rows)==31 and {x['candidateId'] for x in rows}==ids
(O/'source-field-definitions.json').write_text(json.dumps(dict(scope='31 original Ops Chart/deployment source clauses; static definitions',rows=rows,priorQueueRef=dict(path=str((P/'batch-24/remaining-batches.json').relative_to(R)),sha256=sha(P/'batch-24/remaining-batches.json')),remainingQueueUnchanged=True,globalC0Accepted=False),indent=2)+'\n')
print('31original Ops Chart/deployment bodies retained;actual generatedreader andgrant/provider/reference distinctions; no runtimeexecution')
