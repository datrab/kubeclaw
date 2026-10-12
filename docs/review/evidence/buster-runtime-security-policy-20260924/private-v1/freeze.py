from pathlib import Path
import json,hashlib,datetime
r=Path(__file__).resolve().parent;repo=Path.cwd();files=r/'files';before=r/'before'
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
inv='skills/buster/engine/test-gates/kubernetes-runtime-security.ts';opt='skills/buster/engine/test-gates/production-cluster-options.ts';validator='skills/common/plugin-runtime/foundation/config/buster-cluster-invokers.ts'
specs=[]
def control(name,p,old,new,oracle):
 assert (files/p).read_text().count(old)==1,(name,p)
 specs.append({'name':name,'file':p,'sha256':digest(files/p),'old':old,'new':new,'requiredFailureOracle':oracle,'status':'not executed'})
for field,value in [('maximumExecutionMs','300000'),('maximumOutputBytes','16777216'),('maximumObservationAgeMs','10000')]:
 control('restore-'+field,opt,'...policy.runtimeSecurity, kubectlExecutable:',f'...policy.runtimeSecurity, {field}: {value}, kubectlExecutable:',f'real {field} low profile unexpectedly succeeds; counterpart high profile remains valid')
control('restore-poll1000',inv,'Math.min(this.#policy.pollIntervalMs, Math.max(1, deadline - Date.now()))','Math.min(1000, Math.max(1, deadline - Date.now()))','1200 ms real polling profile is not respected; actual successive command separation below configured interval')
control('restore-future5000',inv,'nowMs + maximumFutureSkewMs','nowMs + 5000','high future-skew profile should admit otherwise valid +7500 ms observation; instead times out')
control('restore-diagnostic1024',inv,'.slice(0, policy.diagnosticCodeUnits)', '.slice(0, 1024)','both exact diagnostic lengths mismatch original stderr')
control('restore-child-path',inv,'PATH: policy.executableSearchPath.join(path.delimiter)',"PATH: '/usr/local/bin:/usr/bin:/bin'",'actual helper selection in private authored PATH fails positive profile; actual observed PATH differs')
control('restore-abort-before-output-cause',inv,"finish(new Error('KUBERNETES_RUNTIME_SECURITY_OUTPUT_LIMIT_EXCEEDED')); controller.abort();","controller.abort(); finish(new Error('KUBERNETES_RUNTIME_SECURITY_OUTPUT_LIMIT_EXCEEDED'));",'combined byte-limit negative must report OUTPUT_LIMIT exactly, not TIMEOUT')
initial=json.loads((repo/'docs/review/evidence/buster-runtime-security-policy-20260924/ownership.json').read_text());defaults={x['field']:x['authoredInitialValue'] for x in initial['fields']}
anchor="  validateComponentSettings('buster-runtime-security', value, 'KUBERNETES_RUNTIME_SECURITY_CONFIG_INVALID');"
control('restore-missing-policy-defaults',validator,anchor,'  value = { ...'+json.dumps(defaults)+', ...(value as Record<string, unknown>) };\n'+anchor,'each omitted direct policy field must reject CONFIG_INVALID before filesystem access; fallback reaches nonexistent path instead')
(r/'mutation-specs.json').write_text(json.dumps({'executionStatus':'not executed','controls':specs},indent=2)+'\n')
entries=[];drift=[]
for p in sorted(files.rglob('*')):
 if not p.is_file():continue
 rel=p.relative_to(files).as_posix();b=before/rel;live=repo/rel
 if live.exists() and not b.exists():raise RuntimeError('Missing baseline '+rel)
 expected=digest(b) if b.exists() else None
 if live.exists() and digest(live)!=expected:drift.append(rel)
 entries.append({'path':rel,'beforeSha256':expected,'afterSha256':digest(p),'new':not b.exists()})
(r/'manifest.json').write_text(json.dumps({'status':'frozen private candidate; unexecuted; integration forbidden until review and root coordination','createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'files':entries,'liveBaselineDrift':drift,'sourceRules':'Only files/ is the proposed integration set; before/ preserves exact read baselines. No live source was changed. Root owns verification and integration.'},indent=2)+'\n')
print(json.dumps({'files':len(entries),'baselineDrift':drift,'manifestSha256':digest(r/'manifest.json')}))
