from pathlib import Path
import shutil,json,hashlib,os,uuid,subprocess,stat
repo=Path.cwd();c=repo/'node_modules/.cache/systemd-native-vm-20260921';base=repo/'node_modules/.cache/native-test-vm-run3-20260921';e=repo/'docs/review/evidence/systemd-native-guest-proposal-20260921';parser=repo/'node_modules/.cache/systemd-parser-20260921/runtime'
c.mkdir();(c/'logs').mkdir();(c/'root').symlink_to(base/'root',target_is_directory=True);target=c/'repo-snapshot';target.mkdir()
roots=['skills','contracts','scripts','tests','charts','my-values','config','node_modules']
for name in roots:
 if (repo/name).exists():shutil.copytree(repo/name,target/name,symlinks=True,ignore=shutil.ignore_patterns('.cache','.git'))
for name in ['package.json','package-lock.json','versions.json','tsconfig.json']:
 if (repo/name).exists():shutil.copy2(repo/name,target/name)
shutil.copytree(base/'guest-root',c/'guest-root',symlinks=True);g=c/'guest-root';(g/'opt').mkdir(exist_ok=True);shutil.copytree(parser,g/'opt/systemd-parser',symlinks=True)
(g/'guest-proof').mkdir();shutil.copy2(e/'check-critical.mjs',g/'guest-proof/check-critical.mjs');shutil.copy2(e/'systemd-analyze',g/'usr/local/bin/systemd-analyze');(g/'usr/local/bin/systemd-analyze').chmod(0o755)
identity=str(uuid.uuid4());machine=g/'etc/machine-id';machine.chmod(0o644);machine.write_text(identity+'\n');machine.chmod(0o444);(e/'guest-identity.json').write_text(json.dumps({'uuid':identity,'mode':'0444'})+'\n')
def sha(f):
 with f.open('rb') as s:
  v=hashlib.file_digest(s,'sha256').hexdigest();os.posix_fadvise(s.fileno(),0,0,os.POSIX_FADV_DONTNEED);return v
records=[];independent=0
for directory,dirs,names in os.walk(target,followlinks=False):
 d=Path(directory)
 if d!=target:records.append({'path':str(d.relative_to(target)),'type':'directory'})
 for name in names+[n for n in dirs if (d/n).is_symlink()]:
  f=d/name;rel=str(f.relative_to(target))
  if f.is_symlink():
   assert f.resolve(strict=False).is_relative_to(target);records.append({'path':rel,'type':'symlink','symlink':os.readlink(f)})
  else:
   original=repo/rel;assert f.stat().st_ino!=original.stat().st_ino;independent+=1;records.append({'path':rel,'type':'file','bytes':f.stat().st_size,'sha256':sha(f)})
records.append({'path':'.','type':'directory'})
for row in records:row['mode']=stat.S_IMODE((target/row['path']).lstat().st_mode)
records.sort(key=lambda x:x['path']);(c/'repo-snapshot-manifest.json').write_text(json.dumps(records,separators=(',',':'))+'\n')
critical=[]
for f in ['tests/verification/deployment/native-worker-node.test.mjs','tests/verification/reliability/worker-native-scope-live.mts','tests/verification/reliability/worker-native-topology-live.mts','skills/worker/core/worker/native-worker-launcher.c','scripts/render-native-worker-node.mjs','scripts/deploy.sh']:
 assert sha(target/f)==sha(repo/f);critical.append({'path':'/repo/'+f,'sha256':sha(target/f)})
for f in ['usr/bin/systemd-analyze','usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2']:
 critical.append({'path':'/opt/systemd-parser/'+f,'sha256':sha(parser/f)})
(g/'guest-proof/critical.json').write_text(json.dumps(critical,indent=2)+'\n');(e/'critical-identities.json').write_text(json.dumps(critical,indent=2)+'\n')
(e/'snapshot-summary.json').write_text(json.dumps({'roots':roots,'entries':len(records),'independentFiles':independent,'manifestSha256':sha(c/'repo-snapshot-manifest.json'),'source':'Current workspace copied once; no hardlinks; .cache/.git excluded'},indent=2)+'\n')
subprocess.run(['python3',str(e/'prepare-images.py')],check=True)
for f in ['image-build.json','initrd-init.sh']:shutil.copy2(c/f,e/f)
(e/'launch-command.json').write_text(subprocess.check_output(['python3',str(e/'launch-approved.py')],text=True))
subprocess.run(['python3',str(e/'runtime-binding.py')],check=True)
files=[c/'root/usr/bin/qemu-system-x86_64',c/'root/boot/vmlinuz-virt',c/'initrd.cpio.gz',c/'guest-root.ext4',g/'usr/local/bin/node',c/'repo-snapshot-manifest.json',g/'etc/machine-id',*sorted(e.iterdir()),repo/'docs/review/remediation/implementation/systemd-native-guest-proposal-20260921.md']
(e/'artifact-manifest.json').write_text(json.dumps({'status':'prepared-not-booted','files':[{'path':str(f.relative_to(repo)),'bytes':f.stat().st_size,'sha256':sha(f)} for f in files if f.is_file() and f.name not in ['artifact-manifest.json','preparation.txt']]},indent=2)+'\n')
print('Prepared fresh actual-root parser/native guest; no boot',flush=True)
