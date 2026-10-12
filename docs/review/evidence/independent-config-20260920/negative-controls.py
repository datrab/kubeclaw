import pathlib,tempfile,subprocess,json,shutil,re,os
root=pathlib.Path.cwd();out=root/'docs/review/evidence/independent-config-20260920';results=[]
with tempfile.TemporaryDirectory(prefix='independent-config-negative-') as tmp:
 t=pathlib.Path(tmp);(t/'node_modules').symlink_to(root/'node_modules',target_is_directory=True)
 for name in ['skills/common/plugin-runtime/foundation/config/swarm.ts','skills/common/plugin-runtime/foundation/config/swarm.schema.json','skills/prism/server/worker-config.ts','skills/prism/tests/swarm-worker-config.test.mts','charts/kubeclaw/files/config/swarm.config.json']:
  dest=t/name;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(root/name,dest)
 loader=t/'skills/common/plugin-runtime/foundation/config/swarm.ts';original=loader.read_text()
 for name,source in [('legacy-authority',original.replace('for (const key of migratedEnvironmentKeys)', 'for (const key of [])')),('connection-budget',original.replace('settings.maximumActiveRequests + settings.maximumProbeRequests > settings.maximumConnections','false'))]:
  assert source!=original;loader.write_text(source);(out/(name+'.mutant.ts')).write_text(source)
  cmd=['node','--test',str(t/'skills/prism/tests/swarm-worker-config.test.mts')]
  with (out/(name+'.txt')).open('w') as f:r=subprocess.run(cmd,stdout=f,stderr=subprocess.STDOUT)
  assert r.returncode!=0;results.append({'mutation':name,'command':cmd,'exitCode':r.returncode,'expected':'precise existing negative assertion fails; positive controls remain green'})
 factory=(root/'skills/buster/engine/test-gates/capability-runtime.ts').read_text()
 factory=re.sub(r"from '(\./[^']+)'",lambda m:"from '"+str((root/'skills/buster/engine/test-gates'/m[1]).resolve())+"'",factory)
 factory=factory.replace("add('network.http',", "add('network.http.disabled',")
 (t/'capability-runtime.ts').write_text(factory);(out/'missing-network-route.mutant.ts').write_text(factory)
 test=(root/'tests/verification/reliability/http-authority.test.mts').read_text()
 test=test.replace('../../../skills/buster/engine/test-gates/capability-runtime.ts',str(t/'capability-runtime.ts')).replace('../../../skills/buster/engine/test-gates/network-http-runtime.ts',str(root/'skills/buster/engine/test-gates/network-http-runtime.ts'))
 (t/'http-authority.test.mts').write_text(test)
 cmd=['node','--test',str(t/'http-authority.test.mts')]
 with (out/'missing-network-route.txt').open('w') as f:r=subprocess.run(cmd,stdout=f,stderr=subprocess.STDOUT)
 assert r.returncode!=0;results.append({'mutation':'missing-network-route','command':cmd,'exitCode':r.returncode,'expected':'factory HTTP assertion fails, independent original lease control passes'})
(out/'negative-controls.json').write_text(json.dumps(results,indent=2)+'\n')
print(json.dumps(results,indent=2))
