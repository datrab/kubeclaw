from pathlib import Path
import json, hashlib, subprocess, gzip, re, collections
R=Path.cwd(); O=R/'docs/review/evidence/config-acceptance/independent-core-source-question-bce3f075-20261013'; S=R/'docs/review/evidence/config-acceptance/components/source-candidates-bce3f075'; Q=S.parent/'question-closure-bce3f075'
H=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
load=lambda p:json.loads(Path(p).read_text())
receipt=load(O/'frozen-input-receipt.json'); drift=[p for p,v in receipt['files'].items() if H(R/p)!=v['sha256']]; assert not drift,drift
baseline=load(Q/'baseline-identities.json'); protected={}
for p,h in baseline['protectedCorrections'].items():
 assert H(p)==h,p
 data=Path(p).read_bytes(); dest=O/'frozen'/p;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data); protected[p]={'sha256':h,'bytes':len(data)}
coordinate=[]
for c in load(S/'candidate-dispositions.json')['candidates']:
 lines=Path(c['source']).read_text().splitlines(); coordinate.append({'id':c['id'],'source':c['source'],'line':c['line'],'actualText':lines[c['line']-1],'sha256':H(c['source']),'exactCoordinateValid':lines[c['line']-1]==c['exactText'] and H(c['source'])==c['sourceSha256'],'disposition':c['disposition'],'status':c['status'],'semanticAcceptance':False})
assert all(c['exactCoordinateValid'] for c in coordinate)
(O/'all-candidate-coordinate-review.json').write_text(json.dumps(coordinate,indent=2)+'\n')
# Independently expand the actual named environment helper, including its generated native scope caller.
text=Path('skills/buster/engine/test-gates/preparation-host.ts').read_text(); calls=[{'name':m.group(1),'line':text[:m.start()].count('\n')+1} for m in re.finditer(r"environment\('([^']+)'\)",text)]; original=load(S/'dynamic-assigned-env.json')['readsites'][0]
(O/'dynamic-environment-counterexample.json').write_text(json.dumps({'source':'skills/buster/engine/test-gates/preparation-host.ts','sourceSha256':H('skills/buster/engine/test-gates/preparation-host.ts'),'actualLiteralCallers':calls,'publishedLiteralCallerExpansions':original['literalCallerExpansions'],'scopeProducer':'skills/worker/core/worker/native-worker-launcher.c:103 setenv KUBECLAW_NATIVE_SCOPE from pinned parent_path','finding':'Computed reader named environment is not expanded by the assigned-only discovery; five assigned inputs and generated scope must each have exact caller/producer records, not empty caller list plus producer summary.'},indent=2)+'\n')
# Full provided AST default roster, ENV roster and native CLI field roster retained with exact source context.
contexts={}
for file,key in [('parameter-default-dispositions.json','members'),('environment-read-dispositions.json','actualReadsites'),('native-cli-dispositions.json','fields')]:
 rows=load(S/file)[key]; result=[]
 for row in rows:
  src=row.get('source',row.get('path')); line=row.get('line'); lines=Path(src).read_text().splitlines(); result.append({'record':row,'sourceSHA256':H(src),'sourceContext': [{'line':i+1,'text':lines[i]} for i in range(max(0,(line or 1)-4),min(len(lines),(line or len(lines))+5))],'scope':'Independent source-coordinate/context review; not a blanket semantic closure'})
 contexts[file]=result
(O/'defaults-env-cli-review.json').write_text(json.dumps(contexts,indent=2)+'\n')
result={'scope':'Full supplied roster/coordinates/default/ENV/CLI context audit; independent semantic findings in separate report. Counts never imply source closure.','inputDrift':drift,'candidateCoordinates':len(coordinate),'protectedCore13Inputs':protected,'questionIds':[q['id'] for q in load(Q/'question-definitions.json')['questions']],'caseIds':[c['id'] for c in load(Q/'question-case-specs.json')['activeCases']],'currentHead':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'tools':{'python':subprocess.check_output(['python3','--version'],text=True).strip(),'node':subprocess.check_output(['node','--version'],text=True).strip()},'inputs':{str(p.relative_to(R)):H(p) for p in [R/'package-lock.json',R/'docs/review/remediation/OPENCLAW-CONFIG-GOAL.md',Path(__file__).resolve()]}}
(O/'independent-audit.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
