"""Trace actual Prism Chart/ENV/child projections; keep unresolved C0 explicit."""
import hashlib
import json
from pathlib import Path

base = Path('docs/review/evidence/config-acceptance/author')
fragment = base/'main-fragment.json'
data = json.loads(fragment.read_text())
receipt = json.loads((base/'prism-trust-source-current-receipt.json').read_text())
inputs = {d['path']:d for d in receipt['sourceAndTestInputs']}
control = 'skills/prism/server/control-config.ts'
worker = 'skills/prism/server/worker-config.ts'
native = 'skills/prism/config/native-worker.ts'
studio = 'skills/prism/server/studio-config.ts'
chart = 'charts/prism/templates/workloads.yaml'
records = [
    ('TRUST-MODE',control,'WORKER_TRUST_SPIFFE_ENABLED','generated-binding','absent or any non-true string => HMAC; exact true => SPIFFE','boolean target; current coercion is not type validation',
     'Chart workerTrust.spiffe.enabled → Control/Worker startup → nativePrismCommand closed ENV → nativePrismHostConfig → artifact/attempt auth',
     'aliasOf:DLV-CHART-PRISM-WORKERTRUST-SPIFFE-ENABLED','All control/worker/proxy projections must agree. False omits ENV and selects real HMAC secrets; true emits peer IDs/proxy and suppresses HMAC secret ENV. No per-request latest mode.'),
    ('TRUST-PRINCIPAL-NOVA',control,'PRISM_TRUSTED_NOVA_SPIFFE_ID','generated-binding','empty when absent; required nonempty in SPIFFE mode','Chart trustDomain/novaNamespace/novaServiceAccount derivation; exact Core SPIFFE regex at real authorizeProxiedSpiffePeer',
     'Chart → loadTrustConfig → dispatchRoute.authenticateDispatch → loopback-only authorizeProxiedSpiffePeer',
     'generatedFrom:DLV-CHART-PRISM-WORKERTRUST-SPIFFE-TRUSTDOMAIN,NOVANAMESPACE,NOVASERVICEACCOUNT','Load checks presence only; actual guard validates syntax and exact peer membership. Not a separate editable identity author.'),
    ('TRUST-PRINCIPAL-WORKER',control,'PRISM_TRUSTED_WORKER_SPIFFE_ID','generated-binding','empty when absent; required in SPIFFE mode','trustDomain + Release.Namespace + actual prism-worker service account',
     'Chart → loadTrustConfig → internal-artifacts.authorized → Core loopback peer guard',
     'generatedFrom:Prism deployment trust domain/namespace/service account','Artifact route permits worker/control/optional agent peers; preserve exact selected identity and accepted artifact origin on retry.'),
    ('TRUST-PRINCIPAL-CONTROL',control,'PRISM_CONTROL_SPIFFE_ID; worker PRISM_TRUSTED_CONTROL_SPIFFE_ID','generated-binding','control and worker aliases derive same Chart principal; empty control value in HMAC mode','trustDomain + Release.Namespace + actual prism-control service account',
     'Chart → Control own identity/artifact peer and admitDesignAgent identity prefix; Worker trusted peer → worker-service guard',
     'generatedFrom:Prism deployment trust domain/namespace/service account','Control principal also prefixes admitted agent registration (/prism/main/v2); cannot classify as only transport auth. Worker alias is not a second author.'),
    ('TRUST-PRINCIPAL-AGENT',control,'PRISM_TRUSTED_AGENT_SPIFFE_ID','generated-binding','empty when absent; required in SPIFFE mode','Chart trustDomain/agentNamespace/agentServiceAccount; Core regex at guard',
     'Chart → loadTrustConfig → internal artifact allowed peer set',
     'generatedFrom:DLV-CHART-PRISM-WORKERTRUST-SPIFFE-TRUSTDOMAIN,AGENTNAMESPACE,AGENTSERVICEACCOUNT','This is the peer identity allowlist, not the runtime/model selector; artifact route includes it only when nonempty.'),
    ('TRUST-PRINCIPAL-TEST-RUNNER',control,'PRISM_TRUSTED_TEST_RUNNER_SPIFFE_ID','generated-binding','optional empty; Chart emits same namespace prism-test-runner in SPIFFE mode','generated principal or explicit absent optional membership; target optional activation explicit',
     'Chart → loadTrustConfig → dispatchRoute authenticated peer set after filtering empty values',
     'generatedFrom:Prism deployment trust domain/namespace/service account','Distinct allowed caller, not a fabricated productive Core trust-envelope consumer.'),
    ('SECRET-SESSION',control,'PRISM_SESSION_SECRET','secret-reference','Chart secrets.runtime key session-secret; actual bytes never persisted','current required nonempty bytes, no trim or revision validation',
     'Chart SecretKeyRef → loadControlServerConfig → session mint/verify and productActor',
     'referenceOf:DLV-CHART-PRISM-SECRETS-RUNTIME#/session-secret','Session validity uses originally signed expiry. External Secretstore identity/revision/rotation and recovery contract unknown; do not invent a revision.'),
    ('SECRET-INGRESS',control,'PRISM_INGRESS_SECRET; Studio same ENV','secret-reference','Chart secrets.runtime key ingress-secret; Studio missing => empty disables proxy','Control requires nonempty; Studio only rejects at proxy if empty',
     'Chart → Control identity exchange; same ref → Studio upstreamHeaders x-prism-ingress-secret',
     'referenceOf:DLV-CHART-PRISM-SECRETS-RUNTIME#/ingress-secret','Control/Studio share the exact logical credential; selected endpoint/credential must remain coupled. No separate Studio secret author.'),
    ('SECRET-WORKER',worker,'PRISM_WORKER_SECRET; Control and native child aliases','secret-reference','Chart secrets.runtime key worker-secret only in HMAC mode; true-mode empty','required nonempty HMAC; intentionally unused in SPIFFE mode',
     'Chart → WorkerNonceDatabase.authenticate; Control artifact Bearer guard; closed native ENV → WorkerArtifactClient',
     'referenceOf:DLV-CHART-PRISM-SECRETS-RUNTIME#/worker-secret','Same bytes serve HMAC attempts and artifact Bearer auth, but those are different validation protocols. Child environment is captured, not reloaded from ambient ENV.'),
    ('SECRET-DISPATCH',control,'PRISM_DISPATCH_SECRET','secret-reference','Chart secrets.runtime key dispatch-secret only HMAC','required nonempty HMAC; unused SPIFFE',
     'Chart → loadTrustConfig → dispatch-route HMAC(key.rawBody)',
     'referenceOf:DLV-CHART-PRISM-SECRETS-RUNTIME#/dispatch-secret','Not the worker secret or model selector; idempotency key + raw body define actual signature domain.'),
    ('SECRET-INGESTION',control,'PRISM_INGESTION_SECRET','secret-reference','Chart secrets.runtime key ingestion-secret','Control requires nonempty bytes',
     'Chart → Control config → corpus acquisition POST / cleanup DELETE Authorization',
     'referenceOf:DLV-CHART-PRISM-SECRETS-RUNTIME#/ingestion-secret','Original endpoint, quarantine digest and credential reference must survive cleanup/retry. No latest credential fills missing historical binding.'),
    ('SECRET-DATABASE',worker,'DATABASE_URL; Control listener alias','secret-reference','Chart secrets.database key runtime-url','Worker HMAC requires nonempty; SPIFFE worker permits empty; Control passes undefined to pg.Pool if omitted',
     'Chart → WorkerNonceDatabase or Control captured listener → pg.Pool',
     'referenceOf:DLV-CHART-PRISM-SECRETS-DATABASE#/runtime-url','Worker SPIFFE does not use nonce DB. Control missing URL can fall through to pg connection defaults; current existence of a required explicit Control connection reference is not proven.'),
    ('NATIVE-SCOPE',native,'KUBECLAW_NATIVE_SCOPE','generated-binding','launcher exports validated parent cgroup path','host checks presence; actual launcher verifies pinned parent/child scopes and process relocation',
     'Core native-worker-launcher.c → setenv(parent_path) → nativePrismHostConfig → native operation scope',
     'generatedFrom:Core trusted accepted native scope binding','Not an operator-tunable arbitrary ENV path. Genuine host membership/recovery proof remains not-run; no cgroup mutation in this evidence.'),
    ('NATIVE-ASSIGNED-INPUT',native,'PRISM_NATIVE_ASSIGNED_INPUT_BYTES','generated-binding','String(native.maximumInputBytes) from captured ingress settings','host safe integer1..2147483647; supervisor loader rejects this ENV as legacy competing config authority',
     'CMP-prism-worker-ingress.maximumInputBytes → prismSupervisorSettings → nativePrismCommand closed ENV → host input bound',
     'aliasOf:CMP-prism-worker-ingress.maximumInputBytes','Same variable is forbidden ambient loader authority but required generated child transport. Do not classify the two paths as equivalent overrides.'),
    ('NATIVE-POOL-POLICY-LOCATOR',native,'PRISM_NATIVE_POOL_POLICY_FILE','generated-binding','Docker /etc/kubeclaw/prism-pool.json; Chart host preflight projection/mount','absolute canonical non-root locator; actual Core pool parser/runtime/node identity authority',
     'Docker + host generated mount → nativePrismSupervisorConfig → readNativeWorkerPoolPolicy/identity',
     'generatedFrom:Core native host pool/policy binding','Policy bytes/limits remain their existing sole Core/host authority; filepath transport does not create a second policy author. Exact actual host/node/pool identity is external.'),
    ('NATIVE-LAUNCHER-LOCATOR',native,'PRISM_NATIVE_LAUNCHER','generated-binding','Docker /usr/local/libexec/kubeclaw-native-worker-launcher','absolute canonical non-root filepath at config; image installation/executable trust distinct',
     'Docker install/ENV → nativePrismSupervisorConfig → nativePrismCommand → Core launcher',
     'generatedFrom:locked native launcher package/delivery binding','No claim that pathname alone proves installed executable or privilege/cgroup authority.'),
    ('BROWSER-ROOT',native,'PLAYWRIGHT_BROWSERS_PATH','operator-setting','ENV else /ms-playwright; Docker image sets same path','current loader no explicit path/existence validation; supported locked installation domain pending',
     'Docker locked browser package → supervisor browserPath → closed child ENV → Playwright registry/browser launch',
     'prism-worker existing owner proposed installation/browserRoot','Native child cannot see later ambient path changes. Actual locked registry reader, architecture/package closure and complete alternative installation profile proof remain open.'),
    ('STUDIO-ASSET-ROOT',studio,'STUDIO_ROOT','operator-setting','ENV else module-relative dist-studio; Docker sets /app/prism/skills/prism/dist-studio','loader accepts string; studio request path containment/open/stream is separate boundary',
     'Docker built assets/ENV → loadStudioConfig → handleStudioRequest actual static-file resolver',
     'prism-studio existing owner proposed installation/assetRoot','Package locator and actual files must be one delivered generation; no fake root/path-only success or unrelated asset rewrite.'),
    ('INTERNAL-ARTIFACT-UPLOAD-BYTES','skills/prism/server/internal-artifacts.ts','POST accumulated bytes ceiling','operator-setting',134217728,'wire bytes; current reject size>limit',
     'authenticated Control internal artifact POST → byte accumulation → digest check → artifacts.put',
     'prism-control existing owner proposed internalArtifact/maximumUploadBytes','Distinct from6MB corpus/base64 and native evidence envelope budgets; requires coupled domain/admission/profile review, not equal-cap alias.'),
    ('ARTIFACT-ACK-BYTES','skills/prism/server/worker-artifacts.ts','upload responseBytes(response,8192)','operator-setting',8192,'response bytes; checks content-length and actual streamed length',
     'native WorkerArtifactClient.upload → current real HTTP response parser → acknowledgment identity checks',
     'prism-worker existing owner proposed artifactClient/maximumAcknowledgmentBytes','Read artifact limit derives artifact.sizeBytes task binding; acknowledgment cap is code policy. Preserve redirect:error and digest/size/ID equality.'),
    ('STUDIO-REQUEST-BYTES','skills/prism/server/studio-request.ts','requestBody accumulated size ceiling','operator-setting',2000000,'wire bytes; current error413 PRISM_STUDIO_REQUEST_TOO_LARGE',
     'studio.ts → handleStudioRequest/proxy → requestBody → upstream fetch',
     'prism-studio existing owner proposed proxy/maximumRequestBytes','Independent real parser/consumer from Control body even though current value equals2M; coupled domains/full profiles/real proxy harness still open.'),
]
requirements = ['C0-A','C0-B','C0-C','C0-D','F-AUTH','F-VAL','F-BIND','F-DELIVERY']
rows, cases = [], []
for name, source, field, kind, current, domain, chain, target, reason in records:
    sid = 'AUTH-PRISM-'+name
    cid = sid+'-IMPLEMENTATION'
    rows.append({'id':sid,'owner':'actual Prism role/producer identified in target reference',
      'scope':{'instance':chain,'profile':'current actual startup generation; target full selection/binding still open'},
      'class':kind,'classificationReason':reason,'source':{'path':source,'field':field,'sha256':inputs[source]['sha256']},
      'current':{'valueOrDefault':current,'precedence':reason},'typeUnitDomain':domain,
      'reader':chain.split(' → ')[-1],'productiveCallerChain':chain.split(' → '),
      'validation':{'semantic':domain+'; '+reason,'schema':'Current reader boundaries above; complete default-free target schema/projection domain not implemented'},
      'targetAuthorRef':target,'activationScope':{'current':'S captured service/supervisor or J assigned native child binding, as identified above','target':'Retain original accepted profile/identity/reference for operation and cleanup; unstarted allowed modules only after atomic validated publish'},
      'recoveryRetryClaimDeadlineBudgetEffects':reason,'profileEvalSuitability':'Fixed original generation/ref identity for Eval; missing external Secretstore revision/host prerequisites cannot be fabricated',
      'migrationAction':'C3 existing role-author extension or referenced shared producer; C5 durable closure before dispatch; no second author/ambient override',
      'requirementIds':requirements,'caseIds':[cid],'verifiedSourceEvidence':[receipt['sourceReadLog']],
      'semanticStatus':'source-traced-exact-alias-domain-profile-case-review-open','c0Closed':False})
    cases.append({'id':cid,'settingIds':[sid],'requirementIds':requirements,'phase':'implementation-proposal','scope':'local definitions plus genuine disposable service/host/API/Secretstore prerequisites for claimed effects',
      'productiveCaller':chain,'inputProfile':{'current':current,'completeA':'pending supported full author generation','completeB':'pending materially distinct generation or generated-binding producer witness'},
      'priorState':'Retain original accepted scope/artifact/claim/quarantine/credential-ref identity and budgets; started A never adopts latestB; missing history rejects before effects',
      'expectedEffectOrRejectingBoundary':reason+'; intended exact rejection comes from actual guard above, with same-boundary positive control',
      'observerMethod':'Actual source-identified auth/path/byte/DB/child environment observer; no mocked component or secret-byte effective output',
      'command':None,'sourceIdentity':{'sources':[inputs[source],inputs[chart]]},'testDigests':[],
      'toolDependencyImageConfigIdentities':None,'rawEvidencePath':None,'result':'not-run','reason':'Future C3/C5 unapproved; exact complete profile/domain/real harness specification remains explicitly open',
      'reviewerConfirmation':None,'specificationStatus':'incomplete-explicit'})
