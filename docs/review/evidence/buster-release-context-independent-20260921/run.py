import pathlib,subprocess,os,json,hashlib,time
R=pathlib.Path.cwd();O=R/'docs/review/evidence/buster-release-context-independent-20260921';A=R/'docs/review/evidence/buster-release-context-20260921'; rows=json.loads((A/'source-identities.json').read_text()); hashes=lambda:{r['path']:hashlib.sha256((R/r['path']).read_bytes()).hexdigest() for r in rows}; before=hashes(); out=[]
base=['node','--test','--test-concurrency=1','tests/verification/deployment/gitops-release.test.mjs','tests/verification/deployment/release-images.test.mjs']
jobs=[('originals',base,None,0),('assertions',['node',str(A/'verify-original-assertions.mjs')],None,0),('extraction',['node',str(A/'verify-extraction.mjs')],None,0),('missing-context',base,'missing-buster-context-mutant.mjs',1),('missing-committed-check',base,'missing-gitops-check-mutant.mjs',1)]
for name,cmd,hook,expected in jobs:
 env=os.environ.copy()
 if hook: env['NODE_OPTIONS']='--import='+str(A/hook)
 start=time.monotonic()
 with (O/(name+'.txt')).open('w') as f: p=subprocess.run(cmd,env=env,stdout=f,stderr=subprocess.STDOUT,timeout=150)
 out.append({'name':name,'command':cmd,'hook':hook,'exitCode':p.returncode,'expectedExit':expected,'elapsedSeconds':time.monotonic()-start}); (O/'results.json').write_text(json.dumps({'runs':out,'before':before,'after':hashes()},indent=2)+'\n')
 assert p.returncode==expected,(name,p.returncode)
assert hashes()==before
