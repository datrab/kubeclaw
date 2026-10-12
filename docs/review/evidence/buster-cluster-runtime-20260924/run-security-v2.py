import pathlib,os,json,subprocess,shutil,time,importlib.util,re,hashlib,argparse
parser=argparse.ArgumentParser()
parser.add_argument("--manifest", required=True)
parser.add_argument("--checks-plan", required=True)
parser.add_argument("--phase", choices=["fast", "lint", "runtime", "controls", "probe", "ci2", "ci2-controls"], required=True)
parser.add_argument("--run", required=True)
args=parser.parse_args()
assert re.fullmatch(r"[a-z0-9-]+", args.run)
root=pathlib.Path.cwd(); here=root/'docs/review/evidence/independent-buster-runner-execution-child-20260921'; shared=root/'docs/review/evidence/independent-component-worker-listener-20260921'; author=root/'docs/review/evidence/config-buster-readiness-20260921/review-runner'
spec=importlib.util.spec_from_file_location('binding',shared/'bind.py'); b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
plan=json.loads((shared/'plan.json').read_text());plan['dependencyRoots'].append('/usr/local/lib/node_modules/npm');out=pathlib.Path(__file__).resolve().parent/args.run;out.mkdir(exist_ok=False);(out/'trace').mkdir();node=shutil.which('node');native=root/plan['toolRoot']
protected=[]
for chart in ['prism','kubeclaw']:
 for p in (root/f'charts/{chart}/files/config').rglob('*.json'):
  p=p.resolve();s=p.stat();protected.append({'path':str(p),'dev':str(s.st_dev),'ino':str(s.st_ino)})
b.write_json(out/'protected.json',protected)
env=dict(os.environ,LD_LIBRARY_PATH=f'{native}/usr/lib:{native}/lib',LC_GNU_FLOCK=str(native/'usr/bin/flock'),LC_TOOL_MAPPING_LOG=str(out/'tools.jsonl'),KUBECLAW_TEST_TAR=str(native/'bin/tar'),COMPONENT_REVIEW_TRACE_DIRECTORY=str(out/'trace'),COMPONENT_REVIEW_PROTECTED_SOURCES=str(out/'protected.json'),COMPONENT_REVIEW_WRITE_VIOLATIONS=str(out/'violations.jsonl'))
env['PATH']=str(root/'node_modules/.bin')+os.pathsep+env.get('PATH','')
assert not env.get('NODE_OPTIONS');env['NODE_OPTIONS']=f'--import={shared / "source-write-guard.mjs"} --import={shared / "runtime-trace.mjs"} --import={pathlib.Path(__file__).resolve().parent / "tool-paths.mjs"}'
extra=[here/'run-fast.py',shared/'bind.py',shared/'runtime-trace.mjs',shared/'source-write-guard.mjs',pathlib.Path(__file__).resolve().parent/'tool-paths.mjs',author/'tool-effects.mjs']+[pathlib.Path(shutil.which(t)).resolve() for t in plan['requiredTools']]
libs=[]
for exe in [node,str(native/'usr/bin/flock'),str(native/'bin/tar'),str(root/'skills/common/plugin-runtime/foundation/isolation/plugin-sandbox')]:
 r=subprocess.run(['ldd',exe],env=env,capture_output=True,text=True); text=r.stdout+r.stderr;libs.append({'executable':exe,'code':r.returncode,'output':text})
 for name in re.findall(r'/[^\s()]+',text):
  p=pathlib.Path(name)
  if p.is_file():extra.append(p.resolve())
b.write_json(out/'libraries.json',libs)
manifest_path=root/args.manifest
manifest=json.loads(manifest_path.read_text())
final=manifest['files']
for row in final:
 path=root/row['path']
 assert hashlib.sha256(path.read_bytes()).hexdigest()==row['sha256'], 'INTEGRATED_SOURCE_MISMATCH:'+row['path']
 if row.get('kind')=='file':
  assert path.is_file() and not path.is_symlink(), 'INTEGRATED_FILE_KIND_MISMATCH:'+row['path']
 if row.get('kind')=='symlink':
  assert path.is_symlink() and str(path.readlink())==row['linkTarget'], 'INTEGRATED_LINK_MISMATCH:'+row['path']
