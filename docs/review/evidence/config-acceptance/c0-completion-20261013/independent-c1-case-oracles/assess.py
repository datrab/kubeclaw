import json,hashlib,re,subprocess
from pathlib import Path
from collections import Counter
ROOT=Path.cwd(); BASE=Path('docs/review/evidence/config-acceptance/c0-completion-20261013');OUT=BASE/'independent-c1-case-oracles'
MP=Path('docs/review/remediation/config-acceptance-matrix.json'); IP=Path('docs/review/remediation/config-semantic-inventory.json');META=BASE/'components/metadata-correction-20/active-component-semantic-bodies.json'
load=lambda p:json.loads(Path(p).read_text())
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
scope=load(BASE/'c1-package-draft/scope.json');matrix=load(MP);inventory=load(IP);rows={r['id']:r for r in inventory['rows']};meta={r['id']:r['body'] for r in load(META)['rows']}
profiles=Path('docs/review/evidence/config-acceptance/components/refined-case-profiles.json');legacy=load(profiles)
# Families describe distinct productive operations, not type-only limits.
F={}
def fam(key,action,observer,prior='Same task and identities; new isolated actual component per whole selected profile; preserve retained state where the reader is durable.'):
 F[key]={'action':action,'observer':observer,'priorState':prior};return key
