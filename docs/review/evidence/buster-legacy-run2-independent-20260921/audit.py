import pathlib,json,hashlib,runpy,ast
R=pathlib.Path.cwd();E=R/'docs/review/evidence/buster-legacy-seal-vm-20260921'; C=R/'node_modules/.cache/buster-legacy-seal-vm-20260921/generation2';O=R/'docs/review/evidence/buster-legacy-run2-independent-20260921'
def h(p):
 with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def parsed(s):return [json.loads(l) for l in s.splitlines() if l.startswith('{')]
def nested(o):
 yield o
 for v in parsed(o.get('stdout','')):yield from nested(v)
console=(E/'run2/vm-console.txt').read_text(); rows=parsed(console);cases=[r for r in rows if 'case' in r];assert len(cases)==27 and len({r['case'] for r in cases})==27
assert [r['case'] for r in cases if r['exitCode']] == ['tmpfs-root'];assert 'VM_REVIEW_EXIT=1' in console
assert rows[-1]=={'cases':27,'failed':['tmpfs-root'],'kernelAcceptance':False,'stopAuthority':False}
result=json.loads((E/'run2/vm-result.json').read_text());assert result['qemuExitCode']==0 and result['stoppedReason'] is None and not result['passed']
for name in ['vm-console.txt','vm-result.json']:assert (E/'run2'/name).read_bytes()==(C/'logs-smaller-as'/name).read_bytes()
for name,key in [('guest-root.ext4','finalMutableDiskSha256'),('second.ext4','finalSecondDiskSha256')]:assert h(C/name)==result[key]
for rel,digest in result['verifiedInitialArtifacts'].items():
 if rel.endswith('.ext4'):continue
 assert h(R/rel)==digest,rel
expected=json.loads((C/'repo-snapshot-manifest.json').read_text());actual={'.'}
import os
for d,ds,fs in os.walk(C/'repo-snapshot'):
 for n in ds+fs:actual.add(str((pathlib.Path(d)/n).relative_to(C/'repo-snapshot')))
assert actual=={r['path'] for r in expected}
for r in expected:
 if r['type']=='file':assert h(C/'repo-snapshot'/r['path'])==r['sha256']
rb=runpy.run_path(str(E/'generation2/runtime-binding.py'));assert rb['capture'](R/'node_modules/.cache/systemd-native-vm-20260921/root')==json.loads((E/'generation2/tool-runtime-identities.json').read_text())
summary=[]
for case in cases:
 ns=list(nested(case));terminal=[n for n in ns[1:] if n.get('case')==case['case'] and n.get('passed')]
 assert bool(terminal)==(case['exitCode']==0)
 caps=[n['sets'] for n in ns if n.get('phase')=='capabilities'];observations=[n['observation'] for n in ns if n.get('phase')=='verified']
 errors=[n['stderr'].strip() for n in ns if n.get('phase')=='verifier' and n.get('exitCode') and not n['stderr'].startswith('open(')]
 traceTargets=[]
 for n in ns:
  if 'strace' in n.get('command',[]) and n.get('phase')=='verifier':
   matches=[l for l in n['stderr'].splitlines() if any(s in l for s in ['/special','/link','/fifo-link','/absolute','/dangling','/relative']) and ('open(' in l or 'openat(' in l)]
   assert matches;assert all('O_PATH' in l for l in matches);traceTargets.extend(matches)
 summary.append({'case':case['case'],'exitCode':case['exitCode'],'capabilities':caps,'observations':observations,'errors':errors,'traceTargets':traceTargets,'controls':[n for n in ns if 'control' in n or 'denied' in n],'namespace':[n for n in ns if n.get('phase')=='live-namespace-comparison']})
(O/'result.json').write_text(json.dumps({'passed':26,'failed':['tmpfs-root'],'elapsedSeconds':result['elapsedSeconds'],'postArtifactsAndSourceStable':True,'finalDisksMatch':True,'cases':summary},indent=2)+'\n');print('27 cases audited;26 pass; tmpfs-root failed; final disk/source/tool bindings unchanged.')
