import pathlib,json,hashlib,os,subprocess
root=pathlib.Path.cwd();here=pathlib.Path(__file__).resolve().parent;out=here/'process44-controls1';out.mkdir(exist_ok=False)
base=root/'skills/buster/engine/test-gates';testroot='tests/verification/contracts/';results=[]
cases=[('cleanupTimeoutMs','process-input-lifecycle.ts','this.#policy.cleanupTimeoutMs','1500','buster-process-input-policy.test.mjs','assertion'),('terminationGraceMs','process-input-lifecycle.ts','this.#policy.terminationGraceMs','250','buster-process-input-policy.test.mjs','assertion'),('acknowledgementPollMs','process-input-lifecycle.ts','this.#policy.acknowledgementPollMs','10','buster-process-input-policy.test.mjs','assertion'),('report-forwarding','runner.ts','executionPolicy.processInput','undefined','buster-report-runner-policy.test.mjs','missing-policy'),('kubernetes-forwarding','capability-runtime.ts','workspaceRoot: jobRoot, processInputPolicy,','workspaceRoot: jobRoot, processInputPolicy: undefined,','buster-process-input-callers.test.mjs','missing-policy'),('tailscale-forwarding','capability-runtime.ts',"'BUSTER_TAILSCALE_EXPOSURE_CONFIG_REQUIRED'), processInputPolicy }","'BUSTER_TAILSCALE_EXPOSURE_CONFIG_REQUIRED'), processInputPolicy: undefined }",'buster-process-input-callers.test.mjs','missing-policy')]
for name,file,needle,replacement,test,kind in cases:
 d=out/name;d.mkdir();f=base/file;raw=f.read_text();assert raw.count(needle)==1,name
 (d/'before.ts').write_text(raw);(d/'mutant.ts').write_text(raw.replace(needle,replacement))
 spec={'file':str(f),'sha256':hashlib.sha256(raw.encode()).hexdigest(),'from':needle,'to':replacement,'log':str(d/'applied.jsonl')};(d/'spec.json').write_text(json.dumps(spec))
 env=dict(os.environ,LC_MUTANT_SPEC=str(d/'spec.json'));env['NODE_OPTIONS']+=' --import='+str(root/'docs/review/evidence/config-worker-local-runtime-20260921/mutant-loader.mjs')
 cmd=['node','--test','--test-reporter=tap','--test-concurrency=1',testroot+test];r=subprocess.run(cmd,env=env,capture_output=True,text=True,timeout=180);log=r.stdout+r.stderr;(d/'output.txt').write_text(log)
 marker='ERR_ASSERTION' if kind=='assertion' else 'SWARM_CONFIG_BUSTER_PROCESS_INPUT_INVALID'
 detected=r.returncode!=0 and marker in log and 'not ok' in log and (d/'applied.jsonl').is_file()
 results.append({'name':name,'command':cmd,'exitCode':r.returncode,'kind':kind,'expectedMarker':marker,'candidateDetection':detected,'requiresNamedOracleReview':True});(out/'results.json').write_text(json.dumps(results,indent=2));print(name+' '+str(detected),flush=True)
 if not detected:raise SystemExit(1)
prepared=here/'process44-retention-controls-prepared';plan=json.loads((prepared/'plan.json').read_text())
for case in plan['cases']:
 name=case['name'];d=out/name;d.mkdir();spec=json.loads(pathlib.Path(case['spec']).read_text());spec['applicationLog']=str(d/'applied.jsonl');(d/'spec.json').write_text(json.dumps(spec))
 env=dict(os.environ,PROCESS_RETENTION_CONTROL_SPEC=str(d/'spec.json'));env['NODE_OPTIONS']+=' --import='+str(prepared/'substitute-lifecycle.mjs')
 cmd=case['command'];r=subprocess.run(cmd,env=env,capture_output=True,text=True,timeout=180);log=r.stdout+r.stderr;(d/'output.txt').write_text(log)
 detected=r.returncode!=0 and 'ERR_ASSERTION' in log and 'not ok' in log and (d/'applied.jsonl').is_file()
 results.append({'name':name,'command':cmd,'exitCode':r.returncode,'candidateDetection':detected,'requiredManualFailure':case['requiredManualFailure']});(out/'results.json').write_text(json.dumps(results,indent=2));print(name+' '+str(detected),flush=True)
 if not detected:raise SystemExit(1)
