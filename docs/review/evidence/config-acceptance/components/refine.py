import json,pathlib
O=pathlib.Path('docs/review/evidence/config-acceptance/components');d=json.loads((O/'semantic-fragment.json').read_text())
# Exact semantic relation membership checked from productive validators.
checks=[]
def check(owner, fields, error, expression, source):checks.append((owner,set(fields.split()),error,expression,source))
S='skills/common/plugin-runtime/foundation/config/swarm.ts';E='skills/common/plugin-runtime/foundation/config/buster-execution.ts';K='skills/common/plugin-runtime/foundation/config/buster-cluster-invokers.ts'
check('prism-control','artifactRoot','SWARM_CONFIG_INVALID:control.artifactRoot must be a normalized absolute non-root path','path.resolve(value)===value && value!=="/"',S)
check('prism-control','studioPublicUrl','SWARM_CONFIG_INVALID:control.studioPublicUrl must be an absolute HTTP(S) URL','new URL(value); HTTP(S)/no credential schema pattern also required',S)
check('prism-control','pipelinePreferenceSubject','invalid platform pipeline preference subject','authorizePipelinePreferenceSubject(undefined, value??undefined); schema ^user-[a-f0-9]{24}$ or null','skills/prism/control/pipeline-preference-subject.ts')
check('prism-studio','controlUrl','SWARM_CONFIG_INVALID:studio.controlUrl must be an absolute HTTP(S) origin','http/https, no username/password, path=/, no query/hash/control/whitespace',S)
check('prism-worker','ingress.maximumActiveRequests ingress.maximumProbeRequests ingress.maximumConnections','SWARM_CONFIG_WORKER_CONNECTION_BUDGET_INVALID','active+probe <= connections',S)
check('prism-worker','ingress.shutdownTimeoutMs supervisor.closeTimeoutMs supervisor.drainTimeoutMs','SWARM_CONFIG_WORKER_SHUTDOWN_BUDGET_INVALID','shutdown > close + drain',S)
check('buster-engine','preparation.maximumRequestBytes preparation.maximumArchiveBytes preparation.maximumHeaderBytes preparation.maximumInputBytes preparation.maximumOutputBytes preparation.maximumResultBytes','SWARM_CONFIG_BUSTER_BUFFER_LIMIT_INVALID','each <= 2147483647',S)
check('buster-engine','preparation.maximumArchiveBytes preparation.maximumRequestBytes preparation.maximumHeaderBytes preparation.maximumMetadataBytes preparation.maximumInputBytes preparation.maximumJournalBytes preparation.maximumResultBytes preparation.maximumOutputBytes','SWARM_CONFIG_BUSTER_STORAGE_BUDGET_INVALID','archive<=request; header<metadata; input<=journal; result+4*input<=output; header+4*input<=result; output<=journal',S)
check('buster-engine','preparation.maximumRequestBytes preparation.maximumArchiveBytes preparation.maximumExtractedBytes preparation.maximumHeaderBytes preparation.maximumArchiveEntries preparation.sourceEntryReservationBytes preparation.maximumSourceBytes preparation.maximumSourceEntries','SWARM_CONFIG_BUSTER_SOURCE_RESERVATION_INVALID','safe request+archive+extracted<=source and safe request+archive+extracted+header+(archiveEntries+7)*reservation<=source; archiveEntries+7<=sourceEntries',S)
check('buster-engine','preparation.closeTimeoutMs preparation.drainTimeoutMs','SWARM_CONFIG_BUSTER_CLOSE_BUDGET_INVALID','close>drain',S)
check('buster-engine','execution.provider.terminationGraceMs execution.provider.terminationTimeoutMs','SWARM_CONFIG_BUSTER_PROVIDER_TERMINATION_ORDER_INVALID','grace<terminationTimeout',E)
check('buster-engine','execution.provider.maximumResultBytes execution.reports.maximumAggregateResultBytes execution.provider.workerResultWrapperBytes','SWARM_CONFIG_BUSTER_EXECUTION_RESULT_SUM_INVALID','providerResult+reportAggregate+wrapper <= MAX_SAFE_INTEGER',E)
check('buster-engine','execution.reports.runtimeMemoryReserveBytes execution.reports.maximumSourceBytes execution.reports.maximumAggregateResultBytes execution.reports.memoryBytes','SWARM_CONFIG_BUSTER_EXECUTION_REPORT_MEMORY_INVALID','memory >= reserve + 3*source + 2*aggregate',E)
check('buster-engine','execution.reports.minimumOpenFiles execution.reports.maximumOpenFiles','SWARM_CONFIG_BUSTER_REPORT_DESCRIPTOR_RANGE_INVALID','minimumOpenFiles<=maximumOpenFiles',E)
check('buster-engine','execution.stores.attempts.maximumEvidenceObjectBytes execution.stores.attempts.maximumEvidenceBytes','SWARM_CONFIG_BUSTER_EXECUTION_EVIDENCE_POOL_INVALID','objectBytes<=poolBytes',E)
check('buster-engine','execution.processInput.terminationGraceMs execution.processInput.cleanupTimeoutMs execution.processInput.acknowledgementPollMs','SWARM_CONFIG_BUSTER_PROCESS_INPUT_TIMING_INVALID','terminationGrace<cleanup && acknowledgementPoll<=cleanup',E)
check('buster-engine','clusterInvokers.runtimeSecurity.maximumObservationAgeMs clusterInvokers.runtimeSecurity.pollIntervalMs clusterInvokers.kubernetesFixture.maximumPersistentVolumeTotalBytes clusterInvokers.kubernetesFixture.maximumPersistentVolumeClaimBytes clusterInvokers.kubernetesFixture.maximumManifestBytes clusterInvokers.kubernetesFixture.commandOutputManifestMultiplier clusterInvokers.tailscaleExposure.pollIntervalMs clusterInvokers.tailscaleExposure.maximumExecutionMs clusterInvokers.tailscaleExposure.allowedHostSuffixes','SWARM_CONFIG_BUSTER_CLUSTER_COHERENCE_INVALID','age>=poll; totalPVC>=perPVC; safe manifestBytes*multiplier; tailscalePoll<=execution; suffix must not include ..',K)
for r in d['rows']:
 owner=r['owner'];p=r['source']['field'].removeprefix('/settings/').replace('/','.');k=p.split('.')[-1]; contract=r['supportedDomain']
 r['targetAuthorRef']={'path':'config/components/'+owner+'.config.json','entry':'config/pipeline.config.json components.'+owner,'status':'prospective root proposal; not implemented','projectionPaths':[r['source']['path']],'rootJustification':'Existing canonical Helm .Files.Get author location is charts/kubeclaw/files/config; proposed config/ separates authored values from generated chart/image input. C1 must implement real explicit materialization and CI/buildcontext/release callers together; moving file alone breaks consumers. No second editable chart copy.'}
 if r['class']=='protocol-invariant':
  mode='R';reason='Version/owner identity is stable contract, not adjustable module setting.'
 elif owner=='prism-control':
  mode='R' if k=='pipelinePreferenceSubject' else 'M' if k=='dispatchTimeoutMs' else 'S';reason='Preference authorization is run-stable; dispatch deadline can bind at eligible attempt/module start; listener/storage/public URL compose service once.'
 elif owner=='prism-studio':mode='S';reason='Studio listener/upstream proxy compose service, not pipeline module; change needs fresh validated service instance.'
 elif owner=='prism-worker':mode='S';reason='Ingress limits and native supervisor ownership/poll/drain/journal capture at supervisor startup; do not hotreload existing owner or journal.'
 elif owner=='prism-execution':mode='M';reason='Attempt execution/resource/result policy can bind next eligible Prism order/attempt; started work and cumulative budgets remain captured.'
 elif owner=='worker-core':mode='R';reason='Local runtime replay identity capacity and shutdown drain/cancellation apply to captured runtime lifetime; cannot reset active run replay/accepted identities.'
 elif p.startswith('clusterInvokers'):
  mode='R' if k.startswith('allowed') or k in ['registryRepositoryPrefixes','runnerServiceAccount','credentialReaderServiceAccount','allowDefaultStorageClass','leaseApiGroup','leaseApiVersion','kubectlExecutable','executableSearchPath'] else 'M';reason='Namespace/secret/storage/registry/trust/lease/executable capability authority is stable run policy; numeric bounded invoker/manifest tuning binds next eligible module without changing existing grants.'
 elif p.startswith('admission.') or p.startswith('execution.stores.') or p in ['preparation.maximumActivePreparations','preparation.maximumPendingAdmissions']:
  mode='S';reason='Service-level admission/store/global preparation capacity constructed once; changing generation must not reset durable records, quarantine or active admission.'
 else:mode='M';reason='Buster bounded preparation/dependency/provider/report/observation/input policy can bind next eligible plan module; started plan and granted capabilities/claim/deadline values remain unchanged.'
 r['activationScope']={'current':'S: fully validated startup snapshot; no durable next-module selector','targetClass':mode,'targetReason':reason,'allowedTransition':'R remains run-bound; S requires validated new service/supervisor generation with existing durable-state reconciliation; M selects before dispatch and persists immutable full closure, never reloads started module','eval':'Fixed generation always; no implemented Eval runner inferred.'}
 v=r['validationErrorContract']
 if isinstance(v,dict):
  v['relations']=[{'error':err,'predicate':expr,'source':src} for o,fs,err,expr,src in checks if o==owner and p in fs]
  v['semanticValidation']='No additional leaf relation found beyond resolved strict schema and listed applicable predicates.' if not v['relations'] else 'Listed exact cross-field predicates execute before loadSwarmSettings returns.'
 # Count executable field uses rather than type declarations as proof. Reader excerpts remain corroboration only.
 hits=r['reader'].get('fieldAccessEvidence',[])
 productive=[h for h in hits if not h['text'].startswith(('readonly ','//','*','export interface','interface '))]
 r['reader']['fieldAccessEvidence']=productive
 r['reader']['traceStatus']='productive-chain-correlated; independent semantic review pending'
 r['reader']['proofLimit']='Access excerpts belong to manually identified productive construction/call chain; lexical name similarity alone does not establish every downstream branch. Source-traced status does not mean runtime effect tested.'
 r['status']='review-pending'
 if r['class']=='protocol-invariant':r['profileEvalSuitability']='Not tunable; exact owner/version protocol const required in every fixed Eval generation.'
 elif mode=='R':r['profileEvalSuitability']='Stable authorization/replay/run contract. Separate complete generations may compare capabilities only in distinct new runs; not next-module hot tuning, and not a supported model parameter.'
 elif mode=='S':r['profileEvalSuitability']='Service/deployment capacity/endpoint setting; alternate validated isolated service instances can be compared, not arbitrary agent/model Eval knob.'
 else:r['profileEvalSuitability']='Bounded execution tuning suitable for fixed-generation component experiment using same task data and related valid constraints; next eligible module activation requires C5 binding.'
 r['unit']= {'tasks':'Linux task count (threads included)','port':'TCP listener port','uid':'POSIX user ID','gid':'POSIX group ID','maximumOpenFiles':'file descriptor count','minimumOpenFiles':'file descriptor count','artifactFileDescriptorReserve':'file descriptor count','maximumRecords':'record count','maximumArchiveEntries':'tar archive entry count','maximumSourceEntries':'source inode/entry count','sourceEntryReservationBytes':'bytes per source entry','maximumPendingCapabilities':'capability request count','maximumConnections':'connection count','maximumActiveRequests':'active request count','maximumProbeRequests':'probe request count','replayLimit':'accepted attempt identity count'}.get(k,r['unit'])
(O/'semantic-fragment.json').write_text(json.dumps(d,indent=2)+'\n')
print('Refined',len(d['rows']),'rows with field-specific S/M/R activation and exact applicable semantic relations; independent review pending.')
