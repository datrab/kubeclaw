from pathlib import Path
import subprocess,hashlib,json,urllib.request,base64,os
c=Path('node_modules/.cache/systemd-parser-20260921').resolve();e=Path('docs/review/evidence/systemd-parser-isolated-20260921');root=c/'verifier';root.mkdir(exist_ok=True)
rows=[]
for f in sorted((c/'alpine-packages').glob('*.apk')):
 for cmd in [['apk','verify',str(f)],['apk','extract','--no-chown','--destination',str(root),str(f)]]:
  p=subprocess.run(cmd,capture_output=True,text=True);rows.append({'command':cmd,'exit':p.returncode,'stdout':p.stdout,'stderr':p.stderr});assert p.returncode==0,rows[-1]
(e/'alpine-verification.json').write_text(json.dumps(rows,indent=2)+'\n')
def fetch(url,name):
 f=c/name
 if not f.exists():
  with urllib.request.urlopen(url,timeout=30) as s,f.open('wb') as out:
   while b:=s.read(65536):
    out.write(b)
    assert out.tell()<128*1024**2
 return f
for name in ['archive-key-12.asc','archive-key-13.asc','release-13.asc']:
 f=fetch('https://ftp-master.debian.org/keys/'+name,name)
 lines=f.read_text().splitlines();data=''.join(x for x in lines[2:] if x and not x.startswith(('=','-----')))
 (c/(name+'.gpg')).write_bytes(base64.b64decode(data))
fetch('https://deb.debian.org/debian/dists/trixie/InRelease','InRelease')
env=dict(os.environ,LD_LIBRARY_PATH=str(root/'usr/lib')+':'+str(root/'lib'))
cmd=[str(root/'usr/bin/gpgv'),'--status-fd','1','--keyring',str(c/'archive-key-13.asc.gpg'),'--keyring',str(c/'archive-key-12.asc.gpg'),'--keyring',str(c/'release-13.asc.gpg'),str(c/'InRelease')]
p=subprocess.run(cmd,env=env,capture_output=True,text=True);(e/'release-signature.txt').write_text(p.stdout+p.stderr);assert p.returncode==0,p.stderr
assert any(x in p.stdout for x in ['04B54C3CDCA79751B16BC6B5225629DF75B188BD','41587F7DB8C774BCCF131416762F67A0B2C39DE4'])
print('Signed Alpine verifier and Debian InRelease verified')
