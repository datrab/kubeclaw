import hashlib,json,pathlib,shutil
root=pathlib.Path.cwd();out=root/'docs/review/evidence/attempt-closure-projection-20260921'
files=[
'skills/common/plugin-runtime/foundation/observability/'+name+'.ts' for name in ['attempt-projection','closure-projection','attempt-replay','durable-attempts','admission-retirement']]
files += ['scripts/retire-attempt-result.mjs','scripts/retire-attempt-closure.mjs']
files += ['tests/verification/reliability/'+name for name in ['admission-retirement.test.mjs','attempt-projection-review.test.mjs','attempt-closure-projection.test.mjs','attempt-retirement-fixture.mjs']]
files += ['docs/operations/observability-retention.md','docs/review/remediation/implementation/attempt-closure-projection-20260921.md']
records=[]
for name in files:
 source=root/name;target=out/'source'/(name+'.snapshot' if name.endswith('.md') else name);target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source,target)
 records.append({'path':name,'snapshot':str(target.relative_to(out)),'sha256':hashlib.sha256(source.read_bytes()).hexdigest()})
(out/'source-identities.json').write_text(json.dumps(records,indent=2)+'\n')
