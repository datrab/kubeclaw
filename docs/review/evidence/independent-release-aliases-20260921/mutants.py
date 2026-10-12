import pathlib, tempfile, subprocess, json, hashlib
root=pathlib.Path.cwd()
evidence=root/'docs/review/evidence/independent-release-aliases-20260921'
module=(root/'scripts/updates/release-configuration.mjs').read_text()
tests=(root/'tests/verification/deployment/release-configuration.test.mjs').read_text()
mutations={
 'skip-canonical-targets': ('[...entries, ...targets]', 'entries'),
 'skip-ancestor-validation': ("if (!fs.lstatSync(path.join(root, ancestor)).isDirectory())", 'if (false)'),
 'trust-current-alias-only': ("!target || git(['cat-file', 'blob', entry.digest]) !== target", '!target'),
}
results=[]
with tempfile.TemporaryDirectory(prefix='independent-release-mutants-') as temporary:
 for name,(old,new) in mutations.items():
  assert module.count(old)==1
  file=pathlib.Path(temporary)/(name+'.mjs'); file.write_text(module.replace(old,new))
  if name=='trust-current-alias-only':
   command=['node',str(evidence/'probes.mjs'),str(file)]
  else:
   testfile=pathlib.Path(temporary)/(name+'.test.mjs')
   testfile.write_text(tests.replace('../../../scripts/updates/release-configuration.mjs',file.as_uri()))
   command=['node','--test',str(testfile)]
  result=subprocess.run(command,capture_output=True,text=True)
  (evidence/(name+'.txt')).write_text(result.stdout+result.stderr)
  assert result.returncode != 0, name+' survived'
  results.append({'mutant':name,'exitCode':result.returncode,'replacement':{'before':old,'after':new}})
(evidence/'mutant-results.json').write_text(json.dumps(results,indent=2)+'\n')
paths=['scripts/updates/release-configuration.mjs','scripts/updates/materialize-release.mjs','tests/verification/deployment/release-configuration.test.mjs','tests/verification/deployment/code-release.test.mjs','tests/verification/deployment/release-images.test.mjs','docs/operations/operator-configuration.md']
(evidence/'reviewed-source-sha256.json').write_text(json.dumps({p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in paths},indent=2)+'\n')
print(json.dumps(results,indent=2))
