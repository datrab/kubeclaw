from pathlib import Path
import os,subprocess,json
root=Path.cwd();out=root/'docs/review/evidence/wait-value-retirement-20260921';tool=root/'node_modules/.cache/native-host-tools/root'
base=dict(os.environ,LD_LIBRARY_PATH=str(tool/'usr/lib')+':'+str(tool/'lib'))
node=[str(tool/'usr/bin/proot'),'-b',str(tool/'usr/bin/flock')+':/usr/bin/flock!','/usr/local/bin/node']
results=[]
for mode,pattern,diagnostic in [('events-prefix','retained original prefix mutation','Missing expected rejection'),('receipt-authority','wrong source/receipt identities','Missing expected rejection'),('original-wait-digest','existing operator projection receipt','OPERATOR_PROJECTION_AUTHORITY_REQUIRED'),('selected-audience','Core exposes retained','Expected values to be strictly equal')]:
 command=node+['--import',str(out/'mutant.mjs'),'--test','--test-concurrency=1','--test-name-pattern='+pattern,('tests/verification/reliability/wait-resolver-audience.test.mjs' if mode=='selected-audience' else 'tests/verification/reliability/wait-value-projection.test.mjs')]
 with (out/('mutant-'+mode+'.txt')).open('w') as log:process=subprocess.run(command,env=dict(base,WAIT_PROJECTION_MUTANT=mode),stdout=log,stderr=subprocess.STDOUT,timeout=120)
 text=(out/('mutant-'+mode+'.txt')).read_text()
 detected=process.returncode!=0 and 'SEMANTIC_MUTANT_APPLIED:'+mode in text and diagnostic in text
 results.append({'mode':mode,'command':command,'exitCode':process.returncode,'expectedDiagnostic':diagnostic,'semanticFailureDetected':detected})
 (out/'mutants.json').write_text(json.dumps(results,indent=2)+'\n');print(mode,process.returncode,detected,flush=True)
 if not detected:raise SystemExit(1)
