import pathlib,hashlib,json,shutil
root=pathlib.Path.cwd();out=root/'docs/review/evidence/attempt-store-quality-20260921'
files=['skills/common/plugin-runtime/foundation/observability/'+n+'.ts' for n in ['durable-attempts','attempt-state','attempt-evidence','attempt-results','attempt-completeness','attempt-retirement']]
files += ['tests/verification/reliability/'+n for n in ['admission-retirement.test.mjs','attempt-projection-review.test.mjs','attempt-closure-projection.test.mjs','observability-replay.test.mjs','observability-retirement-plan.test.mjs','attempt-store-input-ownership.test.mjs']]
files += ['tests/verification/contracts/check-junit-executed-required.mts','docs/review/remediation/implementation/attempt-store-quality-20260921.md','docs/operations/observability-retention.md']
records=[]
for name in files:
 target=out/'source'/(name+'.snapshot' if name.endswith('.md') else name);target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(root/name,target)
 records.append({'path':name,'snapshot':str(target.relative_to(out)),'sha256':hashlib.sha256((root/name).read_bytes()).hexdigest()})
(out/'source-identities.json').write_text(json.dumps(records,indent=2)+'\n')
