from pathlib import Path
import tempfile,subprocess,json,os
from collections import Counter
root=Path.cwd(); out=root/'docs/review/evidence/config-discovery-readers-20260921'; scanner=root/'scripts/config/inventory-settings.mjs'; source=scanner.read_text()
added="  for (const read of additionalEnvironmentReads(source)) {\n    const line = source.getLineAndCharacterOfPosition(read.node.getStart(source)).line + 1;\n    add(file, read.name, '(no inferred helper default)', 'environment string; validation review required', `${file}:${line}`, read.mechanism, line);\n  }\n"
assert source.count(added)==1
legacy=source.replace("import { additionalEnvironmentReads } from './environment-readers.mjs';\n",'').replace(added,'')
fd,name=tempfile.mkstemp(prefix='.legacy-discovery-',suffix='.mjs',dir=scanner.parent); os.close(fd); temporary=Path(name)
try:
 temporary.write_text(legacy)
 before=subprocess.run(['/usr/local/bin/node',str(temporary)],capture_output=True,text=True,check=True)
 after=subprocess.run(['/usr/local/bin/node',str(scanner)],capture_output=True,text=True,check=True)
 old=json.loads(before.stdout); new=json.loads(after.stdout)
 original=[e for e in new['entries'] if not e['override'].startswith(('local helper','computed environment'))]
 (out/'legacy-output.json').write_text(before.stdout)
 (out/'comparison-current-output.json').write_text(after.stdout)
 key=lambda e: json.dumps(e,sort_keys=True)
 old_counts=Counter(map(key,old['entries'])); new_counts=Counter(map(key,original))
 missing=list((old_counts-new_counts).elements()); added=list((new_counts-old_counts).elements())
 (out/'comparison-delta.json').write_text(json.dumps({'missing':missing,'added':added,'orderIdentical':original==old['entries']},indent=2)+'\n')
 assert old_counts==new_counts, 'Existing discovery candidates changed'
 (out/'legacy-comparison.json').write_text(json.dumps({'legacyCandidates':len(old['entries']),'currentCandidates':len(new['entries']),'legacyCandidatesUnchanged':True,'newCandidateCount':len(new['entries'])-len(old['entries'])},indent=2)+'\n')
 (out/'current-discovery.json').write_text(after.stdout)
finally: temporary.unlink()
