"""Independent immutable successor source hash/sensitive scope and historical observation integrity checks."""
import pathlib,json,subprocess,hashlib
out=pathlib.Path(__file__).resolve().parent;repo=out.parents[4];base='6606af9e590032f328f330ecb3d953b1eef027e3';mapping=json.loads((out/'frozen-inputs/runtime-native-historical-successor-map.json').read_text());load=lambda p:json.loads(subprocess.check_output(['git','show',base+':'+p],cwd=repo));C=load('docs/review/evidence/config-acceptance/runtime/case-proposals.json');cases={c['id']:c for c in C};succ={s['caseId'] for r in mapping['records'] for s in r['oneToManyActiveCanonicalSuccessors']};issues=[];sourceRefs={};observations=[]
for id in sorted(succ):
 c=cases[id]
 for f,h in c.get('sourceDigests',{}).items():
  raw=subprocess.check_output(['git','show',base+':'+f],cwd=repo);actual=hashlib.sha256(raw).hexdigest();sourceRefs[f]=actual
  if actual!=h:issues.append({'case':id,'kind':'successor-sourcehash','path':f,'expected':h,'actual':actual})
 action=str(c.get('action',c.get('expectedEffect','')));kind='generated-attestation-vs-actual-target' if 'TARGET-ERRATUM' in id else 'grade-specific-contract-proposal'
 if kind=='generated-attestation-vs-actual-target' and ('not dispatch selection' not in action or 'SDK codec is finite encoding only' not in action):issues.append({'case':id,'kind':'attestation-dispatch-scope'})
 if 'TOKENIZERENCODING-GRADE-ALTERNATE' in id and ('Current source rejects B' not in action or 'after approved compatibility migration' not in action):issues.append({'case':id,'kind':'unsupported-codec-current-positive'})
 if 'MAXOUTPUTTOKENSPERJOB-GRADE-ALTERNATE' in id and ('Current A3000 rejects' not in action or 'No assertion' not in action):issues.append({'case':id,'kind':'unsupported-current-output-tuning'})
 if 'MAXCONTEXTTOKENSPERJOB-GRADE-ALTERNATE' in id and ('actual retained runtime context128000' not in action or 'BOTH rejected' not in action):issues.append({'case':id,'kind':'retained-context/current-guard'})
 observations.append({'case':id,'sourceCorrespondence':True,'result':c['result'],'scope':c['scope'],'classificationReview':kind,'field':c['inputProfile'].get('field') if isinstance(c.get('inputProfile'),dict) else None,'limit':'future spec remains not-run; source effect/alias/profile correctness not accepted from mapping counts'})
M=load('docs/review/remediation/config-acceptance-matrix.json');ref=M['nativeCasePackages'][0]['observationReferenceIntegrity'];obs=[]
for a in ref['artifacts']:
 raw=subprocess.check_output(['git','show',base+':'+a['path']],cwd=repo);actual=hashlib.sha256(raw).hexdigest();obs.append({'path':a['path'],'expected':a['sha256'],'actual':actual,'matches':actual==a['sha256']})
 if actual!=a['sha256']:issues.append({'kind':'historical-observation-artifact-drift','path':a['path']})
result={'scope':'every distinct356 existing successor source identity and material sensitive-case scope checks against immutable6606; historical schema/observer references unchanged, no semantic native acceptance','cases':observations,'sourceDigests':sourceRefs,'issues':issues,'historicalObservationReferenceOccurrencesRetained':ref['referenceOccurrencesValidated'],'historicalObservationArtifacts':obs,'materialSensitiveAssertions':'current onlyo200k; outputA3000 rejects; contextA14k/B18k bothrejectcurrent and target workloadquota distinct actualretained128k; attestationexpected config vs canonical dispatch target; no SDK codec businessselector'}
(out/'source-successor-scope-controls.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'successors':len(succ),'sourceFiles':len(sourceRefs),'historicalObservationArtifacts':len(obs),'issues':issues,'scope':'source/definition, no native acceptance'},indent=2));raise SystemExit(1 if issues else 0)
