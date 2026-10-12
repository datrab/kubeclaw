import pathlib,hashlib,json,os
repo=pathlib.Path.cwd();cache=repo/'node_modules/.cache/buster-helper-vm-20260921';e=repo/'docs/review/evidence/isolated-buster-helper-vm-proposal-20260921'
files=[cache/'root/usr/bin/qemu-system-x86_64',cache/'root/boot/vmlinuz-virt',cache/'initrd.cpio.gz',cache/'guest-root.ext4',cache/'guest-root/usr/local/bin/node',cache/'guest-root/etc/machine-id',cache/'repo-snapshot-manifest.json']
files += [f for f in e.iterdir() if f.is_file() and f.name not in ['artifact-manifest.json','verification-only.txt']]
files += list((cache/'packages').glob('*.apk'))
rows=[]
for f in sorted(files):
 with f.open('rb') as stream:
  sha=hashlib.file_digest(stream,'sha256').hexdigest();os.posix_fadvise(stream.fileno(),0,0,os.POSIX_FADV_DONTNEED)
 rows.append({'path':str(f.relative_to(repo)),'bytes':f.stat().st_size,'sha256':sha})
(e/'artifact-manifest.json').write_text(json.dumps({'status':'prepared-not-booted','files':rows},indent=2)+'\n')
print('Bound',len(rows),'artifacts; no boot',flush=True)