ids = {r['id'] for r in rows}
assert not ids.intersection(r['id'] for r in data['rows']), 'Do not overwrite historical rows on repeated generation'
data['rows'].extend(rows)
data['cases'].extend(cases)
source_map = {s['path']:s for s in data['sources']}
source_map.update({p:{'path':p,'sha256':d['sha256']} for p,d in inputs.items()})
data['sources'] = list(source_map.values())
cid = 'AUTH-PRISM-C0-CURRENT-COMPOSITION-CHECKPOINT5'
composition_rows = [r['id'] for r in rows if r['source']['path'] in (control,worker)]
data['cases'].append({'id':cid,'settingIds':composition_rows,'requirementIds':['C0-A','C0-C','A2','A3','A4','A5'],'phase':'C0','scope':'current unchanged real config-loader composition tests only',
 'productiveCaller':'loadControlServerConfig/loadControlCompositionConfig/loadWorkerConfig actual loader and startup snapshots; no real DB connection/authenticated service dispatch claim',
 'inputProfile':'Seven current Chart config files plus exact tracked fixture/source inputs in receipt; tests construct disposable local alternate owner/ENV inputs',
 'priorState':'Explicit SWARM_CONFIG fixture; ambient NODE_ENV/SWARM_CONFIG removed; test-local generated credentials, no deployed credential used',
 'expectedEffectOrRejectingBoundary':'All74 existing selected composition cases collect and pass; includes required trust/secret rejection, original endpoint defaults, immutable snapshot, actual author schema/legacy competing input/relations. Not per-new-field target F-EFFECT.',
 'observerMethod':'Exact current test case names/assertions retained in raw test output and source hashes; no future case accepted merely by suite count',
 'command':'env -u NODE_ENV -u SWARM_CONFIG node --test skills/prism/tests/control-server-config.test.mts skills/prism/tests/swarm-worker-config.test.mts',
 'sourceIdentity':receipt,'testDigests':[inputs[p] for p in ('skills/prism/tests/control-server-config.test.mts','skills/prism/tests/swarm-worker-config.test.mts')],
 'toolDependencyImageConfigIdentities':{'node':receipt['node'],'inputs':receipt['sourceAndTestInputs'],'externalCredentialUsed':False},
 'rawEvidencePath':receipt['rawEvidence'],'rawEvidenceSha256':receipt['rawSha256'],'result':'passed','reason':receipt['scope'],'reviewerConfirmation':None,
 'specificationStatus':'executed-current-composition-source-definition-only'})
for row in rows:
    if row['id'] in composition_rows: row['caseIds'].append(cid)
data['gaps'].append({'id':'AUTH-PRISM-TRUST-SURFACE-CLOSURE','reason':'21 additional current trust/secret/child/installation/byte surfaces traced; full target profiles/domains/cases, exact shared principal/credential producer aliases, external revision/host and fresh independent review remain open. Current74loader cases do not close target behavior.'})
fragment.write_text(json.dumps(data,indent=2)+'\n')
(base/'prism-trust-surface-dispositions.json').write_text(json.dumps({'settings':rows,'receipt':str(base/'prism-trust-source-current-receipt.json'),'currentCompositionCase':cid,'globalC0Accepted':False},indent=2)+'\n')
print(json.dumps({'newRows':len(rows),'currentCompositionTests':74,'targetImplementationAccepted':False}))
