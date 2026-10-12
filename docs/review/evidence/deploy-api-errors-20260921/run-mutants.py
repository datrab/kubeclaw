import importlib.util
import io
import pathlib
import shutil
import tempfile
import unittest
root=pathlib.Path.cwd(); evidence=root/'docs/review/evidence/deploy-api-errors-20260921'
spec=importlib.util.spec_from_file_location('deploy_tests',root/'scripts/tests/deploy-api-errors.test.py')
module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
for name,method in [('ignore-helm-status','test_uninstall_entrypoint'),('ignore-resource-namespace','test_oauth_entrypoint')]:
 with tempfile.TemporaryDirectory(prefix='deploy-mutant-') as directory:
  target=pathlib.Path(directory); (target/'scripts').mkdir()
  for entry in root.iterdir():
   if entry.name!='scripts': (target/entry.name).symlink_to(entry, target_is_directory=entry.is_dir())
  for entry in (root/'scripts').iterdir():
   if entry.name in ('deploy.sh','deploy-observation.mjs'): shutil.copyfile(entry,target/'scripts'/entry.name)
   else: (target/'scripts'/entry.name).symlink_to(entry,target_is_directory=entry.is_dir())
  if name=='ignore-helm-status':
   file=target/'scripts/deploy.sh'; source=file.read_text()
   start=source.index('  if ! output=$(helm list '); end=source.index('  printf',start)
   command=source[start:source.index('; then',start)].removeprefix('  if ! ')
   file.write_text(source[:start]+'  '+command+' || true\n'+source[end:])
  else:
   file=target/'scripts/deploy-observation.mjs'; source=file.read_text()
   old=" || (item?.metadata?.namespace ?? '') !== namespace"
   assert source.count(old)==1; file.write_text(source.replace(old,''))
  module.ROOT=target; stream=io.StringIO()
  result=unittest.TextTestRunner(stream=stream,verbosity=2).run(unittest.TestSuite([module.DeployObservations(method)]))
  (evidence/(name+'.txt')).write_text(stream.getvalue())
  if result.wasSuccessful(): raise RuntimeError('Surviving mutant: '+name)
  print(name,'failures',len(result.failures),'errors',len(result.errors))