b.write_json(out/'handoff-verified.json',final)
extra.extend([manifest_path, shared/'plan.json'])
if args.phase=='runtime':
 tools_report_path=root/'docs/review/evidence/runtime-security-test-tools-20260924/preparation-result.json'
 tools_report=json.loads(tools_report_path.read_text())
 scanner=pathlib.Path(tools_report['testEnvironment']['KUBECLAW_SECURITY_TEST_TRIVY'])
 assert b.digest(scanner)==tools_report['scanner']['binarySha256'], 'SCANNER_IDENTITY_MISMATCH'
 env.update(tools_report['testEnvironment'])
 extra.extend([tools_report_path,scanner])
 cache=pathlib.Path(tools_report['testEnvironment']['KUBECLAW_SECURITY_TEST_CACHE'])
 for database in tools_report['freshResolve']['databases']:
  directory='db' if database['kind']=='vulnerability' else 'java-db'
  for name, identity in database['verifiedOciIdentity']['files'].items():
   database_file=cache/directory/name
   assert database_file.stat().st_size==identity['size'] and 'sha256:'+b.digest(database_file)==identity['digest'], 'DATABASE_IDENTITY_MISMATCH'
   extra.append(database_file)
 b.write_json(out/'scanner-test-environment.json',tools_report['testEnvironment'])
extra.extend(root/row['path'] for row in final)
checks_plan_path=root/args.checks_plan
checks_plan=json.loads(checks_plan_path.read_text())
extra.append(checks_plan_path)
ci2_specs=pathlib.Path(__file__).resolve().parent/'security-control-specs-lint-v2.json'
if args.phase in ['ci2','ci2-controls']:
 extra.append(ci2_specs)
 controls=json.loads(ci2_specs.read_text())['controls']
if args.phase in ['fast','lint']:
 projects=list(dict.fromkeys(['skills/buster/engine/tsconfig.json','skills/common/plugin-runtime/tsconfig.json','skills/nova/tsconfig.json','scripts/tsconfig.json',*checks_plan['types']]))
 commands=[('types-'+str(i+1),[node,'node_modules/typescript/bin/tsc','--noEmit','-p',p]) for i,p in enumerate(projects)]
 lint=[r['path'] for r in final if pathlib.Path(r['path']).suffix in ['.ts','.mts','.mjs','.cjs']]
 commands.append(('canonical-lint',[node,'node_modules/eslint/bin/eslint.js','--config','charts/kubeclaw/files/config/eslint-config.mjs',*lint]))
 commands.append(('shell-syntax',['sh','-n','docker/buster-runtime-entrypoint.sh']))
 if args.phase=='lint': commands=[c for c in commands if not c[0].startswith('types-')]
elif args.phase=='probe':
 probe=pathlib.Path(__file__).resolve().parent/'tool-paths-probe.mjs'
 extra.append(probe)
 commands=[('tool-probe',[node,str(probe)])]
elif args.phase=='ci2':
 commands=[('ci2',[node,'--test','--test-concurrency=1',*list(dict.fromkeys(c['test'] for c in controls))])]
elif args.phase=='ci2-controls':
 mutation_hook=pathlib.Path(__file__).resolve().parent/'mutate-ci2.mjs'
 extra.append(mutation_hook)
 commands=[('control-'+c['name'],[node,'--test','--test-concurrency=1',c['test']]) for c in controls]
elif args.phase in ['controls','ci2-controls']:
 mutation_hook=pathlib.Path(__file__).resolve().parent/'mutate.mjs'
 extra.append(mutation_hook)
 commands=[('control-'+name,[node,'--test','--test-concurrency=1',f'tests/verification/contracts/buster-cluster-{module}-consumers.test.mjs']) for name,module in checks_plan['mutants'].items()]
