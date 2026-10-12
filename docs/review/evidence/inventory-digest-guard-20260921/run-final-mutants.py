from pathlib import Path
import tempfile,subprocess,json
root=Path.cwd(); evidence=root/'docs/review/evidence/inventory-digest-guard-20260921'
source=(root/'scripts/observability-retirement/files.mjs').read_text()
variants={'stat-only':(' || (item.hash !== null && this.hashFile(item.path, stat) !== item.hash)',''), 'unbounded-chunk':('Math.min(buffer.length, before.size - size)','buffer.length')}
results=[]
for name,(old,new) in variants.items():
 assert source.count(old)==1
 with tempfile.TemporaryDirectory(prefix='inventory-final-mutant-') as d:
  private=Path(d); module=private/'scripts/observability-retirement/files.mjs'; test=private/'tests/verification/reliability/inventory-digest-guard.test.mjs'
  module.parent.mkdir(parents=True); test.parent.mkdir(parents=True)
  module.write_text(source.replace(old,new)); test.write_bytes((root/test.relative_to(private)).read_bytes())
  cmd=['/usr/local/bin/node','--test',str(test)]; result=subprocess.run(cmd,capture_output=True,text=True,timeout=30); output=result.stdout+result.stderr
  (evidence/('final-mutant-'+name+'.txt')).write_text(output)
  detected=result.returncode!=0 and 'fail 1' in output and 'pass 8' in output and 'AssertionError' in output
  results.append({'mutation':name,'command':cmd,'exitCode':result.returncode,'detected':detected})
(evidence/'final-mutants.json').write_text(json.dumps(results,indent=2)+'\n')
assert all(r['detected'] for r in results),results
