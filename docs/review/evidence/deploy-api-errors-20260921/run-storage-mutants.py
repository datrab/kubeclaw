import importlib.util
import io
import pathlib
import shutil
import tempfile
import unittest
root=pathlib.Path.cwd(); evidence=root/'docs/review/evidence/deploy-api-errors-20260921'
spec=importlib.util.spec_from_file_location('deploy_tests',root/'scripts/tests/deploy-api-errors.test.py')
module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
for name,method in [('skip-corrupt-revision','test_helm_storage_history_is_authoritative'),('latest-only','test_helm_storage_history_is_authoritative')]:
 with tempfile.TemporaryDirectory(prefix='deploy-mutant-') as directory:
  target=pathlib.Path(directory); (target/'scripts').mkdir()
  for entry in root.iterdir():
   if entry.name!='scripts': (target/entry.name).symlink_to(entry, target_is_directory=entry.is_dir())
  for entry in (root/'scripts').iterdir():
   if entry.name in ('deploy.sh','deploy-observation.mjs'): shutil.copyfile(entry,target/'scripts'/entry.name)
   else: (target/'scripts'/entry.name).symlink_to(entry,target_is_directory=entry.is_dir())
  file=target/'scripts/deploy.sh'; source=file.read_text()
  if name=='skip-corrupt-revision':
   old='err "Cannot decode Helm revision ${namespace}/${release}/${revision}"\n        return 1'
   assert source.count(old)==1
   source=source.replace(old,'err "Mutant skips corrupt revision"\n        continue')
  else:
   old='    done <<<"$records"'
   assert source.count(old)==1
   source=source.replace(old,'    done <<<"$(printf \'%s\\n\' "$records" | tail -n 1)"')
  file.write_text(source)
  module.ROOT=target
  if name=='latest-only':
   case=module.DeployObservations('test_helm_storage_history_is_authoritative')
   result,calls=case.run_entry(['agent','nova'],{'helm':'present','revisions':[1,2],'decode_failure_revision':1})
   (evidence/'latest-only-corrupt-old-admission.txt').write_text(str({'exit':result.returncode,'commands':calls,'stdout':result.stdout,'stderr':result.stderr})+'\n')
   assert result.returncode==0 and any(c[:2]==['helm','upgrade'] for c in calls), 'Expected mutant to demonstrate corrupt old revision admission'
  stream=io.StringIO()
  result=unittest.TextTestRunner(stream=stream,verbosity=2).run(unittest.TestSuite([module.DeployObservations(method)]))
  (evidence/(name+'-storage.txt')).write_text(stream.getvalue())
  if result.wasSuccessful(): raise RuntimeError('Surviving mutant: '+name)
  print(name,'failures',len(result.failures),'errors',len(result.errors))
