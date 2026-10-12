import pathlib,json,hashlib,runpy,ast
R=pathlib.Path.cwd();E=R/'docs/review/evidence/buster-legacy-seal-vm-20260921'; C=R/'node_modules/.cache/buster-legacy-seal-vm-20260921/generation5';O=R/'docs/review/evidence/buster-legacy-run5-independent-20260921'
def h(p):
 with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def parsed(s):return [json.loads(l) for l in s.splitlines() if l.startswith('{')]
def nested(o):
 yield o
 for v in parsed(o.get('stdout','')):yield from nested(v)
console=(E/'run5/vm-console.txt').read_text(); rows=parsed(console);cases=[r for r in rows if 'case' in r];assert len(cases)==29 and len({r['case'] for r in cases})==29
assert [r['case'] for r in cases if r['exitCode']] == [];assert 'VM_REVIEW_EXIT=0' in console
assert rows[-1]=={'cases':29,'failed':[],'kernelAcceptance':True,'stopAuthority':False}
result=json.loads((E/'run5/vm-result.json').read_text());assert result['qemuExitCode']==0 and result['stoppedReason'] is None and result['passed']
for name in ['vm-console.txt','vm-result.json']:assert (E/'run5'/name).read_bytes()==(C/'logs-smaller-as'/name).read_bytes()
import os,stat
for name,key,size in [('guest-root.ext4','finalMutableDiskSha256',268435456),('second.ext4','finalSecondDiskSha256',16777216)]:
 p=C/name; fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
 with os.fdopen(fd,'rb') as f:
  before=os.fstat(fd);stamp=lambda t:(t.st_dev,t.st_ino,t.st_size,t.st_mtime_ns,t.st_ctime_ns)
  assert p.resolve()==p and stat.S_ISREG(before.st_mode) and stat.S_IMODE(before.st_mode)==0o644 and before.st_uid==1000 and before.st_nlink==1 and before.st_size==size
  assert hashlib.file_digest(f,'sha256').hexdigest()==result[key]
  assert stamp(os.fstat(fd))==stamp(before)==stamp(p.lstat())
  os.posix_fadvise(fd,0,0,os.POSIX_FADV_DONTNEED)
  assert stamp(os.fstat(fd))==stamp(before)==stamp(p.lstat())
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
rb=runpy.run_path(str(E/'generation5/runtime-binding.py'));assert rb['capture'](R/'node_modules/.cache/systemd-native-vm-20260921/root')==json.loads((E/'generation5/tool-runtime-identities.json').read_text())
summary=[]
for case in cases:
 if case['case'] in ('foreign-descendant','writable-descendant'):continue
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
(O/'result.json').write_text(json.dumps({'overallPassed':29,'reviewedOriginalCases':27,'authoredTwoExcludedFromIndependentAcceptance':True,'failed':[],'elapsedSeconds':result['elapsedSeconds'],'postArtifactsAndSourceStable':True,'finalDisksMatch':True,'cases':summary},indent=2)+'\n');print('Original27 independently audited, allpass; two authored cases delegated to root; final disk/source/tool binding intact.')
