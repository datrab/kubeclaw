from pathlib import Path
import re,json
p=Path(__file__).parent
manifest='{ maximumNodes: 100000, maximumDepth: 64, maximumAliases: 1000, maximumFlattenVisits: 100000, maximumFlattenPending: 100000 }'
def end_object(s,start):
 depth=0;i=start
 while i<len(s):
  c=s[i]
  if c in "\"'`":
   quote=c;i+=1
   while i<len(s):
    if s[i]=='\\':i+=2;continue
    if s[i]==quote:break
    i+=1
  elif s.startswith('//',i):
   i=s.find('\n',i)
   if i<0:raise Exception('comment eof')
  elif s.startswith('/*',i):i=s.index('*/',i)+1
  elif c=='{':depth+=1
  elif c=='}':
   depth-=1
   if depth==0:return i
  i+=1
 raise Exception('unclosed')
rows=[]
for root in ['tests','skills']:
 for f in Path(root).rglob('*'):
  if not f.is_file() or f.suffix not in ['.mjs','.mts','.ts','.js'] or 'node_modules' in f.parts:continue
  if str(f).startswith('skills/buster/engine/'):continue
  s=f.read_text();edits=[]
  for m in re.finditer(r'new (KubernetesFixture|TailscaleExposure)CapabilityInvoker\(\{',s):
   start=m.end()-1;end=end_object(s,start);body=s[start:end];fields=[]
   if m[1]=='KubernetesFixture':
    fields=['shortCommandTimeoutMs: 15000','commandOutputManifestMultiplier: 2','diagnosticCodeUnits: 4096','manifest: '+manifest]
    namespace=re.search(r"controllerNamespace:\s*('[^']*'|\"[^\"]*\"|[A-Za-z_][A-Za-z_0-9]*)",body)
    ns=namespace[1] if namespace else 'controllerNamespace'
    for key,account in [('runnerSubject','agent-buster'),('credentialReaderSubject','agent-nova')]:
     if not re.search(r'\b'+key+r'\s*:',body):fields.append(key+': '+ns+" + '/"+account+"'")
   else:fields=['shortCommandTimeoutMs: 15000','maximumCommandOutputBytes: 1048576']
   if not re.search(r'\bpollIntervalMs\s*:',body):fields.append('pollIntervalMs: 1000')
   edits.append((start+1,' '+', '.join(fields)+', '))
  if edits:
   out=s
   for pos,txt in reversed(edits):out=out[:pos]+txt+out[pos:]
   before=p/'before'/f;after=p/'files'/f;before.parent.mkdir(parents=True,exist_ok=True);after.parent.mkdir(parents=True,exist_ok=True)
   if not before.exists():before.write_text(s)
   after.write_text(out);rows.append({'path':str(f),'directCalls':len(edits)})
(p/'caller-migration-initial.json').write_text(json.dumps(rows,indent=2)+'\n')
print(rows)