fam('listener-bind','Start actual component entry with each whole profile; request the actual configured HTTP route at its selected port; after shutdown confirm old port is closed. Supply retired PORT separately as a negative startup input. Never submit a numeric port+1 quota witness.','Bound socket address and HTTP response; startup legacy-override error before listener creation.')
fam('preference-authorization','Dispatch the same actual order with authenticated subject under null versus explicitly selected preference subject, resolving through authorizePipelinePreferenceSubject and actual dispatch.','Selected authorized preference source/dispatch result; invalid or competing subject rejection before worker dispatch.')
fam('artifact-root','Execute actual artifact creation/retrieval through ContentAddressedArtifactStore composed by control-context; use distinct isolated permitted roots.','Content address and exact file/root location; no writes in the unselected root; retained artifact identity unchanged.')
fam('studio-url','Execute actual agent route that creates project/document result with same identifiers.','Returned studioUrl equals selected base plus actual project/document query; no transport capacity test.')
fam('control-upstream-url','Make real studio request with pathname/query to two isolated actual Control services selected by whole profiles.','Actual upstream destination and forwarded path/query; unselected service receives nothing.')
fam('worker-dispatch-abort','Dispatch real worker operation lasting between selected deadlines, with claim and other phase budgets admitting it.','AbortSignal.timeout outcome and actual bounded transport error; capture whether remote work remains unresolved, never equate timeout with reap.')
fam('studio-upstream-abort','Forward actual studio request whose upstream completion straddles controlTimeoutMs; retain actual upstream cancellation behavior.','Selected setTimeout/controller.abort and returned HTTP/error; no fake timer replacing productive request.')
fam('ingress-active-capacity','Hold actual ordinary HTTP handlers unresolved; fill maximumActiveRequests and submit one additional ordinary request while connections/bytes/timeouts admit it.','PRISM_WORKER_CAPACITY_EXCEEDED at actual accept; admitted handlers count and subsequent release/re-admission.')
fam('ingress-probe-reserve','Hold active ordinary requests; submit GET /health,/bootstrap,/ready with no body/transfer-encoding through actual worker entry. Contrast ordinary request and body-bearing probe.','capacity=maximumActiveRequests+(probe?maximumProbeRequests:0); exact 503 capacity result. Probe count is not an independent maximumActiveRequests replacement.')
fam('ingress-connections','Hold real TCP connections at server.maxConnections with HTTP work below active-request cap; connect additional peer.','Actual socket admission/close behavior and server connection count; no guessed quota diagnostic.')
fam('ingress-request-timeout','Send real slow/incomplete HTTP request, comparing server.requestTimeout and headersTimeout=min(existing,requestTimeoutMs).','Actual Node HTTP request/header timeout and connection closure; distinguish header bound from body bound.')
fam('ingress-shutdown','Start active real requests then actual shutdown. Admission closes synchronously; cancellation/drain completes or exceeds selected deadline.','PRISM_WORKER_SHUTDOWN_DEADLINE or UNRESOLVED, closeAllConnections and durable uncertainty. Connection cutoff never proves arbitrary child reap.')
fam('identity-uid-gid','Run actual native supervisor child through configured identity launch, with authorized isolated host prerequisites.','OS observed uid/gid and ownership record; identity refusal before native effect; cannot model uid/gid as numeric capacity.')
fam('kernel-resource-policy','Launch actual native bounded phase with measured CPU, resident/cgroup memory or Linux task usage crossing selected policy; retain claim and cleanup prerequisites.','Actual sandbox/cgroup/kernel termination/resource accounting and persisted result. CPU uses cumulative CPU, not sleeping; tasks count processes/threads, not JSON items.')
fam('heap-floor-fraction','Launch actual provider/report child with invocation memory selecting each branch of max(minimumHeapMiB,floor(memoryBytes/1048576*heapFraction)).','Actual child argv and effective V8 heap constraint; hold floor/fraction counterpart to expose the setting. No maximum-quota witness for a minimum.')
fam('provider-openfiles-derived','Launch actual provider child with artifactFiles selecting floor and additive-reserve branches of max(minimumOpenFiles,artifactFiles+artifactFileDescriptorReserve).','Actual sandbox open-file argv/effective RLIMIT, safe-integer rejection; descriptor floor is not a maximum admission cap.')
fam('report-minimum-openfiles','Invoke actual report adapter with openFiles below/at minimumOpenFiles but <=maximumOpenFiles.','REPORT_ADAPTER_OPEN_FILE_LIMIT_TOO_LOW before child launch; compare accepted same-boundary positive.')
fam('report-cpu-derived','Invoke actual report adapter with selected CPU limit and max(minimumCpuTimeMs,floor(maximumTimeoutMs/1000)*1000) ceiling, measuring real child CPU where required.','REPORT_ADAPTER_CPU_LIMIT_BELOW_POLICY versus HARD_LIMIT_EXCEEDED:cpuMillis; actual sandbox CPU limit. Minimum and rounded ceiling are distinct.')
fam('report-memory-reserve','Invoke actual report adapter with memoryBytes around runtimeMemoryReserveBytes+3*maximumSourceBytes+2*maximumResultBytes; other limits accepted.','REPORT_ADAPTER_MEMORY_LIMIT_INCOMPATIBLE before launch; actual accepted child memory limit. Reserve is an additive compatibility formula, not task payload maximum.')
fam('claim-window-derived','Run actual runner-attempt-envelope with same node timeout and cleanup phases.','Original issuedAt/claim deadline: node.timeoutMs+completionPhases*cleanupTimeoutMs+claimGraceMs; capture signed persisted envelope, not sleep/no-op boundary.')
fam('queue-deadline-derived','Create actual runner attempt with fixed original issuance chronology.','queueDeadline=issuedAt+queueTimeoutMs in actual envelope and real queue expiration; no claim deadline substitution.')
fam('result-wrapper-derived','Create actual attempt envelope with same provider/report result limits.','resultBytes=providerResultLimit+reportResultLimit+workerResultWrapperBytes in signed/persisted envelope; wrapper is additive reserve, not input maximum.')
fam('source-reservation-derived','Run gate/staged/extracted actual preparation reservations and ledger admission with retained records.','reservation=payloadBytes+entries*sourceEntryReservationBytes; extracted adds archive.sizeBytes+maximumExtractedBytes+maximumHeaderBytes+maximumInputBytes with maximumArchiveEntries+7 entries; charged totals and rejection at source ledger. Header is not a direct payload quota here.')
fam('durable-store-admission','Seed identical valid retained records/evidence/journal with original identities; execute actual store admission/write at its measured byte/count/age boundary.','Real store reservation/encoded bytes/count and exact source error; lowering policy must not clear retained evidence/history or reset uncertainty.')
fam('preparation-slots','Hold actual preparations occupying selected slot prefix; submit additional preparation and then release one with actual receipt.','preparationSlots.slice(0,maximumActivePreparations) free-slot selection and persisted ledger; independent pool/request/source budgets admit the case.')
fam('admission-jobs-attempts','Submit actual jobs/attempts via remote plan service until active/queued/concurrent-attempt admission path saturates; release through actual result/cleanup.','Actual admitted/queued/refused job/attempt identity and counter, not synthetic generic counter. Freeze exact corresponding source branch.')
fam('pending-capabilities','Run actual provider capability requests with actual service resolving slowly; reach pending capacity then release.','Real ProviderCapabilities pending set/backpressure/refusal and drain; no mocked generic limiter.')
fam('poll-cadence','Keep actual operation pending under identical accepted claim/deadline; observe repeated productive polls before completion.','Real sample/poll timestamps and corresponding persisted observations; deadline-clamped cadence, not single midpoint timeout.')
fam('runtime-freshness','Consume actual runtime-security observation with timestamps at age and future-skew boundaries under fixed observed now and identity.','observedMs<=nowMs+maximumFutureSkewMs && nowMs-observedMs<=maximumObservationAgeMs; readiness acceptance/rejection, no output-size quota.')
fam('diagnostic-truncation','Execute actual failing command/tar child with controlled stderr including multibyte text and astral characters.','Actual diagnostic text .slice(0,diagnosticCodeUnits) or bounded stderr retained bytes; code units and UTF-8 bytes are different. Preserve original failure.')
fam('execution-search-path','Execute actual runtime-security command under selected PATH joined by path.delimiter; use real permitted isolated executables.','Resolved actual executable/process environment; no credential values in evidence, no synthetic string-only assertion.')
fam('kubectl-executable','Execute actual capability operation using selected permitted kubectl binary in isolated authorized environment.','Actual exec path and command result; shell-free argv. Cluster proof remains blocked absent explicitly authorized cluster inputs.')
fam('lease-protocol','Execute actual lease read/patch through capability caller with selected coherent apiGroup/apiVersion.','Actual requested lease GVK and persisted owner/claim transfer; compatibility is protocol authority, not scalar threshold.')
fam('namespace-prefix-policy','Invoke actual fixture/exposure/runtime-security capability with namespace accepted by one full profile and denied by the other; preserve signed lease scope.','Exact namespace-policy rejection before cluster mutation; allowed prefix delimiter/source rule, not arbitrary substring matching.')
fam('registry-prefix-policy','Prepare actual immutable image manifest with allowed/disallowed repository prefix; keep digest/security/service requirements valid.','Manifest inspection/capability image acceptance or source-specific registry denial before apply; no invented mutable image.')
fam('secret-reference-policy','Prepare actual fixture referencing permitted versus denied Secret name with same manifest, never secret bytes.','Actual reference allow-list/entry-count rejection before credentials read/apply; no lexical settings-only assertion.')
fam('pvc-storage-policy','Inspect real valid fixture PVCs with class/default selection and exact Kubernetes quantities; exercise per-claim and aggregate total including replicas.','validatePersistentVolumeClaim/inspection result and exact PVC denial; total includes copies; class/default boolean is policy, not numeric cap.')
fam('service-account-subject','Construct actual production cluster options then capability authorization for same controllerNamespace with selected runner/credentialReader account.','runnerSubject or credentialReaderSubject=namespace/account and actual RBAC boundary; no fabricated identities or credential access.')
fam('host-suffix-policy','Invoke actual exposure with normalized allowed/denied host suffix under same authorized lease and owner.','Actual suffix predicate and denial before exposure effect; retain original release/replay identity.')
fam('manifest-parser-bounds','Pass actual YAML manifest through boundedManifestDocuments/flattenDocuments with controlled depth/nodes/aliases/visits/pending/resource count; other grammar and safety constraints admit it.','Exact parser/traversal/resource boundary and error, not settings constructor alone. Each bound needs its own shaped graph and counting convention.')
fam('manifest-output-multiplier','Execute actual fixture kubectl read/command path with output limit maximumManifestBytes*commandOutputManifestMultiplier.','Actual child maxBuffer/serialized output bound and safe product validation; multiplier is not itself a byte maximum.')
fam('retention-policy','Prepare actual fixture lease with requested retention near selected limit, preserving owner/deadline/release semantics.','Actual accepted lease retention or policy denial; integer seconds and real cleanup chronology, not wall-ms confusion.')
fam('report-details','Run registered actual report adapter yielding valid cases/findings; isolate total cases, total findings, and per-case findings.','REPORT_ADAPTER_CASE_LIMIT/FINDING_LIMIT/CASE_FINDING_LIMIT and original contract limits (5000/5000/100), no weakened schemas.')
fam('bounded-wire-bytes','Drive actual owning productive serialization/read/write with witness sized by its actual encoded/framed byte expression and all competing caps admitting it.','Measured exact encoded byte count and actual matching source rejection/positive; unframed input length is insufficient. Freeze exact encoding and diagnostic before harness.')
fam('phase-timeout-cleanup','Drive actual named execution/cleanup/drain/close/termination/acknowledgement phase with same original claim and state; completion straddles selected bound.','Actual corresponding timer, abort/escalation/error and persisted uncertainty; timeout is not cleanup success. Freeze phase and competing deadlines before harness.')
fam('replay-history-capacity','Use actual LocalWorkerRuntime accepted-attempt identity set at replayLimit then resubmit old/new attempts without erasing history.','acceptedAttemptIds.size>=replayLimit branch and actual replay/overflow behavior; original attempt IDs retained.')
fam('local-worker-drain-cancel','Start real local worker attempt; close using drain then cancellation stage and actual unresolved work.','settleWithin(initial,drainTimeoutMs) then settleWithin(cancelled,cancellationTimeoutMs); actual termination/error/uncertainty, no generic sleep proof.')
fam('preparation-projection-dormant','Validate actual preparation settings, inspect projection and search named productive consumers; for DORMANT assert bounded absence at current source, not invented execution effect.','Source-specific validation/projection and honest dormant obligation; EFFECT needs actual completion allowance consumer.')
fam('whole-owner-validation','Load each whole selected owner through real bundle/Ajv and semantic validator; remove required fields, add unknown/retired equal-valued input, and violate one actual relation while complete positive reaches same boundary.','Exact source schema/semantic diagnostic before listener/native/cluster effect; input generation identity and same-boundary positive.')
fam('whole-owner-effect-aggregate','Decompose owner aggregate into linked per-field productive families; execute whole coherent selected generation, not arbitrary union of isolated deltas.','All linked individual observers plus generation identity; aggregate ID is incomplete until finite member roster and executable collection are frozen.')
fam('delivery-generation','Materialize complete component authors plus Buster selected runtime and system entry through actual Helm/OCI/buildcontext/release callers; trace every generated byte.','Chart ConfigMap/mount/image payload and CI/release caller closure; missing/old/equal-valued authorities rejected. Existing delivery package must supply finite command/profile/source roster.')
fam('semantic-mutations','Mutate each actual consumer selection/predicate/formula in isolated future authorized tree, run same positive/negative productive case.','Original case kills corresponding mutant at intended boundary; structural/name checks cannot satisfy F-MUT. Finite real mutant roster remains needed.')
fam('later-c5-binding','Preserve C5 original generation before dispatch across publish/crash/parallel/recovery/cleanup/Eval as named in original case.','Original durable closure/receipts/claim/counter/uncertainty and fixed Eval generation; never merge this later obligation into C1 authorization.')
fam('descriptor-ceiling','Launch actual report/preparation native child through sandbox with selected maximumOpenFiles; real descriptor-opening task crosses that RLIMIT while other limits admit it.','Actual sandbox argv/RLIMIT and OS EMFILE or child outcome; descriptors are neither wire bytes nor task count.')
fam('preparation-client-pending','Hold actual preparation client operations pending, submit at maximumPendingAdmissions and one beyond, then release through real response.','Actual client pending admission/backpressure and error; use named client source branch, not active preparation slots.')
fam('archive-list-extract','Execute real tar listing/extraction under preparation-archive with controlled entry count, listing line bytes, and summed extracted bytes; keep archive/request caps admitting it.','Actual BUSTER_REMOTE_ARCHIVE_ENTRY_LIMIT or cited line/size boundary; tar stderr truncation preserves original failure, and entry count is not byte size.')
fam('historical-c0-observation','Preserve original recorded C0 command/raw observation and its exact bounded definition/source scope.','Historical passed result remains passed; no current source/runtime/global acceptance inferred.')
fam('qc-source-specific','Use actual QC field source, corresponding validator/formatter/history/storage/tar/secret representation path and original whole typed profile package.','Exact source-derived QC boundary; concrete fixture shape/encoding/oracle must be frozen, not replaced by generic maximum formula.')
def classify(c,sid):
 id=c['id'];field=sid or id;leaf=field.split('.')[-1].split('-')[-1]
 if c['phase']=='C0':return 'historical-c0-observation'
 if 'C5' in id:return 'later-c5-binding'
 if id=='CMP-C1-DELIVERY':return 'delivery-generation'
 if id=='CMP-C1-MUT':return 'semantic-mutations'
 if '-VAL-' in id:return 'whole-owner-validation'
 if id.startswith('QC-'):return 'qc-source-specific'
 if any(x in id for x in ['-PROJECTION','-DORMANT','completionPhaseAllowance','attemptEvidence','attemptLogBytes']):return 'preparation-projection-dormant'
 if '-EFFECT-' not in id:return 'preparation-projection-dormant'
 if len(c['settingIds'])!=1:return 'whole-owner-effect-aggregate'
 if leaf=='port':return 'listener-bind'
 for token,key in [('pipelinePreferenceSubject','preference-authorization'),('artifactRoot','artifact-root'),('studioPublicUrl','studio-url'),('controlUrl','control-upstream-url'),('dispatchTimeoutMs','worker-dispatch-abort'),('controlTimeoutMs','studio-upstream-abort'),('maximumActiveRequests','ingress-active-capacity'),('maximumProbeRequests','ingress-probe-reserve'),('maximumConnections','ingress-connections'),('requestTimeoutMs','ingress-request-timeout'),('shutdownTimeoutMs','ingress-shutdown')]:
  if token in field:return key
 if leaf in ['uid','gid']:return 'identity-uid-gid'
 if 'resourcePolicy' in field:return 'kernel-resource-policy'
 if leaf in ['minimumHeapMiB','heapFraction']:return 'heap-floor-fraction'
 if 'provider.' in field and leaf in ['minimumOpenFiles','artifactFileDescriptorReserve']:return 'provider-openfiles-derived'
 if 'reports.' in field:
  if leaf=='minimumOpenFiles':return 'report-minimum-openfiles'
  if leaf=='minimumCpuTimeMs':return 'report-cpu-derived'
  if leaf in ['runtimeMemoryReserveBytes','memoryBytes']:return 'report-memory-reserve'
  if leaf in ['maximumCases','maximumFindings','maximumCaseFindings']:return 'report-details'
 if leaf=='claimGraceMs':return 'claim-window-derived'
 if leaf=='queueTimeoutMs':return 'queue-deadline-derived'
 if leaf=='workerResultWrapperBytes':return 'result-wrapper-derived'
 if leaf in ['maximumHeaderBytes','sourceEntryReservationBytes']:return 'source-reservation-derived'
 if leaf=='maximumActivePreparations':return 'preparation-slots'
 if '-admission.maximum' in field:return 'admission-jobs-attempts'
 if leaf=='maximumPendingCapabilities':return 'pending-capabilities'
 if leaf in ['maximumObservationAgeMs','maximumFutureSkewMs']:return 'runtime-freshness'
 if leaf in ['diagnosticCodeUnits','maximumTarStderrBytes']:return 'diagnostic-truncation'
 if leaf=='executableSearchPath':return 'execution-search-path'
 if leaf=='kubectlExecutable':return 'kubectl-executable'
 if leaf in ['leaseApiGroup','leaseApiVersion']:return 'lease-protocol'
 if leaf=='allowedNamespacePrefixes':return 'namespace-prefix-policy'
 if leaf=='registryRepositoryPrefixes':return 'registry-prefix-policy'
 if leaf=='allowedSecretReferences':return 'secret-reference-policy'
 if leaf in ['allowedStorageClasses','allowDefaultStorageClass','maximumPersistentVolumeClaimBytes','maximumPersistentVolumeTotalBytes']:return 'pvc-storage-policy'
 if leaf in ['runnerServiceAccount','credentialReaderServiceAccount']:return 'service-account-subject'
 if leaf=='allowedHostSuffixes':return 'host-suffix-policy'
 if '.manifest.' in field or leaf=='maximumResources':return 'manifest-parser-bounds'
 if leaf=='commandOutputManifestMultiplier':return 'manifest-output-multiplier'
 if leaf=='maximumRetentionSeconds':return 'retention-policy'
 if leaf=='replayLimit':return 'replay-history-capacity'
 if 'localRuntime.' in field:return 'local-worker-drain-cancel'
 if any(x in leaf.lower() for x in ['poll','sampleinterval']):return 'poll-cadence'
 if '.stores.' in field or leaf in ['maximumSourceBytes','maximumSourceEntries','maximumRecords','maximumMetadataBytes','maximumOwnershipRecords','maximumOwnershipBytes','maximumJournalBytes']:return 'durable-store-admission'
 if leaf=='maximumOpenFiles':return 'descriptor-ceiling'
 if leaf=='maximumPendingAdmissions':return 'preparation-client-pending'
 if leaf in ['maximumArchiveEntries','maximumListingLineBytes','maximumExtractedBytes','maximumArchiveBytes']:return 'archive-list-extract'
 if any(x in leaf for x in ['Timeout','timeout','ExecutionMs','terminationGrace','acknowledgementPoll']):return 'phase-timeout-cleanup'
 return 'bounded-wire-bytes'
