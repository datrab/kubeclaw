import pathlib,tempfile,subprocess,json,re,concurrent.futures
root=pathlib.Path.cwd();out=root/'docs/review/evidence/independent-config-followup-20260920'
def mutate(kind):
 with tempfile.TemporaryDirectory(prefix='config-review-mutant-') as tmp:
  t=pathlib.Path(tmp)
  lifecycle=(root/'skills/prism/server/worker-lifecycle.ts').read_text().replace("'./worker-config.ts'",repr(str(root/'skills/prism/server/worker-config.ts')))
  before={'connection':'this.server.maxConnections = limits.maximumConnections;', 'body':'this.server.requestTimeout = limits.requestTimeoutMs;'}[kind]
  after={'connection':'this.server.maxConnections = 4;', 'body':'this.server.requestTimeout = 120000;'}[kind]
  assert before in lifecycle;lifecycle=lifecycle.replace(before,after);(t/'worker-lifecycle.ts').write_text(lifecycle);(out/(kind+'.mutant.ts')).write_text(lifecycle)
  test=(root/'skills/prism/tests/swarm-worker-behavior.test.mts').read_text().replace('../server/worker-lifecycle.ts',str(t/'worker-lifecycle.ts')).replace('../server/worker-config.ts',str(root/'skills/prism/server/worker-config.ts')).replace('../../../charts/kubeclaw/files/config/swarm.config.json',str(root/'charts/kubeclaw/files/config/swarm.config.json'))
  (t/'behavior.test.mts').write_text(test)
  cmd=['node','--test','--test-name-pattern',{'connection':'CB02','body':'CB03'}[kind],str(t/'behavior.test.mts')]
  with (out/(kind+'-mutant.txt')).open('w') as f:r=subprocess.run(cmd,stdout=f,stderr=subprocess.STDOUT,timeout=60)
  return {'mutation':kind,'command':cmd,'exitCode':r.returncode,'expectation':'configured boundary no longer occurs; original positive control must have reached real server'}
with concurrent.futures.ThreadPoolExecutor() as pool:results=list(pool.map(mutate,['connection','body']))
(out/'mutations.json').write_text(json.dumps(results,indent=2)+'\n');print(results)
