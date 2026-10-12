import pathlib,json,hashlib,os,subprocess
root=pathlib.Path.cwd();here=pathlib.Path(__file__).resolve().parent;out=here/'report41-controls1';out.mkdir(exist_ok=False)
f=root/'skills/buster/engine/test-gates/report-adapter-runtime.ts';raw=f.read_text();results=[]
cases=[('minimumHeapMiB','this.#policy.minimumHeapMiB','16','buster-report-runner-policy.test.mjs'),('heapFraction','this.#policy.heapFraction','0.7','buster-report-runner-policy.test.mjs'),('runtimeMemoryReserveBytes','policy.runtimeMemoryReserveBytes','67108864','buster-report-runtime-policy.test.mjs'),('minimumOpenFiles','policy.minimumOpenFiles','16','buster-report-runtime-policy.test.mjs')]
for name,needle,replacement,test in cases:
 assert raw.count(needle)==1,name
 d=out/name;d.mkdir();mutant=raw.replace(needle,replacement);(d/'before.ts').write_text(raw);(d/'mutant.ts').write_text(mutant)
 spec={'file':str(f),'sha256':hashlib.sha256(raw.encode()).hexdigest(),'from':needle,'to':replacement,'log':str(d/'applied.jsonl')};(d/'spec.json').write_text(json.dumps(spec))
 env=dict(os.environ,LC_MUTANT_SPEC=str(d/'spec.json'));env['NODE_OPTIONS']+=' --import='+str(root/'docs/review/evidence/config-worker-local-runtime-20260921/mutant-loader.mjs')
 cmd=['node','--test','tests/verification/contracts/'+test];r=subprocess.run(cmd,env=env,capture_output=True,text=True,timeout=180);log=r.stdout+r.stderr;(d/'output.txt').write_text(log)
 detected=r.returncode!=0 and 'AssertionError' in log and (d/'applied.jsonl').is_file()
 results.append({'name':name,'command':cmd,'exitCode':r.returncode,'candidateAssertionDetection':detected,'requiresManualOracleReview':True});(out/'results.json').write_text(json.dumps(results,indent=2));print(name+' '+str(detected),flush=True)
raise SystemExit(0 if all(r['candidateAssertionDetection'] for r in results) else 1)
