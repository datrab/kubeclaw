import importlib.util,pathlib,hashlib,json,sys,time,os
p=pathlib.Path('tests/fixtures/test-gate/legacy-seal-guest.py');before=hashlib.sha256(p.read_bytes()).hexdigest();spec=importlib.util.spec_from_file_location('reviewed_driver',p);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
assert os.geteuid()!=0
results=[]
def rejects(name,operation,text):
 start=time.monotonic()
 try:operation()
 except RuntimeError as e:
  assert text in str(e),(name,str(e));results.append(dict(name=name,rejected=str(e),seconds=time.monotonic()-start))
 else:raise AssertionError(name)
assert len(m.CASES)==27 and len(set(m.CASES))==27 and m.MAX_CASES==32
assert (m.CASE_SECONDS,m.TOTAL_SECONDS,m.OUTPUT_BYTES,m.MAX_BYTES,m.MAX_ENTRIES)==(10,120,262144,4194304,128)
assert m.bounded([sys.executable,'-c','print("positive")'],expected=0)['stdout']=='positive\n'
rejects('real child timeout',lambda:m.bounded([sys.executable,'-c','import time;time.sleep(10)'],seconds=.15),'CHILD_WATCHDOG')
rejects('real child output ceiling',lambda:m.bounded([sys.executable,'-c','print("x"*8192)'],seconds=1,output_limit=100),'CHILD_OUTPUT_LIMIT')
rejects('real child nonzero status',lambda:m.bounded([sys.executable,'-c','raise SystemExit(3)'],expected=0),'COMMAND_FAILED')
target='/var/lib/legacy-seal-tests/tree/special'
m.assert_audit(f'openat(3</var/lib/legacy-seal-tests/tree>, "special", O_PATH|O_NOFOLLOW) = 4<{target}>',[target])
rejects('audit catches reopened held device',lambda:m.assert_audit(f'openat(AT_FDCWD, "/proc/self/fd/4", O_RDONLY) = 5<{target}>',[target]),'SPECIAL_DATA_OPEN')
rejects('audit refuses missing observation',lambda:m.assert_audit('openat(1, "unrelated", O_PATH) = 3',[target]),'AUDIT_TARGET_NOT_OBSERVED')
assert hashlib.sha256(p.read_bytes()).hexdigest()==before
files=[p,pathlib.Path('tests/fixtures/test-gate/legacy-seal-capabilities.py'),pathlib.Path('scripts/buster-legacy-store-verify.py')]
result=dict(driverHash=before,cases=list(m.CASES),results=results,sourceHashes={str(f):hashlib.sha256(f.read_bytes()).hexdigest() for f in files},kernelExecution=False)
pathlib.Path('docs/review/evidence/buster-legacy-driver-fresh-20260921/result.json').write_text(json.dumps(result,indent=2)+'\n')
print(len(results),'negative controls passed; positive child/audit passed')
