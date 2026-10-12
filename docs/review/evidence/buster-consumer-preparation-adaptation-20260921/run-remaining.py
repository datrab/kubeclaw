from pathlib import Path
import json,subprocess
out=Path('docs/review/evidence/buster-consumer-preparation-adaptation-20260921')
rows=json.loads((out/'original-assertion-inventory.json').read_text())
excluded={'buster-job-compaction.test.mts','buster-shutdown-storage.test.mts','result-reservation.test.mts','check-pipeline-remote-plan-runtime.mts','nova-remote-faults.mts'}
for row in rows:
 file=row['path'];name=Path(file).name
 if name in excluded:continue
 command=['python3',str(out/'run-consumers.py'),name+'-run1',file]
 p=subprocess.run(command,timeout=250)
 print(name,'wrapper',p.returncode,flush=True)
