import ast,pathlib,json,hashlib,stat,types
P=pathlib.Path('tests/fixtures/test-gate/legacy-seal-guest.py');O=pathlib.Path('docs/review/evidence/buster-legacy-descendant-cases-20260921');before=ast.parse((O/'before.py.snapshot').read_text());after=ast.parse(P.read_text()); names={'foreign-descendant','writable-descendant'}
class Strip(ast.NodeTransformer):
 def visit_Assign(self,n):
  if any(isinstance(t,ast.Name) and t.id=='CASES' for t in n.targets):n.value.elts=[e for e in n.value.elts if e.value not in names]
  return n
 def visit_If(self,n):
  if any(isinstance(t,ast.Constant) and t.value in names for t in ast.walk(n.test)):return [self.visit(x) for x in n.orelse]
  return self.generic_visit(n)
assert ast.dump(Strip().visit(ast.parse(P.read_text())))==ast.dump(before)
caseassign=next(n for n in after.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='CASES' for t in n.targets));cases=ast.literal_eval(caseassign.value);assert len(cases)==29
branch=next(n for n in ast.walk(after) if isinstance(n,ast.If) and ast.unparse(n.test)=="case in ('foreign-descendant', 'writable-descendant')")
code=compile(ast.fix_missing_locations(ast.Module(body=branch.body,type_ignores=[])),str(P),'exec')
class Target:
 def __init__(self,uid,mode):self.uid=uid;self.mode=mode
 def __truediv__(self,other):return self
 def stat(self):return types.SimpleNamespace(st_uid=self.uid,st_gid=0,st_mode=self.mode)
def require(ok,error):
 if not ok:raise RuntimeError(error)
results=[]
for case,uid,mode,immutable,expected in [('foreign-descendant',1000,0o100644,True,None),('writable-descendant',0,0o40775,True,None),('foreign-descendant',0,0o100644,True,'DESCENDANT_AUTHORITY_PREREQUISITE'),('writable-descendant',0,0o40755,True,'DESCENDANT_AUTHORITY_PREREQUISITE'),('writable-descendant',0,0o40775,False,'DESCENDANT_SEAL_PREREQUISITE')]:
 calls=[];env={'case':case,'tree':Target(uid,mode),'stat':stat,'require':require,'flags':lambda p:16 if immutable else 0,'IMMUTABLE':16,'entries':lambda p:[p],'emit':lambda r:calls.append(r),'verified':lambda *a:calls.append(a[-1]),'args':None};error=None
 try:exec(code,env)
 except RuntimeError as e:error=str(e)
 assert error==expected
 if expected:assert not calls
 else:assert calls[-1]=='AUTHORITY_INVALID'
 results.append({'case':case,'mode':oct(mode),'uid':uid,'immutable':immutable,'error':error})
result={'sha256':hashlib.sha256(P.read_bytes()).hexdigest(),'original27AndAllOtherAstUnchanged':True,'cases':len(cases),'modeledBranchChecks':results,'privilegedExecution':False};(O/'checks.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
