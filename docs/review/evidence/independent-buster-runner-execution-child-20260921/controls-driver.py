import pathlib,json,subprocess,os,hashlib
root=pathlib.Path.cwd();here=pathlib.Path(__file__).resolve().parent;out=here/'semantic-controls1';out.mkdir(exist_ok=False)
results=[]
def run(name,cmd,env,needle=None):
 r=subprocess.run(cmd,env=env,capture_output=True,text=True,timeout=900);log=r.stdout+r.stderr;(out/(name+'.txt')).write_text(log)
 ok=(r.returncode==0) if needle is None else (r.returncode!=0 and 'AssertionError' in log and needle in log)
 results.append({'name':name,'command':cmd,'exitCode':r.returncode,'detected':ok});(out/'results.json').write_text(json.dumps(results,indent=2));print(name+' '+str(ok),flush=True)
env=dict(os.environ)
run('child-two',['python3','docs/review/evidence/provider-child-session-simplicity-20260921/run-observation-controls.py',str(out/'child')],env)
run('boundary',['node',str(here/'boundary-control.mjs')],env)
f=root/'skills/buster/engine/test-gates/provider-process-session.ts';raw=f.read_text();needle='observation.processSampleIntervalMs);';assert raw.count(needle)==1
spec={'file':str(f),'sha256':hashlib.sha256(raw.encode()).hexdigest(),'from':needle,'to':'60000);','log':str(out/'sampling-applied.jsonl')};(out/'sampling-spec.json').write_text(json.dumps(spec));(out/'sampling-before.ts').write_text(raw);(out/'sampling-mutant.ts').write_text(raw.replace(needle,'60000);'))
sample=dict(env,LC_MUTANT_SPEC=str(out/'sampling-spec.json'));sample['NODE_OPTIONS']+=' --import='+str(root/'docs/review/evidence/config-worker-local-runtime-20260921/mutant-loader.mjs')
run('sampling',['node','--test','tests/verification/contracts/buster-process-sampling.test.mjs'],sample,'actual scans=0')
f=root/'skills/buster/engine/test-gates/provider-child.mjs';raw=f.read_text();needle="    process.on('SIGTERM', () => this.#controller.abort(new Error('TEST_PROVIDER_TERMINATED')));";assert raw.count(needle)==1
(out/'child-before.mjs').write_text(raw);(out/'child-mutant.mjs').write_text(raw.replace(needle,''))
pc=dict(env,PC_CONTROL_CHILD=str(out/'child-mutant.mjs'),PC_CONTROL_LOG=str(out/'pc-applied.jsonl'));pc['NODE_OPTIONS']+=' --import='+str(root/'docs/review/evidence/buster-provider-cancellation-20260921/child-path-control.mjs')
run('removed-term',['node','tests/verification/contracts/check-pipeline-test-plan-runner.mts'],pc,'cancellation reaches the provider context signal before forced termination')
assert (out/'sampling-applied.jsonl').is_file() and (out/'pc-applied.jsonl').is_file()
raise SystemExit(0 if all(r['detected'] for r in results) else 1)
