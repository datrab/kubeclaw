"""Source-extracted scalar/call checks only; never calls setrlimit or QEMU."""
import ast,json,types
from pathlib import Path
source=Path('docs/review/evidence/buster-legacy-seal-vm-20260921/launch-smaller-as.py').read_text();tree=ast.parse(source)
constants=[n for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id in ('INITIAL_MEMORY_LIMIT','QEMU_AS_LIMIT') for t in n.targets)]
invariant=next(n for n in tree.body if isinstance(n,ast.Assert))
def execute(nodes,env):exec(compile(ast.Module(body=nodes,type_ignores=[]),'<extracted-source>','exec'),env)
env={};execute(constants+[invariant],env);assert env['INITIAL_MEMORY_LIMIT']==768*1024**2 and env['QEMU_AS_LIMIT']==1792*1024**2
try:execute([invariant],dict(env,QEMU_AS_LIMIT=2048*1024**2))
except AssertionError:pass
else:raise AssertionError('uncoupled profile accepted')
start=next(i for i,n in enumerate(tree.body) if isinstance(n,ast.If) and 'Required charged-memory' in ast.unparse(n));nodes=tree.body[start:start+3]
for size,passes in [(768*1024**2,True),(768*1024**2+1,False)]:
 context=dict(env,maximum=3*1024**3,statistics={'anon':str(size),'kernel':'0','shmem':'0'})
 try:execute(nodes,context);assert passes
 except SystemExit:assert not passes
for statistics in ({'anon':'0','kernel':'0'},{'anon':'0','kernel':'-1','shmem':'0'},{'anon':'bad','kernel':'0','shmem':'0'}):
 try:execute(nodes,dict(env,maximum=3*1024**3,statistics=statistics))
 except (SystemExit,ValueError):pass
 else:raise AssertionError('invalid accounting accepted')
calls=[]; fake=types.SimpleNamespace(RLIMIT_AS='AS',RLIMIT_CPU='CPU',RLIMIT_CORE='CORE',setrlimit=lambda k,v:calls.append((k,v)))
context=dict(env,resource=fake,coordinator_pid=73,signal=types.SimpleNamespace(SIGKILL=9),ctypes=types.SimpleNamespace(CDLL=lambda *a,**k:types.SimpleNamespace(prctl=lambda *a:0)),os=types.SimpleNamespace(getppid=lambda:73,nice=lambda n:None,_exit=lambda n:(_ for _ in ()).throw(AssertionError('preexec exited'))))
execute([next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='limits')],context);context['limits']();assert calls==[('AS',(1792*1024**2,1792*1024**2)),('CPU',(1200,1210)),('CORE',(0,0))]
assert 'preexec_fn=limits' in source
print(json.dumps({'sourceExtractedChecks':7,'passed':True,'recordedLimitCalls':calls,'realSetrlimitExecuted':False,'vmBooted':False}))
