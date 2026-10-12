from pathlib import Path
import subprocess,os,json,hashlib,tarfile
r=Path.cwd(); e=r/'docs/review/evidence/inventory-digest-guard-20260921'
paths=sorted({p for folder in ['foundation/observability','scripts/observability-retirement','tests/verification/reliability'] for p in (r/folder).rglob('*') if p.is_file()} | {r/'scripts/retire-attempt-closure.mjs'})
ident=lambda: {str(p.relative_to(r)):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
before=ident(); (e/'final-source-before.json').write_text(json.dumps(before,indent=2)+'\n')
with tarfile.open(e/'final-source.tar.gz','w:gz') as archive:
 for p in paths: archive.add(p,arcname=str(p.relative_to(r)))
env=os.environ.copy(); env['LD_LIBRARY_PATH']=str(r/'node_modules/.cache/native-host-tools/root/usr/lib')+':'+str(r/'node_modules/.cache/native-host-tools/root/lib')
cmd=[str(r/'node_modules/.cache/native-host-tools/root/usr/bin/proot'),'-b',str(r/'node_modules/.cache/native-host-tools/root/usr/bin/flock')+':/usr/bin/flock!','/usr/local/bin/node','--test']+['tests/verification/reliability/'+n for n in ['admission-retirement.test.mjs','attempt-projection-review.test.mjs','attempt-closure-projection.test.mjs','observability-replay.test.mjs','observability-retirement-plan.test.mjs']]
(e/'final-combined-command.json').write_text(json.dumps({'argv':cmd,'LD_LIBRARY_PATH':env['LD_LIBRARY_PATH']},indent=2)+'\n')
with (e/'final-combined.txt').open('w') as log: result=subprocess.run(cmd,env=env,stdout=log,stderr=subprocess.STDOUT)
after=ident(); (e/'final-source-after.json').write_text(json.dumps(after,indent=2)+'\n'); (e/'final-combined-result.json').write_text(json.dumps({'exitCode':result.returncode,'sourcesUnchanged':before==after},indent=2)+'\n')
print(result.returncode,before==after,flush=True)
