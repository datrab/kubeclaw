import os,pathlib,subprocess,json
root=pathlib.Path.cwd(); evidence=root/'docs/review/evidence/config-buster-admission-20260921'
proot=root/'node_modules/.cache/native-host-tools/root/usr/bin/proot'
base=[str(proot),'-b',str(root/'node_modules/.cache/native-host-tools/root/usr/bin/flock')+':/usr/bin/flock!','-b',str(root/'node_modules/.cache/native-host-tools/root/bin/tar')+':/usr/bin/tar!','/usr/local/bin/node']
results=[]
for mode in ['baseline','restore-defaults','ignore-weight']:
 env={**os.environ,'LD_LIBRARY_PATH':str(root/'node_modules/.cache/native-host-tools/root/usr/lib')}
 env.pop('NODE_TEST_CONTEXT',None)
 command=base.copy()
 if mode!='baseline':
  env['BUSTER_ADMISSION_MUTATION']=mode
  command+=['--import',str(evidence/'mutate.mjs')]
 command+=['--test','--test-concurrency=1','tests/verification/reliability/buster-admission-config.test.mts']
 result=subprocess.run(command,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,timeout=90)
 (evidence/('mutation-'+mode+'.txt')).write_text(result.stdout)
 item={'mode':mode,'command':command,'exitCode':result.returncode};results.append(item)
 (evidence/'mutations.json').write_text(json.dumps(results,indent=2)+'\n')
 if mode=='baseline':assert result.returncode==0,result.stdout
 else:
  assert result.returncode==1,result.stdout
  assert 'AssertionError' in result.stdout or 'Missing expected rejection' in result.stdout,result.stdout
  assert not any(x in result.stdout for x in ['timed out','ERR_MODULE_NOT_FOUND','SyntaxError','mutation anchor']),result.stdout
 print(mode,result.returncode,flush=True)