sourcefiles={};cases=[];witnesses={};settingBindings={}
for cid in scope['canonicalCaseIds']:
 c=next(x for x in matrix['cases'] if x['id']==cid);sids=c.get('settingIds',[]);sid=sids[0] if len(sids)==1 else None
 k=classify(c,sid);refs=[];consumers=[];oblig=[];bindings=[]
 for id in sids:
  r=rows.get(id,{});b=meta.get(id,{});reader=r.get('reader',{});chain=reader.get('productiveCallerChain',[])
  if isinstance(chain,str):chain=[chain]
  consumers.extend(chain)
  for e in reader.get('fieldAccessEvidence',[]):
   p=Path(e['path']);ln=e.get('line',0)
   if p.exists():
    digest=sha(p);sourcefiles[str(p)]=digest;lines=p.read_text(errors='replace').splitlines();text=lines[ln-1] if 0<ln<=len(lines) else None
    refs.append({'settingId':id,'path':str(p),'sha256':digest,'line':ln,'currentText':text,'inventoryExcerptMatches':text is not None and text.strip()==e.get('text','').strip(),'context':lines[max(0,ln-2):min(len(lines),ln+3)]})
  if b:
   bind={'settingId':id,'metadataRevision':b.get('fieldId'),'metadataSource':str(META),'activeA':b.get('activeA'),'activeB':b.get('activeB'),'pairDisposition':b.get('pairDisposition'),'coupledChanges':b.get('coupledChanges',[]),'activeSchema':b.get('activeSchemaBinding')}
   for side in ['activeA','activeB']:
    v=bind[side]
    if v and Path(v['path']).exists():v=dict(v);v['currentFileSha256']=sha(v['path']);v['fileIdentityMatches']=v['currentFileSha256']==v.get('sha256');bind[side]=v
   bindings.append(bind)
 if sid and cid in legacy:
  historical={'path':str(profiles),'sha256':sha(profiles),'id':cid,'fullOwnerSetA':list(legacy[cid].get('A',{})),'fullOwnerSetB':list(legacy[cid].get('B',{})),'qualification':'Existing complete legacy bundle definitions, not active typed target profiles; no isolated delta transplant and no runtime PASS.'}
 else:historical=None
 if c['phase']!='C0':
  if sid and (not bindings or not bindings[0].get('activeB')):oblig.append('Define/validate a materially different complete typed B owner/profile/entry generation. Active metadata has no distinct B; legacy full bundle B remains an explicitly historical candidate, not automatic target authority.')
  if not refs and sid:oblig.append('Trace exact real productive field access/consumer beyond canonical proposal; no source witness established by this assessment.')
  if k in ['whole-owner-validation','whole-owner-effect-aggregate','delivery-generation','semantic-mutations','qc-source-specific','preparation-projection-dormant']:oblig.append('Freeze finite member/source/profile/fixture/command and intended diagnostic roster for this aggregate or QC/projection obligation; retained original case body is not an executable completion claim.')
  if k in ['bounded-wire-bytes','durable-store-admission','phase-timeout-cleanup','manifest-parser-bounds']:oblig.append('Freeze source-specific encoding/count/graph/phase and competing limits; current source witnesses below are not sufficient to accept a generic midpoint witness.')
  oblig.append('Approved real consumer harness/argv, source+test+tool+image/config identities and positive collection/raw observations required at future execution; result remains not-run.')
 r={'id':cid,'originalLifecycle':{'phase':c['phase'],'result':c['result'],'specificationStatus':c.get('specificationStatus'),'reason':c.get('reason'),'lifecycle':c.get('lifecycle')},'requirementIds':c.get('requirementIds',[]),'settingIds':sids,'caseFamily':k,'scopeDisposition':'historic bounded C0 observation' if c['phase']=='C0' else ('later C5 required, excluded from C1 authorization' if 'C5' in cid else 'future implementation specification; not-run'),'actualConsumers':list(dict.fromkeys(consumers)),'sourceWitnesses':refs,'wholeTypedProfileBindings':bindings,'historicalWholeBundleCandidate':historical,'correctedProposedOracle':F[k],'incompleteObligations':oblig,'originalBodyRef':{'path':str(MP),'id':cid,'rawEvidencePath':c.get('rawEvidencePath'),'productiveCaller':c.get('productiveCaller')},'assessmentStatus':'preserved-historic-observation-not-reexecuted' if c['phase']=='C0' else 'source-grounded-proposal-not-runtime-accepted'}
 if sid and bindings:
  r['selectedValues']={x:(bindings[0].get('active'+x) or {}).get('exactValue') for x in ['A','B']}
  r['validationBoundary']=rows.get(sid,{}).get('validationErrorContract')
 if c.get('sourceBoundaryRefinement'):
  sr=c['sourceBoundaryRefinement'];r['refinementReview']={'originalBoundary':sr.get('exactProductiveBoundary'),'originalObserver':sr.get('observer'),'verdict':'A generic numeric witness is not an oracle unless this exact productive predicate/derived formula admits it. Use family operation and active whole-profile orientation above; intended positive and exact error must be collected.'}
 # Normalize repeated setting material to keep the 229-case ledger compact.
 for e in refs:
  wid=hashlib.sha256(json.dumps(e,sort_keys=True).encode()).hexdigest()[:20];witnesses[wid]=e
 for b in bindings:settingBindings[b['settingId']]=b
 r['sourceWitnessRefs']=[hashlib.sha256(json.dumps(e,sort_keys=True).encode()).hexdigest()[:20] for e in refs]
 r.pop('sourceWitnesses');r['wholeTypedProfileBindingRefs']=[b['settingId'] for b in bindings];r.pop('wholeTypedProfileBindings')
 r['correctedProposedOracleRef']='families.json#'+k;r.pop('correctedProposedOracle')
 if r.get('refinementReview'):r['refinementReview'].pop('originalObserver',None)
 if sid:
  row=rows.get(sid,{})
  r['supportedDomain']=row.get('supportedDomain');r['unit']=row.get('unit')
  if c['phase']!='C0':r['incompleteObligations'].append('B-null means missing complete pair, NOT no supported tunability. Build whole B from supported domain and exact validation relations above; validate all coupled fields and selected entry/schema. Do not narrow operator domain to historical deployed values.')
 cases.append(r)