else:
 checks=[[node,'--test','--test-concurrency=1','tests/verification/deployment/eslint-infrastructure-boundaries.test.mjs'],[node,'--test','--test-concurrency=1','tests/verification/contracts/buster-runtime-security-policy.test.mjs'],['npm','run','verify:test-gate:security-cutover'],['npm','run','verify:buster:cluster-policy']]
 checks.append([node,'--test','--test-concurrency=1',*checks_plan['originalModules']])
 checks.extend([node,p] for p in checks_plan['originalScripts'])
 checks.extend([['npm','run',name] for name in ['verify:buster:kubernetes-cleanup','verify:buster:scheduler-drain','verify:buster:execution-config','verify:config:components','verify:buster:readiness-config','verify:test-gate:tailscale-exposure-cutover']])
 commands=[('runtime-'+str(i+1),cmd) for i,cmd in enumerate(checks)]
b.write_json(out/'commands.json',commands)
extra.append(pathlib.Path(__file__).resolve())
extra.extend([root/'docs/architecture/buster-runner-failure-drain.md',root/'docs/review/remediation/implementation/runner-scheduler-drain-20260921.md',root/'docs/review/remediation/implementation/provider-disposal-confirmation-20260921.md'])
compiler=root/'docs/review/evidence/native-aggregate-topology-20260921/compiler-bin/cc';extra.append(compiler);env['PATH']=str(compiler.parent)+os.pathsep+env['PATH']
compiler_details=subprocess.run([str(compiler),'-v'],env=env,capture_output=True,text=True);b.write_json(out/'compiler.json',{'path':str(compiler),'version':compiler_details.stdout+compiler_details.stderr})
extra.extend([root/'docs/architecture/buster-fixture-cleanup.md',root/'docs/architecture/buster-v2-runtime.md',root/'docs/review/remediation/implementation/kubernetes-cleanup-disposition-20260921.md',root/'skills/buster/plugins/kubernetes-fixture/README.md'])
before=b.capture(root,plan,extra);b.write_json(out/'before.json',before);results=[]
with (out/'source.patch').open('w') as f:subprocess.run(['git','diff','--binary','--',*plan['sourceRoots'],*plan['rootFiles']],stdout=f,check=True)
try:
 for name,cmd in commands:
  print('START '+name,flush=True);start=time.monotonic()
  command_env=dict(env)
  expected=0
  if args.phase in ['controls','ci2-controls']:
   expected=1
   command_env['BUSTER_CLUSTER_MUTATION']=name.removeprefix('control-')
   command_env['BUSTER_CLUSTER_MUTATION_MANIFEST']=str(manifest_path)
   command_env['NODE_OPTIONS'] += f' --import={mutation_hook}'
   if args.phase=='ci2-controls': command_env['BUSTER_CI2_CONTROL_SPECS']=str(ci2_specs)
  with (out/(name+'.txt')).open('w') as log:
   try:r=subprocess.run(cmd,env=command_env,stdout=log,stderr=subprocess.STDOUT,timeout=900);code=r.returncode
   except subprocess.TimeoutExpired:code=124
  results.append({'name':name,'command':cmd,'exitCode':code,'expectedExitCode':expected,'seconds':time.monotonic()-start});b.write_json(out/'results.json',results);print('END '+name+' '+str(code),flush=True)
  if code and args.phase in ['fast','lint']: break
finally:
 after=b.capture(root,plan,extra);b.write_json(out/'after.json',after);drift=[p for p in set(before)|set(after) if before.get(p)!=after.get(p)];b.write_json(out/'drift.json',drift);allowed=str(root/'skills/common/plugin-runtime/foundation/isolation/plugin-sandbox');buildDelta={p:{'before':before.get(p),'after':after.get(p)} for p in drift if p==allowed};b.write_json(out/'sandbox-build-delta.json',buildDelta);drift=[p for p in drift if p!=allowed];b.write_json(out/'unexpected-drift.json',drift);print('DRIFT '+str(len(drift)),flush=True)
violations=out/'violations.jsonl'
protection_violation=violations.exists() and bool(violations.read_text().strip())
b.write_json(out/'protection-result.json', {'violationRecorded':protection_violation})
raise SystemExit(1 if drift or protection_violation or any(r['exitCode'] != r['expectedExitCode'] for r in results) else 0)
