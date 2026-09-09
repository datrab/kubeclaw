import subprocess,os,json,sys,shlex,pathlib,hashlib
root=pathlib.Path('/workspace/scratch/4e25cf57c177/kubeclaw-integration-ab79ad9')
out=pathlib.Path(__file__).parent
spec={
'core':[['npm','run',name] for name in ['verify:worker-core:contracts','verify:worker-core:attempt-executor','verify:worker-core:local-runtime','verify:worker-core:role-surfaces','verify:test-gate:remote-import']]+[['node','tests/verification/contracts/check-pipeline-committed-source-snapshot.mts']],
'prism':[['node','--test',*['skills/prism/tests/'+x for x in ['engine.test.mts','engine-cache.test.mts','worker-service.test.mts','worker-cancellation.test.mts','provider-cancellation.test.mts']], 'tests/verification/reliability/worker-deadline.test.mts'],['node','--test',*['skills/prism/tests/'+x for x in ['design-rounds.test.mts','design-round-client.test.mts','preferences-generation.test.mts','pipeline-preference-subject.test.mts','preference-bridge.test.mjs']]],['npm','run','typecheck','--workspace','@kubeclaw/prism']],
'release-scaffold-source':[['node','--test',*['tests/verification/deployment/'+x for x in ['deployment-release.test.mjs','release-configuration.test.mjs','release-images.test.mjs']]],['node','tests/verification/contracts/check-deploy-prism-command.mts'],['node','--test','tests/skills/nova/project_setup/progress-scaffold.test.mjs','tests/skills/nova/project_setup/scaffold-regeneration.test.mjs'],['npm','run','progress:scaffold:typecheck'],['node','--test','tests/verification/reliability/approval-source.test.mjs','tests/verification/reliability/admin-repair.test.mjs']]
}
env=os.environ.copy();env['PATH']='/workspace/scratch/4e25cf57c177/toolchains/bin:/workspace/scratch/4e25cf57c177/toolchains/go/bin:'+env['PATH']
group=sys.argv[1]; results=[]
for index,args in enumerate(spec[group]):
 logfile=out/f'{group}-{index+1}.log'
 with logfile.open('w') as stream:
  stream.write('sourceSHA=ab79ad928cbf54072fe0b3eaabd8b5ee60dea7d1\ncommand='+shlex.join(args)+'\n');stream.flush()
  try:code=subprocess.run(args,cwd=root,env=env,stdout=stream,stderr=subprocess.STDOUT,timeout=240).returncode
  except subprocess.TimeoutExpired:code=124;stream.write('\nHARNESS_TIMEOUT_240_SECONDS\n')
  stream.write(f'\nexit={code}\n')
 results.append({'command':shlex.join(args),'exit':code,'log':str(logfile),'sha256':hashlib.sha256(logfile.read_bytes()).hexdigest()})
 print(json.dumps(results[-1]),flush=True)
 (out/f'{group}.json').write_text(json.dumps(results,indent=2)+'\n')
