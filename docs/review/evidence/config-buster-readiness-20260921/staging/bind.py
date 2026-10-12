from pathlib import Path
import json,hashlib,difflib,re,datetime,os
b=Path(__file__).parent;rows=[];patch=[];preservation=[]
for p in sorted((b/'files').rglob('*')):
 if not p.is_file():continue
 rel=p.relative_to(b/'files');old=b/'before'/rel;after=p.read_bytes();before=old.read_bytes() if old.exists() else b''
 rows.append({'path':str(rel),'beforeSha256':hashlib.sha256(before).hexdigest() if old.exists() else None,'afterSha256':hashlib.sha256(after).hexdigest(),'liveBaselineMatches':(Path(rel).read_bytes()==before) if old.exists() and Path(rel).exists() else not Path(rel).exists(),'liveSymlink':os.readlink(rel) if Path(rel).is_symlink() else None})
 patch.extend(difflib.unified_diff(before.decode().splitlines(True),after.decode().splitlines(True),fromfile='a/'+str(rel) if old.exists() else '/dev/null',tofile='b/'+str(rel)))
 if old.exists() and str(rel).startswith('tests/'):
  original=before.decode();current=after.decode()
  if 'new BusterRemotePlanService({' in original or 'new ModeledBusterRemotePlanService({' in original:
   restored=current.replace('\n    dependencyReadiness: { maximumExecutionMs: 1000, maximumOutputBytes: 65536 },','')
   assert restored==original,str(rel)
   preservation.append({'path':str(rel),'exactBodyAfterRemovingOnlyExplicitPolicyInsertions':True})
  elif rel.name=='check-pipeline-worker-local-config.mts':
   assert current.replace('const serviceOptions = { dependencyReadiness: { maximumExecutionMs: 1000, maximumOutputBytes: 65536 },','const serviceOptions = {')==original
   preservation.append({'path':str(rel),'exactBodyAfterRemovingOnlyExplicitPolicyInsertion':True})
  elif rel.name=='buster-readiness.test.mts':
   assertions=[line for line in original.splitlines() if 'assert.' in line]
   assert all(line in current.splitlines() for line in assertions)
   names=re.findall(r"test\('([^']+)'",original)
   assert names==re.findall(r"test\('([^']+)'",current)
   preservation.append({'path':str(rel),'originalCaseNames':names,'allOriginalAssertionLinesUnchanged':len(assertions),'limitsAndDeadlinesUnchanged': all(line in current.splitlines() for line in original.splitlines() if 'maximumExecutionMs:' in line or 'deadline=' in line)})
(b/'identities.json').write_text(json.dumps(rows,indent=2)+'\n');(b/'production.patch').write_text(''.join(patch));(b/'original-preservation.json').write_text(json.dumps(preservation,indent=2)+'\n')
commands=[['npm','run','verify:buster:readiness-config'],['node','--test','--test-concurrency=1','tests/verification/reliability/buster-admission-config.test.mts','tests/verification/reliability/buster-admission-cli.test.mjs','tests/verification/deployment/buster-admission-render.test.mjs'],['node','tests/verification/contracts/check-pipeline-remote-plan-runtime.mts'],['node','tests/verification/contracts/check-pipeline-remote-runtime-config.mts'],['node','tests/verification/contracts/check-pipeline-worker-local-config.mts'],['node','tests/verification/deployment/check-deployment-truth.mjs'],['node','--test','tests/verification/deployment/config-component-packaging.test.mjs']]
(b/'planned-checks.json').write_text(json.dumps({'executed':False,'note':'Requires integration/rebase plus coordinated tools/source binding. Use genuine GNU flock/native host tools and available Helm as in accepted original suites. Confirm package-script/path identities before execution.','commands':commands,'mutations':[{'env':{'BUSTER_READINESS_MUTATION':x},'command':['node','--import','./tests/fixtures/test-gate/buster-readiness-mutation.mjs','--test','tests/verification/reliability/buster-readiness-consumer.test.mts']} for x in ['restore-policy-default','restore-field-defaults','ignore-execution','ignore-output']],'types':['tests/verification/reliability/tsconfig.buster-readiness.json','skills/common/plugin-runtime/tsconfig.json','skills/buster/engine/tsconfig.json'],'lint':'All changed maintained TS/MTS/MJS using repository canonical ESLint configuration; no disables','boundAt':datetime.datetime.now(datetime.timezone.utc).isoformat()},indent=2)+'\n')
print(json.dumps({'files':len(rows),'baselineDrift':[r['path'] for r in rows if not r['liveBaselineMatches']],'preservedModules':len(preservation)}))
