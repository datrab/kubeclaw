from pathlib import Path
import subprocess,os,json,hashlib,re
c=Path('node_modules/.cache/systemd-parser-20260921').resolve();out=Path('docs/review/evidence/independent-systemd-parser-20260921');env=dict(os.environ,LD_LIBRARY_PATH=str(c/'verifier/usr/lib')+':'+str(c/'verifier/lib'))
cmd=[str(c/'verifier/usr/bin/gpgv'),'--status-fd','1']
for key in ['archive-key-13.asc.gpg','archive-key-12.asc.gpg','release-13.asc.gpg']:cmd+=['--keyring',str(c/key)]
p=subprocess.run(cmd+[str(c/'InRelease')],env=env,capture_output=True,text=True,timeout=30);(out/'signature.txt').write_text(p.stdout+p.stderr);assert p.returncode==0
valid=[line.split()[-1] for line in p.stdout.splitlines() if line.startswith('[GNUPG:] VALIDSIG ')]
assert {'04B54C3CDCA79751B16BC6B5225629DF75B188BD','41587F7DB8C774BCCF131416762F67A0B2C39DE4'}<=set(valid)
r=re.search(r'^ ([a-f0-9]{64})\s+(\d+) main/binary-amd64/Packages.xz$',(c/'InRelease').read_text(),re.M);index=c/'Packages.xz';assert index.stat().st_size==int(r[2]) and hashlib.sha256(index.read_bytes()).hexdigest()==r[1]
results=[]
for apk in sorted((c/'alpine-packages').glob('*.apk')):
 p=subprocess.run(['apk','verify',str(apk)],capture_output=True,text=True,timeout=30);results.append({'file':str(apk),'exit':p.returncode,'stdout':p.stdout,'stderr':p.stderr});assert p.returncode==0
(out/'alpine-verification.json').write_text(json.dumps(results,indent=2)+'\n');print(json.dumps({'validPrimaryFingerprints':valid,'signedIndexMatches':True,'verifiedAlpinePackages':len(results)}))
