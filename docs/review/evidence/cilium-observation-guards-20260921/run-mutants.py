import importlib.util
import pathlib
import shutil
import subprocess
import tempfile
import unittest
import io
root = pathlib.Path.cwd()
evidence = root / 'docs/review/evidence/cilium-observation-guards-20260921'
spec = importlib.util.spec_from_file_location('guard_tests', root / 'scripts/tests/cilium-observation-guards.test.py')
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
for name, method in [('legacy-preflight', 'test_bad_cri_lists_prevent_mutation'), ('default-zero-revisions', 'test_cleanup_requires_observed_endpoint_revisions')]:
 with tempfile.TemporaryDirectory(prefix='cilium-mutant-') as directory:
  target = pathlib.Path(directory); (target / 'scripts').mkdir()
  shutil.copytree(root / 'my-values/infra', target / 'my-values/infra')
  for file in ['deploy-cilium.sh', 'verify-cilium-install-preflight.py', 'verify-cilium-policies.py', 'migrate-kubeclaw-network-policies-to-cilium.sh']:
   shutil.copyfile(root / 'scripts' / file, target / 'scripts' / file)
  if name == 'legacy-preflight':
   data = subprocess.check_output(['git', 'show', 'HEAD:scripts/deploy-cilium.sh'])
   (target / 'scripts/deploy-cilium.sh').write_bytes(data)
  else:
   file = target / 'scripts/verify-cilium-policies.py'
   file.write_text(file.read_text().replace(".get('policy-revision')", ".get('policy-revision', 0)"))
  module.ROOT = target
  stream = io.StringIO()
  result = unittest.TextTestRunner(stream=stream, verbosity=2).run(unittest.TestSuite([module.Guards(method)]))
  (evidence / (name + '.txt')).write_text(stream.getvalue())
  if result.wasSuccessful(): raise RuntimeError('Mutant survived: ' + name)
  print(name, 'rejected; failures:', len(result.failures), 'errors:', len(result.errors))
