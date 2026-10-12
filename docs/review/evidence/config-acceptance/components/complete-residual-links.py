import json,pathlib,hashlib,re
O=pathlib.Path('docs/review/evidence/config-acceptance/components');f=O/'residual-fragment.json';r=json.loads(f.read_text());B='skills/buster/engine/test-gates/';P='skills/prism/';C='skills/common/plugin-runtime/foundation/observability/'
for d in r['parameterDefaultCandidates']:
 key=(pathlib.Path(d['file']).name,d['owner'],d['parameter'])
 rules={
 ('attempt-executor.ts','constructor','message'):('protocol-invariant','AttemptFault message defaults to exact error code, not execution policy.'),
 ('native-attempt-journal.ts','withAttempt','validateNewAdmission'):('task-data','New native admission supplies callback via executeNativeWorkerAttempt; recovery/cleanup paths deliberately omit to preserve accepted historical claim/envelope. No current CONFIG refill of history.'),
 ('native-process-launches.ts','spawn','controlPipe'):('generated-binding','IPC fourth pipe derived from role-owned control presence, not adjustable resource budget; no control implies three stdio pipes.'),
 ('native-resource-scope.ts','recoverEmptyReservation','aggregate'):('generated-binding','Actual NativeWorkerOwnership.#recover supplies record.topology.kind===aggregate.v1; omission false unused by productive owner recovery. Legacy leaf cannot gain aggregate launch authority.'),
 ('native-resource-scope.ts','reopen','aggregate'):('generated-binding','Actual owner supplies persisted topology discriminator, not current policy; omitted false unused at productive owner recovery.'),
 ('native-worker-ownership.ts','constructor','settled'):('task-data','Callback notification supplied by supervisor allocation/release-capacity composition; no-op is mechanism if absent, not numeric limit.'),
 ('native-worker-ownership.ts','launch','controlPipe'):('generated-binding','NativeWorkerProcess passes control!==undefined; trusted helper launches derive pipe ownership from role callback.'),
 ('ownership-capacity.ts','ownershipTerminalCapacityBytes','maximumBytes'):('operator-setting','Current exported helper fallback MAX_SAFE_INTEGER is latent unbounded quota; both production FileWorkerOwnershipStore callers pass this.#maximumBytes. Remove optional default in approved C3; aliases existing ownership byte author, never new quota author.'),
 ('ownership-store.ts','transition','options'):('task-data','Omitted {} means existing-record transition, while admission transitions explicitly request terminal capacity check; no limit synthesized.'),
 ('phase-deadline.ts','run','maintenance'):('protocol-invariant','Ordinary phase is claim-bound; cleanup explicitly maintenance=true only bounded neutralization. No configured retry/claim refresh.'),
 ('resource-accounting.ts','invalid','message'):('protocol-invariant','Failure diagnostic text constant for missing/invalid sensor, not fabricated zero or tunable policy.'),
 ('resource-accounting.ts','assessWorkerResources','previous'):('task-data','Empty previous means first observation has no prior monotonic baseline; missing measurements still invalid/unavailable. Later actual measurement supplies previous; not zero resource budget replacement.')}
 d['class'],d['disposition']=rules[key];d['actualCallerEvidence']=['skills/worker/core/worker/ownership-store.ts','skills/worker/core/worker/native-worker-ownership.ts','skills/worker/core/worker/native-attempt-executor.ts','skills/worker/core/worker/native-attempt-recovery.ts','skills/worker/core/worker/native-cleanup-reconciliation.ts']
