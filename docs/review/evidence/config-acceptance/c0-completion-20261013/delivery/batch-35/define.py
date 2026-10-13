"""Thirty-three Ops bootstrap/supervisor/tool source clauses, static only."""
from pathlib import Path
import json,hashlib
R=Path.cwd();P=R/'docs/review/evidence/config-acceptance/c0-completion-20261013/delivery';O=P/'batch-35'
BOOT='ops/pod/bootstrap.py';SUP='ops/pod/supervisor.py';CFG='tools/ops-mcp/src/config.mjs';H='tools/ops-mcp/src/hubble.mjs';K='tools/ops-mcp/src/kubernetes.mjs';SERVER='tools/ops-mcp/src/server.mjs'
sources=[BOOT,SUP,CFG,H,K]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def ref(s,n):
 p=R/s;return dict(path=s,line=n,expression=p.read_text().splitlines()[n-1],sha256=sha(p))
def find(s,text):return [ref(s,n) for n,line in enumerate((R/s).read_text().splitlines(),1) if text in line]
D={
 BOOT:{
 11:('Kubernetes context','operator-installation-reference','Required KUBE_CONTEXT env indexes directly; kubectl base carries explicit --context and request-timeout20s. Context is original authorized cluster selection, not a task or grant override.'),
 12:('Ops namespace','deployment-location-reference','OPS_NAMESPACE env get defaultkubeclaw-ops only if missing; empty explicit string is not normalized here. deploy wrapper uses :- default and exports namespace before bootstrap; actual cluster namespace/permissions remain external.'),
 67:('optional provider credential file selection','secret-reference','Truthy OPS_GITHUB_TOKEN_FILE selects codex-ops-github/token; truthy OPS_TAILSCALE_AUTHKEY_FILE selects codex-ops-tailscale/authkey. Both members explicitly enumerated, no credential value stored. Existing bearer/pull retention rules are different from these unconditional selected file applies.'),
 68:('provider credential file read','secret-reference','Read selected local file as text and strip whitespace; empty rejects, then applies named Secret. No provider-format validation or authentic revision inferred; repeated selected file apply is not immutable module binding.'),
 },
 SUP:{
 46:('control socket wait budget','service-startup-policy','wait_for_control default20s monotonic deadline; checks liveUnix connection (0.5s connect timeout), loops wait0.2 untilstop/deadline. Reachable listener is not pairing/relay health; deadline checks do not prove a hard total wallclock fence.'),
 59:('control subprocess budget','service-lifecycle-policy','run_control default20s child.wait; actual login status caller overrides15s, quiet output. Timeout kills then waits and returns124; final blocking reap is separate, no stronger bounded shutdown proof.'),
 78:('child environment inheritance','generated-process-environment','Copy complete current os.environ once atmain startup then inject selected MCP token; current inherited fields are not a validated/frozen central module generation. Do not invent a second ENV author.'),
 79:('MCP bearer file projection','secret-reference','Read fixed /var/run/kubeclaw-ops/bearer/token, strip, inject KUBECLAW_MCP_TOKEN into child environment; command bearer_token_env_var refers to this name, no token in URL/Git config.'),
 80:('MCP bearer minimum length','secret-reference-validation','Require at least32characters afterstrip, not provider validity/expiry/revision/authentication proof. Token captured atmain startup, unlike Kubernetes request token file reread.'),
 },
 CFG:{
 2:('namespace allowlist parser/default','tool-scope-policy','OPS_ALLOWED_NAMESPACES absent falls back to selected defaultNamespace, then comma split with NO trim; explicit empty or whitespace entries invalid. Return deduplicatednames aftervalidation.'),
 4:('namespace domain and default membership','tool-scope-policy','DNS-shaped63character maxregex per name; defaultNamespace must be included, Argo namespace must bevalid but need NOT be inallowedlist in this function. Actual server uses namespace enum/default for namespaced tools and separate Argo location.'),
 10:('Ops MCP configuration activation','service-config-loader','Current optional environment parameter defaultsprocess.env; PORT default8080, HOSTdefault0.0.0.0, OPS_LOCAL_ONLY onlyliteral1 requiringhost127.0.0.1; defaultNamespacekubeclaw, Argoargocd, optional bearerfile/token and comma-trimmedoriginset. Object.freeze is shallow; no immutable module-generation proof.'),
 12:('MCP listen port current domain','service-listen-policy','Number conversion of PORT with missingfallback8080; Number.isInteger and0..65535 inclusive, so0 ephemeralport currently accepted. Selected deployment8080 expectations/native listener and target alternate profiles remain separate; do not misstate current domain1..65535.'),
 },
 H:{
 11:('Hubble absolute query window','observation-query-policy','Taskstart/end parsedDate; missing/falsyend usesnow, missing/falsystart end-5minutes; finite start<end andspan<=15minutes. Older absolute windows allowed, not retention guarantee. Provider query args/caller schema separate.'),
 18:('Hubble loss observation classification','observation-protocol','Truthy lost_events/lostEvents takes precedence and yields warning (first snake_case via??); no reconstructed lost data or global absence proof.'),
 19:('Hubble node status classification','observation-protocol','Truthy node_status/nodeStatus yields warning afterlost-eventprecedence, beforeflow. Other response.flow accepted next; warning metadata is observed data, notoperator setting.'),
 21:('legacy Hubble flow classification','observation-protocol','Legacy object withtruthyverdict andsourceORdestination classifiedflow afterwrapper/warnings. Unknown yieldswarning; no assertion fullprovider schema validation.'),
 32:('Hubble task query projection','task-observation-input','CLI observe usesselectedserver/outputjson/last limit+1 sentinel/window/namespace; optionalpod namespace/pod, verdict/node filters. Actual server limit integer1..50 default20 and namespace enum; raw helper doesnot independently validate all args.'),
 41:('Hubble subprocess environment','generated-process-environment','Selected binary/server defaultsfromenv; child receivesonly currentPATH and HOME=/tmp, ignorestdin/pipestdoutstderr. Defaulttimeout12000ms andactivequerieslimit2 elsewhere; no installedprovider/image/identity proof.'),
 59:('Hubble exact peer postfilter','task-observation-input','Keep flow only if sourceORdestination namespace exactlymatches and optionalpod exactlypod_name??podName. Verdict postfilter separate; node only CLI projection here, no invented local node postfilter.'),
 106:('Hubble observation requested window','observed-task-result','Return requested normalizedwindow andnamespace/pod/node, not actualcomplete retained interval or stablelosslesscursor.'),
 107:('Hubble observation limits/counts','observed-task-result','Return selectedverdict/limit/rawBytesRead/matched; rawlimit2MiB sharedstdoutstderr, compactflowarray192KiB, summary8192B andboundedwarnings distinct. Reasonsyieldpartial status; countnot completeness.'),
 110:('Hubble returned window','observed-task-result','First/last timefromreturned summaryflows sortedstringtime andlimited/droppedoldest; nullifnone. Not fullquery/peer retention extent; loss/saturation/raw/output limits remainpossible.'),
 112:('Hubble ringbuffer retention statement','observation-protocol','Availablepeerringbuffers only; overwrittenflows cannot be recovered, empty results do not provecoverage/absenceofdrops; historicalCompleteness alwaysunknown, continuationstrategy notlosslesscursor.'),
 },
 K:{
 16:('Kubernetes API origin protocol','installed-provider-reference','newURL selectedapi envdefaulthttps://kubernetes.default.svc; HTTPSonly, nouser/password; separatepath/query/hash gate. Transport selectedhost/provider/CA auth facts remainexternal.'),
 17:('Kubernetes API origin location','installed-provider-reference','Origin pathname exactlyslash, noquery/hash; not arbitrarybasepath or credentials. No native TLS identity/cluster equivalence proof from syntax.'),
 21:('Kubernetes request path','task-protocol-input','Requireleading/ andnotleading// perrequest; GET transport, actual toolcallers constructencodednamespacedpaths. This checkalone not KubernetesRBAC or complete URL grammar validation.'),
 23:('Kubernetes rotated token file domain','secret-reference-validation','Eachrequest rereads selectedtokenFile andCAfile, trims token, rejects empty/internalwhitespace. Differentfrom supervisorstartupbearer; compatiblelivecredentialrotation vs immutablemodule Secretrevision contract must beexplicit, not latestauthor assumption.'),
 48:('Kubernetes status/error boundary','observation-protocol','Non2xx rejectsstatus+pathwithoutquery, never returnsAPIerrorbody/followsredirect in this implementation. Perrequest defaulttimeout10000ms andresponse8MiB ceiling separate from pagination aggregate/namespace/grant policy.'),
 67:('Kubernetes list page size','observation-query-policy','pageSizedefault500, integer>=1 with NO explicitmaximumor safeintegerbound. OtherinputdefaultsmapItemidentity,params{}, maxPagesInfinity,continueTokennull; callerboundedtools sometimesoverridefinite maxPages1.'),
 86:('oversized-page retry policy','observation-query-policy','Retry ONLY KUBERNETES_RESPONSE_TOO_LARGE whilepageSize>1 andbeforedeadline; halve floor lowerbound1 preservingselectors/continuation/transportceiling. Finite maxPages gives30s outerdeadline, Infinity givesInfinity; no aggregate boundednessclaim for unboundedcalls.'),
 91:('Kubernetes list item projection','observed-task-result','Append mapItem overpage.items??[] aftersuccessfulpage. mapIteminternalcallercode not editableoperator config; aggregateitems may exceedperresponsebound and unboundedcallsmay enumeratefullnamespace.'),
 93:('Kubernetes continuation state','observed-task-result','Usepage.metadata.continue || null aftersuccessfulpage, incrementpages; do-while performsfirstpage evenmaxPages0. Returnoriginal continuation+partialBoolean; partialnotfinished or absenceproof. Deadline/page limit semantics remaincurrent notstrongerboundedclaim.'),
 },
}
q=json.loads((P/'batch-24/remaining-batches.json').read_text());ids=set().union(*(set(next(x['candidateIds'] for x in q['bySource'] if x['source']==s)) for s in sources));originals=json.loads((P/'candidate-dispositions.json').read_text())['candidates'];rows=[]
for c in originals:
 if c['id'] not in ids:continue
 s=c['source'];n=c['line'];name,kind,domain=D[s][n]
 if s==BOOT:callers=find('scripts/deploy-ops-pod.sh','bootstrap.py')
 elif s==SUP:callers=find('ops/pod/Dockerfile','supervisor.py')+find('charts/ops-pod/templates/workload.yaml','codex-ops-status.json')
 elif s==CFG:callers=[ref(SERVER,11),ref(SERVER,22)]
 elif s==H:callers=[ref(SERVER,477),ref(SERVER,487)]+find(SERVER,'namespaceSchema')
 else:callers=[ref(SERVER,14),ref(SERVER,18)]+find(SERVER,'pageSize:')
 rows.append(dict(candidateId=c['id'],originalCandidate=c,sourceRef=ref(s,n),field=name,classification=kind,currentDomainAndPrecedence=domain,actualReaderRef=ref(s,n),productiveCallerRefs=callers,
  proposedAuthority='Selected Ops deployment/tool/service/credential-reference policy owner, task query/result data and protocol invariants remain distinct. Existing defaults/currentENV behavior are preserved historical facts, not approved targetfallbacks or a new competing author.',
  activation='Resolvecomplete selected role/namespace/provider/credential revision andbudget generation beforedeployment/action; actual service/current secret rotation reader differs from immutablemodule binding and requires explicit compatibility contract.',
  recovery='Preserveoriginal selected scope/config/provider/credential facts, query/result partialhistory and retained authstate; do not convertempty/status/socket observations intopairing/native/provider approval or silentlyexpandnamespace/grants.',
  remaining=['whole schema/profile/setting/requirement/executable future case joins','actualinstalledOps/provider/credentialrev/run-modulebinding contract','real consumer/effect/rejection/rotation/partial-result/recovery proofs','fresh independent source definition review'],definitionAccepted=False,runtimeResult='not-run'))
assert len(rows)==33 and {x['candidateId'] for x in rows}==ids
(O/'source-field-definitions.json').write_text(json.dumps(dict(scope='33 original Ops bootstrap/supervisor/config/Hubble/Kubernetes clauses; static source definitions',rows=rows,priorQueueRef=dict(path=str((P/'batch-24/remaining-batches.json').relative_to(R)),sha256=sha(P/'batch-24/remaining-batches.json')),remainingQueueUnchanged=True,globalC0Accepted=False),indent=2)+'\n')
print('33original Ops clauses retained; policy/protocol/task/secret/query/result distinctions andactualcallers recorded; no nativeexecution')
