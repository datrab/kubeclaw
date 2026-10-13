from pathlib import Path
import json,hashlib
P=Path('docs/review/evidence/config-acceptance/runtime');B=P/'batches/bce3f075-repository-lint-11';C=json.loads((P/'case-proposals.json').read_text());count=0
for c in C:
 if '-REPOLINT11-CURRENT-DEFINITION' not in c['id']:continue
 x=c['expectedEffectOrRejectingBoundary']['immutableObservationReference'];c['expectedEffectOrRejectingBoundary']={'kind':'immutable-observation-reference','artifactPath':x['artifact'],'rfc6901Pointer':x['jsonPointer'],'artifactSha256':hashlib.sha256(Path(x['artifact']).read_bytes()).hexdigest(),'valueSha256':x['canonicalValueSha256']};count+=1
assert count==16;(P/'case-proposals.json').write_text(json.dumps(C,indent=2)+'\n');print('Corrected only16 new observation references to parent immutable resolver format; original5713 cases untouched. First integrator script retained.')
