import subprocess,pathlib,json,hashlib,time
p=pathlib.Path('docs/review/evidence/config-studio-20260921')
files=[r['path'] for r in json.loads((p/'before-identities.json').read_text())]+['skills/prism/package.json','skills/prism/tests/studio-config.test.mts']
identity=lambda:{f:hashlib.sha256(pathlib.Path(f).read_bytes()).hexdigest() for f in files}
before=identity(); rows=[]
tests=['skills/prism/tests/'+name+'.test.mts' for name in ['studio-service','studio-config','studio-adapter','studio-flows','studio-roundtrip','preview-assets','product-decisions','control-image-environment','control-server-config','swarm-control-policy']]+['tests/verification/deployment/'+name+'.test.mjs' for name in ['prism-swarm-config','prism-product-decisions','release-config','release-images','gitops-release']]
commands=[('tests-final',['node','--test','--test-concurrency=1',*tests]),('types-final',['npm','run','typecheck','--prefix','skills/prism']),('lint-final',['npx','eslint','--config','charts/kubeclaw/files/config/eslint.config.mjs',*[f for f in files if f.endswith(('.ts','.mts','.mjs'))]]),('deployment-truth-final',['node','tests/verification/deployment/check-deployment-truth.mjs'])]
for name,command in commands:
 with (p/(name+'.txt')).open('w') as log:
  start=time.time(); result=subprocess.run(command,stdout=log,stderr=subprocess.STDOUT)
 rows.append(dict(name=name,command=command,exitCode=result.returncode,elapsedSeconds=time.time()-start))
 (p/'final-commands.json').write_text(json.dumps(dict(before=before,after=identity(),commands=rows),indent=2)+'\n')
print(json.dumps(rows))
