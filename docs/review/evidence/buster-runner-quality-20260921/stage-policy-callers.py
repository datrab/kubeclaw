from pathlib import Path
import os,re,json,hashlib,subprocess
root=Path.cwd();out=Path(__file__).resolve().parent
fixture='tests/fixtures/test-gate/execution-policy.mts';p=out/'files'/fixture;p.parent.mkdir(parents=True,exist_ok=True);p.write_text('''import { canonicalSwarmEntry } from '../config/swarm-bundle.mjs';
import { loadSwarmSettings } from '../../../skills/common/plugin-runtime/foundation/config/swarm.ts';

/** Explicit test input read from the actual required component owner. Never fills omitted options. */
export const runnerExecutionPolicy = loadSwarmSettings({ SWARM_CONFIG: canonicalSwarmEntry }).buster.execution;
''')
r=subprocess.run(['rg','-l','workerLocalRuntime:|new RegisteredTestProviderLoader\\(','tests','skills/buster/engine/test-gates/tests'],capture_output=True,text=True,check=True)
rows=[]
for name in r.stdout.splitlines():
 live=root/name; target=out/'files'/name; before=out/'before'/name
 if not target.exists():
  before.parent.mkdir(parents=True,exist_ok=True);before.write_bytes(live.read_bytes());target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(live.read_bytes())
 old=target.read_text();new=re.sub(r'(?<!readonly )\bworkerLocalRuntime\s*:', 'executionPolicy: runnerExecutionPolicy, workerLocalRuntime:',old)
 new=new.replace('new RegisteredTestProviderLoader()', 'new RegisteredTestProviderLoader(runnerExecutionPolicy.observation)')
 if new==old:continue
 relative=os.path.relpath(fixture,Path(name).parent).replace(os.sep,'/');relative=relative if relative.startswith('.') else './'+relative
 new=f"import {{ runnerExecutionPolicy }} from '{relative}';\n"+new
 target.write_text(new);rows.append({'path':name,'beforeSha256':hashlib.sha256(before.read_bytes()).hexdigest(),'changes':'explicit executionPolicy at existing local-runtime input and/or explicit registered loader observation policy'})
# Two original Runner overrides move to the same actual policy owner input; retain their selected numbers.
p=out/'files/tests/verification/contracts/check-pipeline-test-plan-runner.mts';s=p.read_text()
for value in ['2_147_483_648','10']:
 needle='cleanupTimeoutMs: '+value+','
 assert s.count(needle)==1,(value,s.count(needle))
 # each options object already has executionPolicy inserted next to workerLocalRuntime.
 at=s.index(needle);previous=s.rfind('executionPolicy: runnerExecutionPolicy,',0,at)
 # verify object-local ordering; custom fixture may put cleanup before worker policy, then next occurrence.
 start=s.rfind('new LocalTestPlanRunner({',0,at);end=s.find('}).',at)
 if previous<start:previous=s.index('executionPolicy: runnerExecutionPolicy,',at)
 assert start<=previous and (end<0 or previous<end)
 replacement='executionPolicy: { ...runnerExecutionPolicy, provider: { ...runnerExecutionPolicy.provider, cleanupTimeoutMs: '+value+' } },'
 s=s[:previous]+s[previous:].replace('executionPolicy: runnerExecutionPolicy,',replacement,1);s=s.replace(needle,'',1)
# Original invalid cleanup still rejects, now at the new required policy decoder boundary.
s=s.replace('TEST_RUNNER_CLEANUP_TIMEOUT_INVALID','SWARM_CONFIG_BUSTER_EXECUTION_INVALID');p.write_text(s)
# Actual report-finalization fixture supplies central report policy explicitly.
name='skills/buster/engine/test-gates/tests/specialist-boundary.test.ts';p=out/'files'/name;live=root/name
if not p.exists():
 b=out/'before'/name;b.parent.mkdir(parents=True,exist_ok=True);b.write_bytes(live.read_bytes());p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(live.read_bytes())
s=p.read_text();relative=os.path.relpath(fixture,Path(name).parent).replace(os.sep,'/');s=f"import {{ runnerExecutionPolicy }} from '{relative}';\n"+s;s=s.replace('cleanupTimeoutMs: 1700,','cleanupTimeoutMs: 1700, reportPolicy: runnerExecutionPolicy.reports,');p.write_text(s)
(out/'execution-policy-caller-migration.json').write_text(json.dumps(rows,indent=2)+'\n')
print({'callerFiles':len(rows),'reportFixture':name})
