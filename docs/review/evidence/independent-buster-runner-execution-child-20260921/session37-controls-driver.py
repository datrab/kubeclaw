import pathlib,json,hashlib,os,subprocess
root=pathlib.Path.cwd();here=pathlib.Path(__file__).resolve().parent;out=here/'session37-controls1';out.mkdir(exist_ok=False)
f=root/'skills/buster/engine/test-gates/provider-process-session.ts';raw=f.read_text()
a=raw.index("    this.#child.stdout.on('data',");b=raw.index('    this.#lines = readline',a);block=raw[a:b]
old=raw[:a]+raw[b:];mark="    this.#child.stderr.on('data',";assert old.count(mark)==1;old=old.replace(mark,block+mark)
checks="    if (this.#protocolFailure) return Promise.reject(this.#protocolFailure);";assert raw.count(checks)==2
cases=[('old-protocol-order',old,'provider-loader-ownership.test.mjs'),('lost-idle-failure',raw.replace(checks,''),'provider-loader-ownership.test.mjs')]
needle="setTimeout(() => signal('SIGKILL'), this.#policy.provider.terminationGraceMs)";assert raw.count(needle)==1
for value in [500,50]:cases.append(('force-grace-'+str(value),raw.replace(needle,"setTimeout(() => signal('SIGKILL'), "+str(value)+")"),'buster-provider-session-policy.test.mjs'))
results=[]
for name,mutant,test in cases:
 d=out/name;d.mkdir();(d/'before.ts').write_text(raw);(d/'mutant.ts').write_text(mutant)
 spec={'file':str(f),'sha256':hashlib.sha256(raw.encode()).hexdigest(),'from':raw,'to':mutant,'log':str(d/'applied.jsonl')};(d/'spec.json').write_text(json.dumps(spec))
 env=dict(os.environ,LC_MUTANT_SPEC=str(d/'spec.json'));env['NODE_OPTIONS']+=' --import='+str(root/'docs/review/evidence/config-worker-local-runtime-20260921/mutant-loader.mjs')
 cmd=['node','--test','tests/verification/contracts/'+test];r=subprocess.run(cmd,env=env,capture_output=True,text=True,timeout=180);log=r.stdout+r.stderr;(d/'output.txt').write_text(log)
 detected=r.returncode!=0 and 'AssertionError' in log and (d/'applied.jsonl').is_file()
 results.append({'name':name,'command':cmd,'exitCode':r.returncode,'candidateAssertionDetection':detected,'requiresManualOracleReview':True});(out/'results.json').write_text(json.dumps(results,indent=2));print(name+' '+str(detected),flush=True)
raise SystemExit(0 if all(r['candidateAssertionDetection'] for r in results) else 1)
