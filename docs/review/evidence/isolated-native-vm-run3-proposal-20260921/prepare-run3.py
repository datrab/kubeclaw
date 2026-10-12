import pathlib,shutil,json,hashlib,os,uuid,subprocess
repo=pathlib.Path.cwd(); base=repo/'node_modules/.cache/native-test-vm-20260921'; prior=repo/'node_modules/.cache/native-test-vm-run2-20260921'; cache=repo/'node_modules/.cache/native-test-vm-run3-20260921'; evidence=repo/'docs/review/evidence/isolated-native-vm-run3-proposal-20260921'; old=repo/'docs/review/evidence/isolated-native-vm-run2-proposal-20260921'
cache.mkdir();(cache/'logs').mkdir();(cache/'root').symlink_to(base/'root',target_is_directory=True)
# Independent real copy, never hardlinks: changes cannot reach historical exports.
shutil.copytree(base/'repo-snapshot',cache/'repo-snapshot',symlinks=True)
shutil.copytree(prior/'guest-root',cache/'guest-root',symlinks=True)
changes=['skills/worker/core/worker/native-worker-process.ts','tests/verification/reliability/native-process-policy.test.mts','tests/verification/reliability/tsconfig.native-scope.json','package.json']
for name in changes: shutil.copy2(repo/name,cache/'repo-snapshot'/name)
(cache/'guest-root/etc/machine-id').chmod(0o644)
identity=str(uuid.uuid4()); (cache/'guest-root/etc/machine-id').write_text(identity+'\n');(cache/'guest-root/etc/machine-id').chmod(0o444)
(evidence/'guest-identity.json').write_text(json.dumps({'generation':'Python uuid.uuid4 for fresh disposable run3 guest','uuid':identity,'path':'/etc/machine-id','preparedMode':'0444','ownership':'guest initialization chowns only guest /etc before unchanged production-reader preflight'},indent=2)+'\n')
for name in ['prepare-images.py','launch-approved.py','guest-init.sh']:
 text=(old/name).read_text().replace('native-test-vm-run2-20260921','native-test-vm-run3-20260921').replace('isolated-native-vm-run2-proposal-20260921','isolated-native-vm-run3-proposal-20260921').replace('isolated-native-review-run2-20260921','isolated-native-review-run3-20260921')
 if name=='guest-init.sh': text=text.replace('  tests/verification/reliability/worker-resource-reservations.test.mts', '  tests/verification/reliability/native-process-policy.test.mts '+chr(92)+chr(10)+'  tests/verification/reliability/worker-resource-reservations.test.mts')
 (evidence/name).write_text(text)
for name in ['package-hashes.json','guest-packages.json']:shutil.copy2(prior/name,cache/name)
def sha(file):
 with file.open('rb') as stream:
  h=hashlib.file_digest(stream,'sha256').hexdigest();os.posix_fadvise(stream.fileno(),0,0,os.POSIX_FADV_DONTNEED);return h
records=[];target=cache/'repo-snapshot'
for directory,dirs,names in os.walk(target,followlinks=False):
 directory=pathlib.Path(directory)
 if directory!=target:records.append({'path':str(directory.relative_to(target)),'type':'directory'})
 for name in names+[n for n in dirs if (directory/n).is_symlink()]:
  file=directory/name;relative=str(file.relative_to(target))
  if file.is_symlink():
   assert file.resolve().is_relative_to(target.resolve());records.append({'path':relative,'type':'symlink','symlink':os.readlink(file)})
  else:
   if (base/'repo-snapshot'/relative).exists():assert file.stat().st_ino!=(base/'repo-snapshot'/relative).stat().st_ino
   records.append({'path':relative,'type':'file','bytes':file.stat().st_size,'sha256':sha(file)})
records.sort(key=lambda row:row['path']);(cache/'repo-snapshot-manifest.json').write_text(json.dumps(records,separators=(',',':'))+'\n')
before={r['path']:r for r in json.loads((base/'repo-snapshot-manifest.json').read_text())};after={r['path']:r for r in records};delta=[n for n in sorted(set(before)|set(after)) if before.get(n)!=after.get(n)];assert delta==sorted(changes),delta
(evidence/'snapshot-delta.json').write_text(json.dumps({'baselineManifestSha256':sha(base/'repo-snapshot-manifest.json'),'run3ManifestSha256':sha(cache/'repo-snapshot-manifest.json'),'independentRegularFileInodes':True,'changedPaths':delta,'changes':[{'path':n,'before':before.get(n),'after':after[n]} for n in delta]},indent=2)+'\n')
# Enumerate all baseline snapshot differences from current, rather than claiming whole-tree equality.
differences=[]
for row in records:
 if row['type']!='file' or row['path'].startswith('node_modules/'):continue
 file=repo/row['path']
 if not file.is_file() or sha(file)!=row['sha256']:differences.append(row['path'])
(evidence/'current-existing-path-differences.json').write_text(json.dumps({'scope':'All existing snapshot regular files outside node_modules; current extra files not represented','differentPaths':differences},indent=2)+'\n')
subprocess.run(['python3',str(evidence/'prepare-images.py')],check=True)
print('Run3 independent source and fresh disk prepared; changed paths:',delta,flush=True)
