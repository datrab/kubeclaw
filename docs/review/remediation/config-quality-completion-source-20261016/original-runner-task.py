import subprocess,json,time,pathlib
p=pathlib.Path(__file__).parent
start=time.monotonic()
with (p/'original-runner.txt').open('w') as f:
 try:
  r=subprocess.run(['node','tests/verification/contracts/check-pipeline-test-plan-runner.mts'],stdout=f,stderr=subprocess.STDOUT,timeout=210)
  result={'exitCode':r.returncode,'elapsedSeconds':round(time.monotonic()-start,2)}
 except subprocess.TimeoutExpired:
  result={'exitCode':124,'elapsedSeconds':round(time.monotonic()-start,2),'error':'210-second test process deadline'}
(p/'original-runner-result.json').write_text(json.dumps(result,indent=2)+'\n')
