from pathlib import Path
import json,shutil,hashlib,os,uuid,subprocess
repo=Path.cwd();cache=repo/'node_modules/.cache/buster-helper-vm-run2-20260921';base=repo/'node_modules/.cache/buster-helper-vm-20260921';evidence=repo/'docs/review/evidence/isolated-buster-helper-vm-run2-proposal-20260921';prior=repo/'docs/review/evidence/isolated-buster-helper-vm-proposal-20260921'
cache.mkdir();(cache/'logs').mkdir();(cache/'root').symlink_to(base/'root',target_is_directory=True)
shutil.copytree(base/'repo-snapshot',cache/'repo-snapshot',symlinks=True);shutil.copytree(base/'guest-root',cache/'guest-root',symlinks=True)
changed=['scripts/tests/buster-helper-authority-root.test.mjs','scripts/tests/fixtures/buster-unprivileged-caller.mjs']
for name in changed:shutil.copy2(repo/name,cache/'repo-snapshot'/name)
identity=str(uuid.uuid4());machine=cache/'guest-root/etc/machine-id';machine.chmod(0o644);machine.write_text(identity+'\n');machine.chmod(0o444)
(evidence/'guest-identity.json').write_text(json.dumps({'uuid':identity,'mode':'0444','generation':'Fresh corrected HA guest UUID'},indent=2)+'\n')
shutil.copy2(prior/'guest-init.sh',evidence/'guest-init.sh')
for name in ['prepare-images.py','launch-approved.py']:
 text=(prior/name).read_text().replace('buster-helper-vm-20260921','buster-helper-vm-run2-20260921').replace('isolated-buster-helper-vm-proposal-20260921','isolated-buster-helper-vm-run2-proposal-20260921').replace('isolated-buster-helper-review-20260921','isolated-buster-helper-review-run2-20260921');(evidence/name).write_text(text)
def sha(file):
 with file.open('rb') as stream:
  h=hashlib.file_digest(stream,'sha256').hexdigest();os.posix_fadvise(stream.fileno(),0,0,os.POSIX_FADV_DONTNEED);return h
records=[];target=cache/'repo-snapshot';independent=0
for directory,dirs,names in os.walk(target,followlinks=False):
 directory=Path(directory)
 if directory!=target:records.append({'path':str(directory.relative_to(target)),'type':'directory'})
 for name in names+[name for name in dirs if (directory/name).is_symlink()]:
  file=directory/name;relative=str(file.relative_to(target))
  if file.is_symlink():
   assert file.resolve().is_relative_to(target.resolve());records.append({'path':relative,'type':'symlink','symlink':os.readlink(file)})
  else:
   old=base/'repo-snapshot'/relative
   if old.exists():assert (file.stat().st_dev,file.stat().st_ino)!=(old.stat().st_dev,old.stat().st_ino);independent+=1
   records.append({'path':relative,'type':'file','bytes':file.stat().st_size,'sha256':sha(file)})
records.sort(key=lambda row:row['path']);(cache/'repo-snapshot-manifest.json').write_text(json.dumps(records,separators=(',',':'))+'\n')
a={row['path']:row for row in json.loads((base/'repo-snapshot-manifest.json').read_text())};b={row['path']:row for row in records};delta=[name for name in sorted(set(a)|set(b)) if a.get(name)!=b.get(name)];assert delta==changed
(evidence/'snapshot-delta.json').write_text(json.dumps({'baselineManifestSha256':sha(base/'repo-snapshot-manifest.json'),'snapshotSha256':sha(cache/'repo-snapshot-manifest.json'),'independentRegularInodes':independent,'changedPaths':delta,'changes':[{'path':name,'before':a.get(name),'after':b[name]} for name in delta]},indent=2)+'\n')
for name in ['added-packages.json','author-source-identities.json']:shutil.copy2(prior/name,evidence/('baseline-'+name))
subprocess.run(['python3',str(evidence/'prepare-images.py')],check=True)
for name in ['image-build.json','initrd-init.sh']:shutil.copy2(cache/name,evidence/name)
(evidence/'launch-command.json').write_text(subprocess.check_output(['python3',str(evidence/'launch-approved.py')],text=True))
files=[cache/'root/usr/bin/qemu-system-x86_64',cache/'root/boot/vmlinuz-virt',cache/'initrd.cpio.gz',cache/'guest-root.ext4',cache/'guest-root/usr/local/bin/node',cache/'repo-snapshot-manifest.json',cache/'guest-root/etc/machine-id',*sorted(evidence.iterdir()),repo/'docs/review/remediation/implementation/isolated-buster-helper-vm-run2-proposal-20260921.md']
(evidence/'artifact-manifest.json').write_text(json.dumps({'status':'prepared-not-booted','files':[{'path':str(file.relative_to(repo)),'bytes':file.stat().st_size,'sha256':sha(file)} for file in files if file.is_file() and file.name not in ['artifact-manifest.json','preparation.txt']]},indent=2)+'\n')
print('Corrected HA run2 prepared; exact two-file delta, independent copy; no boot',flush=True)
