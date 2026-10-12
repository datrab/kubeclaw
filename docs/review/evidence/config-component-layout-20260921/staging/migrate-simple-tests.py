from pathlib import Path
import re,os,json
root=Path.cwd();stage=root/'docs/review/evidence/config-component-layout-20260921/staging';out=stage/'files'
# Only explicit raw-owner mutations. Complex grouped-native cases are handled separately.
files=['skills/prism/tests/studio-config.test.mts','skills/prism/tests/fixtures/control-policy.mts','skills/prism/tests/fixtures/studio-service.mts','skills/prism/tests/swarm-worker-config.test.mts','skills/prism/tests/swarm-control-policy.test.mts','skills/prism/tests/swarm-supervisor-config.test.mts','skills/prism/tests/swarm-resource-policy.test.mts','skills/prism/tests/swarm-input-limit.test.mts','skills/prism/tests/swarm-worker-behavior.test.mts','skills/prism/tests/swarm-result-journal.test.mts','skills/prism/tests/swarm-resource-operation.test.mts','skills/prism/tests/swarm-supervisor-consumers.test.mts']
changes=[]
for name in files:
 p=root/name;s=p.read_text()
 # Parse balanced readFileSync calls rather than regex across unrelated fixture JSON.
 search=0
 while True:
  match=re.search(r'JSON\.parse\(fs\.readFileSync\(',s[search:])
  if not match:break
  a=search+match.start();start=a+len('JSON.parse(fs.readFileSync(');depth=1;i=start;quote=None;escaped=False
  while depth and i<len(s):
   c=s[i]
   if quote:
    if escaped:escaped=False
    elif c=='\\':escaped=True
    elif c==quote:quote=None
   elif c in ['\"',"'",'`']:quote=c
   elif c=='(':depth+=1
   elif c==')':depth-=1
   i+=1
  if i>=len(s) or s[i]!=')':search=i;continue
  inner=s[start:i-1]
  if 'swarm' not in inner and inner.strip() not in ["canonical, 'utf8'","canonical,'utf8'","env.SWARM_CONFIG,'utf8'","env.SWARM_CONFIG, 'utf8'"]:search=i+1;continue
  inner=re.sub(r",\s*['\"]utf8['\"]\s*$",'',inner)
  s=s[:a]+'readTestBundle('+inner+')'+s[i+1:];search=a+len('readTestBundle('+inner+')')
 # Rewrite concrete owner fields, so invalid/missing values reach actual raw schemas.
 for old,new in [('.operator.prism.native.supervisor',"['prism-worker'].settings.supervisor"),('.operator.prism.native.resourcePolicy',"['prism-execution'].settings.resourcePolicy"),('.operator.prism.native.maximumResultBytes',"['prism-execution'].settings.maximumResultBytes"),('.operator.prism.native.dispatchTimeoutMs',"['prism-control'].settings.dispatchTimeoutMs"),('.operator.prism.worker',"['prism-worker'].settings.ingress"),('.operator.prism.control',"['prism-control'].settings"),('.operator.prism.studio',"['prism-studio'].settings")]:s=s.replace(old,new)
 # Whole Control settings now include dispatchTimeoutMs: object replacement must preserve the separate valid dispatch setting.
 s=s.replace("config['prism-control'].settings = value;", "config['prism-control'].settings = value == null ? value : {dispatchTimeoutMs: config['prism-control'].settings.dispatchTimeoutMs, ...value};")
 # Restrict writes to named known authored bundle variables.
 s=re.sub(r'fs\.writeFileSync\(([^;\n]+?),\s*JSON\.stringify\((value|authored|config|f\.value)\)\)',r'writeTestBundle(\1, \2)',s)
 if name.endswith('swarm-worker-config.test.mts'):
  s=s.replace("['', 'operator', 'operator.prism', 'operator.prism.worker']", "['entry', 'prism-worker', 'prism-worker.settings', 'prism-worker.settings.ingress']")
  s=s.replace("value[key] = key === 'profile'", "value.entry[key] = key === 'profile'")
 # Write import only when helper is actually used.
 helper=os.path.relpath(root/'tests/fixtures/config/swarm-bundle.mjs',p.parent).replace(os.sep,'/')
 if not helper.startswith('.'):helper='./'+helper
 used=[x for x in ['readTestBundle','writeTestBundle'] if x+'(' in s]
 if used:s="import { "+', '.join(used)+" } from '"+helper+"';\n"+s
 target=out/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_text(s)
 changes.append({'path':name,'remainingInlineReferences':len(re.findall(r'\.operator\.',s))})
(stage/'simple-test-migration.json').write_text(json.dumps(changes,indent=2)+'\n')
print('Staged twelve direct-owner fixture/test migrations; not executed.')
