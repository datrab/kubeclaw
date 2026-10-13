from pathlib import Path
import json
B=Path('docs/review/evidence/config-acceptance/runtime/batches/21bf51b-standalone-remote-19');x=json.loads((B/'contracts-before-captured-content-clarification.json').read_text())
for e in x['entries']:
 if e['field']=='tokenEnvironmentVariable':
  e['current']+=' Actual HttpRemotePlanTransport captures resolved token STRING atconstruction; no execute-time ENV reread in standalone path (unlike registered adapter secret invocation).'
  e['targetDomain']=e['targetDomain'].replace('locator capture not content freezing.','Current standalone loaded instance captures token content; no later ENV reread. This is not authentic provisioning/immutable original-source proof; B rotation means new allowed instance, original A retains captured token.')
 if e['field']=='sourceAttestationPrivateKeyEnvironmentVariable':e['current']+=' Actual ProductionNovaTestGate captures exported PEM STRING atconstruction; no later ENV reread. This doesnot prove authentic issuer/key/role/provisioning or installedoriginal history.'
expected=json.dumps(x,indent=2)+'\n';assert expected==(B/'contracts-captured-content-corrected.json').read_text();print('exact retained-before -> active captured-content contract reproduction; no runtime/source action')
