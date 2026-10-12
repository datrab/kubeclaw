"""Nonprivileged source regression checks; never invokes mount/unshare."""
import ast,hashlib,json,os,subprocess
from pathlib import Path
out=Path(__file__).parent;file=Path('tests/fixtures/test-gate/legacy-seal-guest.py')
before=ast.parse((out/'driver-before.py.snapshot').read_text());after=ast.parse(file.read_text())
def assignment(tree,name):return next(n.value for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id==name for target in n.targets for t in ast.walk(target)))
assert ast.dump(assignment(before,'CASES'))==ast.dump(assignment(after,'CASES'))
assert len(ast.literal_eval(assignment(after,'CASES')))==27
for name in ('MAX_BYTES','CASE_SECONDS'):
 assert ast.dump(assignment(before,name))==ast.dump(assignment(after,name))
helper=next(n for n in after.body if isinstance(n,ast.FunctionDef) and n.name=='private_mounts')
calls=[n for n in ast.walk(helper) if isinstance(n,ast.Call)]
mount=next(n for n in calls if ast.unparse(n.func)=='libc.mount')
assert ast.unparse(mount)=="libc.mount(None, b'/', None, 16384 | 1 << 18, None)"
assert not any(ast.unparse(n.func)=='tool' for n in calls)
# Every remaining CLI mount has explicit source+target; bind uses documented -o form.
mounts=[n for n in ast.walk(after) if isinstance(n,ast.Call) and ast.unparse(n.func)=='tool' and n.args and isinstance(n.args[0],ast.Constant) and n.args[0].value=='mount']
assert len(mounts)==5
assert sum(len(n.args)==5 and ast.literal_eval(n.args[1])=='-o' and ast.literal_eval(n.args[2])=='bind' for n in mounts)==2
assert sum(len(n.args)==7 and ast.literal_eval(n.args[2])=='tmpfs' for n in mounts)==2
assert sum(len(n.args)==5 and ast.literal_eval(n.args[2])=='ext4' for n in mounts)==1
assert os.getuid()!=0
help_result=subprocess.run(['python3','-I',str(file),'--help'],capture_output=True,text=True);assert help_result.returncode==0
args=['python3','-I',str(file)]
for key,p in [('driver',file),('verifier',Path('scripts/buster-legacy-store-verify.py')),('capability-child',Path('tests/fixtures/test-gate/legacy-seal-capabilities.py'))]:args+=['--'+key,str(p.resolve()),'--'+key+'-sha256',hashlib.sha256(p.read_bytes()).hexdigest()]
args+=['--ext4-device','/dev/vda','--second-ext4-device','/dev/vdb'];result=subprocess.run(args,capture_output=True,text=True);assert result.returncode==1 and 'GUEST_ROOT_REQUIRED' in result.stderr
(out/'checks.json').write_text(json.dumps({'casesPreserved':27,'resourceConstantsPreserved':True,'directMountSignatureAndFlagsChecked':True,'explicitCliMountForms':len(mounts),'helpExit':help_result.returncode,'nonrootExit':result.returncode,'nonrootStderr':result.stderr,'privilegedCallsExecuted':False},indent=2)+'\n')
print('source/help/nonroot checks passed; no privileged calls')
