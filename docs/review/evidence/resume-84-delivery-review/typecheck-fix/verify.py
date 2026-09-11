import pathlib,subprocess,json,hashlib
repo=pathlib.Path('/workspace/scratch/a51d993d444b/review-delivery-types-84')
output=pathlib.Path(__file__).resolve().parent
commands=[]
def run(name,args):
 r=subprocess.run(args,cwd=repo,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
 (output/(name+'.txt')).write_text(r.stdout)
 commands.append({'name':name,'args':args,'exitCode':r.returncode})
 (output/'commands.json').write_text(json.dumps(commands,indent=2)+'\n')
 return r
cases=[('prism','contracts/prism/v1','typecheck',['prism-contract-remediation.test.mts','prism-baseline-archive.test.mts','fixtures/prism-baseline-input.mts','fixtures/prism-baseline-locale.mts']),('http','skills/buster/plugins/http','build',['http-provider-live.test.ts']),('demo-auth-smoke','skills/buster/plugins/demo-auth-smoke','build',['demo-auth-smoke-live.test.ts'])]
membership=[]
for name,package,gate,files in cases:
 config='tests/verification/integration/tsconfig.'+name+'.json'
 listed=run(name+'-membership',['node','node_modules/typescript/bin/tsc','--listFilesOnly','-p',config]);assert listed.returncode==0
 for file in files:
  path=repo/'tests/verification/integration'/file
  assert str(path) in listed.stdout.splitlines(),str(path)
  membership.append({'path':str(path),'included':True})
 args=['npm','run',gate,'--prefix',package]
 assert run(name+'-before',args).returncode==0
 for index,file in enumerate(files):
  path=repo/'tests/verification/integration'/file;original=path.read_bytes()
  try:
   path.write_bytes(original+b'\nconst INDEPENDENT_TYPECHECK_SENTINEL: string = 840039;\n')
   negative=run(name+'-negative-'+str(index),args)
   assert negative.returncode!=0 and 'TS2322' in negative.stdout and pathlib.Path(file).name in negative.stdout
   if index==0:
    root_negative=run(name+'-root-negative',['npm','run','typecheck:integration'])
    assert root_negative.returncode!=0 and 'TS2322' in root_negative.stdout
  finally:path.write_bytes(original)
  assert path.read_bytes()==original
  membership[-1 if len(files)==1 else len(membership)-len(files)+index]['restoredSha256']=hashlib.sha256(original).hexdigest()
 assert run(name+'-restored',args).returncode==0
assert run('root-restored',['npm','run','typecheck:integration']).returncode==0
assert run('ownership',['node','scripts/check-runtime-package-ownership.mjs']).returncode==0
(output/'membership-and-restoration.json').write_text(json.dumps(membership,indent=2)+'\n')
status=run('source-status',['git','status','--porcelain']);assert status.stdout==''
print('all six files included; six original-gate negatives and three root negatives; all bytes restored; positive gates pass')
