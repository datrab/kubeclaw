from pathlib import Path
import json
B=Path('docs/review/evidence/config-acceptance/runtime/batches/6606af9-demo-adapter-15');p=B/'observations.json';x=json.loads(p.read_text())
for r in x['results']:r['scope']=r['scope'].replace('no files opened/read/written, realgrant','no credential/state files opened/read/written by adapter constructor, realgrant')
x['historicalRunScriptIdentity']=x['testDigests'];x['scopeClarification']='Only adapter credential/state I/O is absent; probe reads source/schema inputs and writes documentation observations. Actual run script/source originalidentity+rawlog preserved; no additional consumerexecution.';p.write_text(json.dumps(x,indent=2)+'\n');print('Narrowed documentation I/O wording only; actual current constructor controls unchanged; rawobservations/command/log preserved.')
