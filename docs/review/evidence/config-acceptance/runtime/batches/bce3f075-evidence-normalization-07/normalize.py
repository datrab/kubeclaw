"""Reversible observation-only normalization; no semantic/case acceptance edits."""
from pathlib import Path
import json,gzip,hashlib,subprocess
P=Path('docs/review/evidence/config-acceptance/runtime');B=P/'batches/bce3f075-evidence-normalization-07';F=P/'case-proposals.json';sha=lambda v:hashlib.sha256(v).hexdigest();canonical=lambda v:json.dumps(v,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode();archive=B/'before-case-proposals.json.gz';original=F.read_bytes()
if not archive.exists():archive.write_bytes(gzip.compress(original,mtime=0))
else:original=gzip.decompress(archive.read_bytes())
C=json.loads(original);edits=[];artifacts={};groups=[('BROWSER04','bce3f075-browser-04','actualSourceObservations'),('NETWORK05','bce3f075-network-05','currentSourceObservation'),('ARTIFACTBUDGET06','bce3f075-artifact-budget-06','currentSourceObservation')]
for suffix,batch,field in groups:
 artifact=P/'batches'/batch/'observations.json';raw=artifact.read_bytes();O=json.loads(raw);artifact_sha=sha(raw);artifacts[str(artifact)]={'sha256':artifact_sha,'bytes':len(raw)};observations={o['setting']:(idx,o)for idx,o in enumerate(O['observations'])}
 for c in C:
  if '-'+suffix+'-'not in c['id']or not isinstance(c.get('inputProfile'),dict):continue
  profile=c['inputProfile'];setting=c['settings'][0]
  for key,pointer,value in [(field,'/observations/'+str(observations[setting][0]),observations[setting][1]),('actualBoundaryExtras','/special',O['special'])]:
   if key not in profile:continue
   assert profile[key]==value,(c['id'],key,'repeated observation differs from exactartifact; no rewrite permitted')
   ref={'kind':'immutable-observation-reference','artifactPath':str(artifact),'rfc6901Pointer':pointer,'artifactSha256':artifact_sha,'valueSha256':sha(canonical(value))}
   edits.append({'caseId':c['id'],'inputProfileField':key,'reference':ref,'originalCanonicalValueSha256':ref['valueSha256']});profile[key]=ref
normalized=(json.dumps(C,indent=2)+'\n').encode();F.write_bytes(normalized)
manifest={'status':'reversible observation-only normalization; no semantic acceptance','sourceCommit':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'sourceTree':subprocess.check_output(['git','rev-parse','HEAD^{tree}'],text=True).strip(),'beforeRawArtifact':str(archive),'beforeGzipSha256':sha(archive.read_bytes()),'beforeRawSha256':sha(original),'beforeRawBytes':len(original),'afterArtifact':str(F),'afterRawSha256':sha(normalized),'afterRawBytes':len(normalized),'canonicalValueEncoding':'JSON sortedkeys compactseparators ensure_ascii:false UTF8, exact JSONobject equivalence; whole beforebyte snapshot separately verified','artifacts':artifacts,'edits':edits,'unchanged':'requiredcase IDs/settings/requirements/results/oracles/fullA/B/negative/source/target configprofiles/source+test+input digests/rawlogs/history; ONLY repeated observation/special payloads replaced with exact immutable references','recovery':'gzip-decompress beforeRawArtifact, verify beforeRawSha256, restores exact pre-normalization casebody bytes; check.py reconstructs normalizedreferences and verifies exactoriginal object/fullcases; no acceptance/implementation credit'};(B/'normalization-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');print(json.dumps({k:manifest[k]for k in ['beforeRawBytes','afterRawBytes','beforeRawSha256','afterRawSha256']},indent=2));print('replaced observation objects',len(edits),'cases unchanged',len(C))