r['gaps']=[g for g in r['gaps'] if g['id']!='CMP-WCORE-AST-DEFAULTS']
r['defaultDispositionSummary']='All12 AST default parameter candidates manually classified with productive caller reason. Latent ownershipTerminalCapacityBytes unbounded default remains explicit removal/alias obligation, not silently excluded.'
changes={}
for u in r['caseRefinements']:
 id=u['settingIds'][0];field=id.split('-',3)[-1];k=id.rsplit('.',1)[-1] if '.' in id else id.split('-')[-1]
 owner=id.split('-')[1]+'-'+id.split('-')[2] if id.startswith('CMP-prism') else None
 target=u['exactProductiveBoundary'];token=k
 if id=='CMP-prism-control-dispatchTimeoutMs':token='nativeWorkerDispatchTimeoutMs'
 if id=='CMP-prism-studio-controlUrl':token='options.control'
 if id.startswith('CMP-prism-worker-ingress.') and k!='maximumInputBytes':
  target=P+'server/worker-lifecycle.ts'
  if k=='shutdownTimeoutMs':token='timeoutMs';u['productiveAuthorProjection']='worker.ts serve -> server.shutdown(config.shutdownTimeoutMs) -> WorkerLifecycle.shutdown(timeoutMs)'
 if id.startswith('CMP-prism-execution-resourcePolicy.'):
  target=P+'config/resource-policy.ts';token=k
  u['observer']={'taskInputs':{'newAcceptedEnvelopeBudget':'aligned between policy A/B; same task instruction/input bytes and generated claim/grant/profile closure','recovered':False},'action':'Call actual new-work prismAttemptResourceLimits via nativePrismExecution for same requested midpoint budget; lower policy rejects PRISM_NATIVE_BUDGET_NOT_ACCEPTED:'+{'cpuTimeMs':'cpuTimeMs','memoryBytes':'maximumMemoryBytes','tasks':'maximumTasks'}[k]+' while upper admits. Existing recovered envelope uses original requested value even if new policy lower; verify journal recovery and actual kernel assignment separately. Kernel probes require real host capacity, not fabricated local quotas.','boundary':target+' requested state/budget.limit>configured maximum, followed by executeNativeWorkerAttempt accepted exact budget and kernel process.'}
 m={'maximumExtractedBytes':'preparation-archive.ts','maximumHeaderBytes':'preparation-reservations.ts','maximumSourceBytes':'preparation-ledger.ts','maximumOwnershipBytes':'preparation-supervisor.ts','maximumJournalBytes':'preparation-supervisor.ts','maximumResultBytes':'preparation-supervisor.ts','drainTimeoutMs':'preparation-supervisor.ts'}
 if id.startswith('CMP-buster-engine-preparation.') and k in m:target=B+m[k]
 if id=='CMP-buster-engine-execution.provider.maximumResultBytes':
  target=B+'runner-provider-operation.ts';token='providerResultLimit';u['productiveAuthorProjection']='TestPlanRunner.#options.executionPolicy.provider.maximumResultBytes -> runner.ts providerResultLimit -> runner-provider-operation.validateBusterProviderResult -> provider-result-validation'
 m={'maximumEvidenceObjects':'attempt-evidence.ts','maximumEvidenceBytes':'attempt-evidence.ts','maximumEvidenceObjectBytes':'attempt-evidence.ts','maximumResults':'attempt-results.ts','maximumClosures':'attempt-completeness.ts'}
 if id.startswith('CMP-buster-engine-execution.stores.attempts.') and k in m:target=C+m[k]
 text=pathlib.Path(target).read_text();u['exactProductiveBoundary']=target;u['sourceDigest']=hashlib.sha256(pathlib.Path(target).read_bytes()).hexdigest();u['sourceFieldExpressions']=[{'line':n,'text':line.strip()} for n,line in enumerate(text.splitlines(),1) if token in line];u['possibleBoundaryDiagnostics']=list(dict.fromkeys(re.findall(r"['\"]((?:[A-Z]+_){2,}[A-Z0-9_:]+)['\"]",text)));u['fieldAlias']=token if token!=k else None
 changes[target]=text
for p,text in changes.items():
 if not any(s['path']==p for s in r['sources']):r['sources'].append({'path':p,'sha256':hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest(),'disposition':'actual per-field component behavior boundary, not merely loader/interface','settingIds':[u['settingIds'][0] for u in r['caseRefinements'] if u['exactProductiveBoundary']==p]})
with (O/'worker-residual-source-read.log').open('a') as out:
 for p,text in sorted(changes.items()):out.write('\nCASE BOUNDARY SOURCE '+p+' SHA256 '+hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()+'\n'+''.join(str(n)+': '+line+'\n' for n,line in enumerate(text.splitlines(),1)))
r['proofLimits']={'schemaFieldDispositions':'565 expanded logical fields are source-disposition obligations, not all individually closed primary rows','apiDispositions':'37 AST interfaces/173 members are complete declaration roster, not semantic proof of each composition option','caseRefinements':'148 actual behavior boundaries and direct field/alias expressions, positive-loader complete profiles, but actual EFFECT harness execution remains not-run','main160Rows':'unchanged checkpoint; reviewed material corrections only in residual until parent consolidation'}
f.write_text(json.dumps(r,indent=2)+'\n');print('12 defaults manually disposed; real boundary links148; remaining no-expression cases',len([u for u in r['caseRefinements'] if not u['sourceFieldExpressions']]))
