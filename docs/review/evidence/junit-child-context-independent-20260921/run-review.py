from pathlib import Path
import subprocess,os,json,hashlib
root=Path.cwd(); out=root/'docs/review/evidence/junit-child-context-independent-20260921'
target=root/'tests/verification/contracts/check-junit-executed-required.mts'
before=(root/'docs/review/evidence/junit-child-context-20260921/test-before.mts.snapshot').read_text(); after=target.read_text()
addition="    const childEnvironment = { ...process.env };\n    // The child owns its reporter; inheriting the parent test context suppresses it.\n    delete childEnvironment.NODE_TEST_CONTEXT;\n"
assert after.replace(addition,'').replace('source], { env: childEnvironment });','source]);')==before
(out/'exact-diff.json').write_text(json.dumps({'wholeFileIdenticalAfterReversingOnlyEnvironmentPatch':True,'beforeSha256':hashlib.sha256(before.encode()).hexdigest(),'afterSha256':hashlib.sha256(after.encode()).hexdigest()},indent=2)+'\n')
env=os.environ.copy(); tools=root/'node_modules/.cache/native-host-tools/root'
env['LD_LIBRARY_PATH']=str(tools/'usr/lib')+':'+str(tools/'lib')
base=[str(tools/'usr/bin/proot'),'-b',str(tools/'usr/bin/flock')+':/usr/bin/flock!','/usr/local/bin/node']
mutant=target.with_name('independent-junit-old-context.mts'); results=[]
try:
 mutant.write_text(before)
 for name,argv in [('direct',base+[str(target)]),('aggregate',base+['--test',str(target)]),('old-inheritance',base+['--test',str(mutant)])]:
  with (out/(name+'.txt')).open('w') as log: result=subprocess.run(argv,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=180)
  results.append({'name':name,'argv':argv,'exitCode':result.returncode})
  (out/'commands-results.json').write_text(json.dumps(results,indent=2)+'\n')
 assert results[0]['exitCode']==results[1]['exitCode']==0
 assert results[2]['exitCode']!=0
 assert 'ENOENT' in (out/'old-inheritance.txt').read_text() and 'all-skipped.xml' in (out/'old-inheritance.txt').read_text()
finally:
 mutant.unlink(missing_ok=True)
