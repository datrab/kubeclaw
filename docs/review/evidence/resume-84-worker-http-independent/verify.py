import pathlib,subprocess,json
root=pathlib.Path('/workspace/scratch/a51d993d444b');old=root/'review-delivery-types-84';new=root/'review-worker-http-84';out=pathlib.Path(__file__).resolve().parent
commands=[]
def run(name,repo,args):
 r=subprocess.run(args,cwd=repo,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT);(out/(name+'.txt')).write_text(r.stdout)
 commands.append({'name':name,'repo':str(repo),'args':args,'exitCode':r.returncode});(out/'commands.json').write_text(json.dumps(commands,indent=2)+'\n');return r
file='skills/prism/tests/worker-http-cancellation.test.mts';assert not (old/file).exists();(old/file).write_bytes((new/file).read_bytes())
try:
 r=run('before',old,['node','--test',file]);assert r.returncode!=0 and r.stdout.count('artifact I/O remained active after caller disconnect')>=2
finally:(old/file).unlink()
assert run('old-clean',old,['git','status','--porcelain']).stdout==''
args=['node','--test',file,'skills/prism/tests/worker-cancellation.test.mts','skills/prism/tests/worker-service.test.mts','skills/prism/tests/worker-readiness.test.mts','skills/prism/tests/provider-cancellation.test.mts']
assert run('fixed-regression',new,args).returncode==0
assert run('types',new,['npm','run','typecheck','--prefix','skills/prism']).returncode==0
assert run('lint',new,['node','node_modules/eslint/bin/eslint.js','--config','charts/kubeclaw/files/config/eslint.config.mjs','skills/prism/server/worker-attempt.ts','skills/prism/server/worker-service.ts',file]).returncode==0
assert run('ownership',new,['node','scripts/check-runtime-package-ownership.mjs']).returncode==0
assert run('fixed-clean',new,['git','status','--porcelain']).stdout==''
print('original reproduces both disconnect failures; fixed regression and static checks pass; both source trees clean')
