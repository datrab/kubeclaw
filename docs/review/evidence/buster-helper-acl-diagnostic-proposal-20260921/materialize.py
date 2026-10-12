from pathlib import Path
import shutil,json,uuid,subprocess,hashlib,os
repo=Path.cwd();cache=repo/'node_modules/.cache/buster-helper-acl-vm-20260921';prior=repo/'node_modules/.cache/buster-helper-vm-20260921';evidence=repo/'docs/review/evidence/buster-helper-acl-diagnostic-proposal-20260921'
cache.mkdir();(cache/'logs').mkdir();(cache/'root').symlink_to(prior/'root',target_is_directory=True);(cache/'repo-snapshot').symlink_to(prior/'repo-snapshot',target_is_directory=True)
shutil.copytree(prior/'guest-root',cache/'guest-root',symlinks=True)
identity=str(uuid.uuid4());machine=cache/'guest-root/etc/machine-id';machine.chmod(0o644);machine.write_text(identity+'\n');machine.chmod(0o444)
(evidence/'guest-identity.json').write_text(json.dumps({'uuid':identity,'generation':'Fresh UUID4 for independent ACL diagnostic guest','mode':'0444'},indent=2)+'\n')
(cache/'guest-root/diagnostics').mkdir()
for name in ['acl-diagnosis.mjs','credential-bridge.mjs']:shutil.copy2(evidence/name,cache/'guest-root/diagnostics'/name)
shutil.copy2(repo/'docs/review/evidence/buster-setpriv-diagnosis-20260921/execvp-observer.c',cache/'guest-root/diagnostics/execvp-observer.c')
shutil.copy2(prior/'repo-snapshot-manifest.json',cache/'repo-snapshot-manifest.json')
subprocess.run(['python3',str(evidence/'prepare-images.py')],check=True)
for name in ['image-build.json','initrd-init.sh']:shutil.copy2(cache/name,evidence/name)
for name in ['added-packages.json','author-source-identities.json','snapshot-delta.json']:shutil.copy2(repo/'docs/review/evidence/isolated-buster-helper-vm-proposal-20260921'/name,evidence/('baseline-'+name))
(evidence/'launch-command.json').write_text(subprocess.check_output(['python3',str(evidence/'launch-approved.py')],text=True))
def sha(file):
 with file.open('rb') as stream:
  result=hashlib.file_digest(stream,'sha256').hexdigest();os.posix_fadvise(stream.fileno(),0,0,os.POSIX_FADV_DONTNEED);return result
files=[cache/'root/usr/bin/qemu-system-x86_64',cache/'root/boot/vmlinuz-virt',cache/'initrd.cpio.gz',cache/'guest-root.ext4',cache/'guest-root/usr/local/bin/node',cache/'repo-snapshot-manifest.json',cache/'guest-root/etc/machine-id',repo/'docs/review/evidence/buster-setpriv-diagnosis-20260921/execvp-observer.c',*sorted(evidence.iterdir()),repo/'docs/review/remediation/implementation/buster-helper-acl-diagnostic-proposal-20260921.md']
(evidence/'artifact-manifest.json').write_text(json.dumps({'status':'prepared-not-booted','files':[{'path':str(file.relative_to(repo)),'bytes':file.stat().st_size,'sha256':sha(file)} for file in files if file.is_file() and file.name not in ['artifact-manifest.json','materialization.txt']]},indent=2)+'\n')
print('Independent ACL diagnostic guest materialized; no boot',flush=True)