counts=Counter((c['originalLifecycle']['phase'],c['originalLifecycle']['result'],str(c['originalLifecycle']['specificationStatus'])) for c in cases)
summary={'scopeCaseCount':len(cases),'exactOriginalSetConserved':set(x['id'] for x in cases)==set(scope['canonicalCaseIds']),'lifecyclePartition':[{'phase':a,'result':b,'specificationStatus':c,'count':n} for (a,b,c),n in counts.items()],'familyCounts':dict(Counter(c['caseFamily'] for c in cases)),'perFieldEffects':sum('-EFFECT-' in c['id'] and len(c['settingIds'])==1 for c in cases),'perFieldEffectsWithoutActiveTypedB':sum('-EFFECT-' in c['id'] and len(c['settingIds'])==1 and not any(settingBindings[b].get('activeB') for b in c['wholeTypedProfileBindingRefs']) for c in cases),'sourceWitnessFileCount':len(sourcefiles),'sourceWitnessCount':len(witnesses)}
(OUT/'cases.json').write_text(json.dumps({'qualification':'Independent expected-case source assessment, not target self-acceptance. Canonical lifecycle/results/requirements preserved; source families are proposed operations, not executed native effects.','summary':summary,'cases':cases},indent=2)+'\n')
(OUT/'source-witnesses.json').write_text(json.dumps(witnesses,indent=2)+'\n')
(OUT/'whole-profile-bindings.json').write_text(json.dumps(settingBindings,indent=2)+'\n')
(OUT/'families.json').write_text(json.dumps(F,indent=2)+'\n')
(OUT/'source-identities.json').write_text(json.dumps({'gitHead':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'inputs':{str(p):sha(p) for p in [MP,IP,META,profiles,BASE/'c1-package-draft/scope.json']},'productiveSourceDigests':sourcefiles},indent=2)+'\n')
print(json.dumps(summary,indent=2))
