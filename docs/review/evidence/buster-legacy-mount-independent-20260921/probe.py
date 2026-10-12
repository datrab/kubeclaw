import ast,pathlib,hashlib,json,ctypes,os
R=pathlib.Path.cwd(); p=R/'tests/fixtures/test-gate/legacy-seal-guest.py'; old=R/'node_modules/.cache/buster-legacy-seal-vm-20260921/repo-snapshot/tests/fixtures/test-gate/legacy-seal-guest.py'; a=ast.parse(old.read_text());b=ast.parse(p.read_text());
def scrub(tree):
 tree.body=[n for n in tree.body if not isinstance(n,ast.FunctionDef) or n.name!='private_mounts']
 for n in ast.walk(tree):
  if isinstance(n,ast.Call) and isinstance(n.func,ast.Name) and n.func.id=='tool' and len(n.args)>1 and isinstance(n.args[1],ast.Constant) and n.args[1].value=='--bind': n.args[1:2]=[ast.Constant('-o'),ast.Constant('bind')]
 return ast.dump(tree,include_attributes=False)
assert scrub(a)==scrub(b)
fn=next(n for n in ast.parse(p.read_text()).body if isinstance(n,ast.FunctionDef) and n.name=='private_mounts');code=compile(ast.Module(body=[fn],type_ignores=[]),str(p),'exec')
class F:
 def __init__(self,name,result,calls): self.name=name;self.result=result;self.calls=calls
 def __call__(self,*args): self.calls.append([self.name,args]);return self.result
class C:
 c_int=ctypes.c_int;c_char_p=ctypes.c_char_p;c_ulong=ctypes.c_ulong;c_void_p=ctypes.c_void_p
 def __init__(self,u,m):
  self.calls=[];self.unshare=F('unshare',u,self.calls);self.mount=F('mount',m,self.calls)
 def CDLL(self,*args,**kw):return self
 def get_errno(self):return 1
def require(ok,msg):
 if not ok:raise RuntimeError(msg)
rows=[]
for u,m in [(0,0),(-1,0),(0,-1)]:
 c=C(u,m);ns={'ctypes':c,'os':os,'require':require};exec(code,ns);error=None
 try:ns['private_mounts']()
 except (RuntimeError,OSError) as e:error=str(e)
 assert c.calls[0]==['unshare',(0x20000,)]
 if u:assert len(c.calls)==1 and 'MOUNT_NAMESPACE_PREREQUISITE' in error
 else:
  assert c.calls[1]==['mount',(None,b'/',None,16384|(1<<18),None)]
  assert (error is None) if m==0 else 'PRIVATE_MOUNT_PREREQUISITE' in error
 rows.append({'unshareReturn':u,'mountReturn':m,'error':error,'callCount':len(c.calls)})
out={'driverSha256':hashlib.sha256(p.read_bytes()).hexdigest(),'allOtherAstIdentical':True,'caseCount':27,'modeledCallBoundaryOnly':rows,'realMountOrNamespaceExecuted':False};pathlib.Path('docs/review/evidence/buster-legacy-mount-independent-20260921/result.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out))
