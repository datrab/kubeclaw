import pathlib,shutil,json,hashlib,os,uuid,subprocess
repo=pathlib.Path.cwd();prior=repo/'node_modules/.cache/native-test-vm-run3-20260921';cache=repo/'node_modules/.cache/buster-helper-vm-20260921';evidence=repo/'docs/review/evidence/isolated-buster-helper-vm-proposal-20260921';old=repo/'docs/review/evidence/isolated-native-vm-run3-proposal-20260921'
(cache/'logs').mkdir(exist_ok=True)
if not (cache/'root').exists():(cache/'root').symlink_to(prior/'root',target_is_directory=True)
if not (cache/'repo-snapshot').exists():shutil.copytree(prior/'repo-snapshot',cache/'repo-snapshot',symlinks=True)
if not (cache/'guest-root').exists():shutil.copytree(prior/'guest-root',cache/'guest-root',symlinks=True)
# Verify signatures and extract each package into a fresh private tree. Existing
# guest dependencies must match exactly; never replace a differing binary.
added=[]
with (evidence/'extract-final.txt').open('w') as log:
 for apk in sorted((cache/'packages').glob('*.apk')):
  subprocess.run(['apk','verify',str(apk)],stdout=log,stderr=subprocess.STDOUT,check=True)
  added.append({'path':str(apk.relative_to(repo)),'sha256':hashlib.sha256(apk.read_bytes()).hexdigest()})
  tree=cache/'package-trees-final'/apk.stem;tree.mkdir(parents=True)
  subprocess.run(['apk','extract','--no-chown','--destination',str(tree),str(apk)],stdout=log,stderr=subprocess.STDOUT,check=True)
  for directory,dirs,names in os.walk(tree,followlinks=False):
   folder=pathlib.Path(directory);dest=cache/'guest-root'/folder.relative_to(tree);dest.mkdir(parents=True,exist_ok=True)
   for name in names+[n for n in dirs if (folder/n).is_symlink()]:
    source=folder/name;target=dest/name
    if source.is_symlink():
     if target.is_symlink():assert os.readlink(source)==os.readlink(target)
     else:assert not target.exists();target.symlink_to(os.readlink(source))
    elif target.is_symlink():
     assert target==cache/'guest-root/bin/setpriv' and os.readlink(target)=='busybox'
     target.unlink();shutil.copy2(source,target)
    elif target.exists():assert source.read_bytes()==target.read_bytes(),str(target)
    else:shutil.copy2(source,target)
(evidence/'added-packages.json').write_text(json.dumps(added,indent=2)+'\n')
manifest=json.loads((repo/'docs/review/evidence/buster-helper-authority-20260921/local-source-identities.json').read_text())
for row in manifest['files']:
 source=repo/row['snapshot'];assert hashlib.sha256(source.read_bytes()).hexdigest()==row['sha256']
 target=cache/'repo-snapshot'/row['path'];target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,target)
proof=cache/'repo-snapshot/ha-proof';proof.mkdir()
for name in ['guest-proof.test.mjs','guest-tests.mjs']:shutil.copy2(evidence/name,proof/name)
oldsource=repo/'docs/review/evidence/buster-helper-authority-20260921/before/skills/common/plugin-runtime/foundation/isolation/sandbox.c.snapshot';shutil.copy2(oldsource,proof/'sandbox.before.c')
shutil.copy2(repo/'docs/review/evidence/buster-helper-authority-20260921/local-source-identities.json',evidence/'author-source-identities.json')
identity=str(uuid.uuid4());machine=cache/'guest-root/etc/machine-id';machine.chmod(0o644);machine.write_text(identity+'\n');machine.chmod(0o444)
(evidence/'guest-identity.json').write_text(json.dumps({'uuid':identity,'mode':'0444','generation':'fresh disposable HA guest UUID'},indent=2)+'\n')
for name in ['prepare-images.py','launch-approved.py']:
 text=(old/name).read_text().replace('native-test-vm-run3-20260921','buster-helper-vm-20260921').replace('isolated-native-vm-run3-proposal-20260921','isolated-buster-helper-vm-proposal-20260921').replace('isolated-native-review-run3-20260921','isolated-buster-helper-review-20260921')
 (evidence/name).write_text(text)
def sha(file):
 with file.open('rb') as stream:
  h=hashlib.file_digest(stream,'sha256').hexdigest();os.posix_fadvise(stream.fileno(),0,0,os.POSIX_FADV_DONTNEED);return h
records=[];target=cache/'repo-snapshot';independent=0
for directory,dirs,names in os.walk(target,followlinks=False):
 directory=pathlib.Path(directory)
 if directory!=target:records.append({'path':str(directory.relative_to(target)),'type':'directory'})
 for name in names+[n for n in dirs if (directory/n).is_symlink()]:
  file=directory/name;relative=str(file.relative_to(target))
  if file.is_symlink():
   assert file.resolve().is_relative_to(target.resolve());records.append({'path':relative,'type':'symlink','symlink':os.readlink(file)})
  else:
   before=prior/'repo-snapshot'/relative
   if before.exists():assert (file.stat().st_dev,file.stat().st_ino)!=(before.stat().st_dev,before.stat().st_ino);independent+=1
   records.append({'path':relative,'type':'file','bytes':file.stat().st_size,'sha256':sha(file)})
records.sort(key=lambda row:row['path']);(cache/'repo-snapshot-manifest.json').write_text(json.dumps(records,separators=(',',':'))+'\n')
a={r['path']:r for r in json.loads((prior/'repo-snapshot-manifest.json').read_text())};b={r['path']:r for r in records};delta=[n for n in sorted(set(a)|set(b)) if a.get(n)!=b.get(n)]
(evidence/'snapshot-delta.json').write_text(json.dumps({'baselineManifestSha256':sha(prior/'repo-snapshot-manifest.json'),'snapshotSha256':sha(cache/'repo-snapshot-manifest.json'),'independentRegularInodes':independent,'changedPaths':delta,'authorScope':[r['path'] for r in manifest['files']],'proofFixtures':['ha-proof/guest-proof.test.mjs','ha-proof/guest-tests.mjs','ha-proof/sandbox.before.c']},indent=2)+'\n')
subprocess.run(['python3',str(evidence/'prepare-images.py')],check=True)
print('Prepared only: no VM boot',flush=True)
