from pathlib import Path
import re,os
root=Path.cwd();out=root/'docs/review/evidence/config-component-layout-20260921/staging/files'
def write(n,s):p=out/n;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(s)
def replace_calls(s, name, replacement):
 offset=0
 while True:
  m=re.search(r'\b'+name+r'\(',s[offset:])
  if not m:break
  start=offset+m.start();i=start+len(name)+1;depth=1;quote=None;escape=False
  while depth:
   c=s[i]
   if quote:
    if escape:escape=False
    elif c=='\\':escape=True
    elif c==quote:quote=None
   elif c in ['\"',"'",'`']:quote=c
   elif c=='(':depth+=1
   elif c==')':depth-=1
   i+=1
  old=s[start:i];new=replacement(old);s=s[:start]+new+s[i:];offset=start+len(new)
 return s
for name in ['tests/fixtures/test-gate/modeled-preparation.mts','tests/verification/reliability/buster-preparation-identities.test.mts','tests/verification/reliability/buster-shutdown-storage.test.mts']:
 s=(root/name).read_text()
 for old,new in [('busterPreparationSettingsFromConfig','loadBusterPreparationSettings'),('busterSettingsFromConfig','loadBusterSettings')]:
  s=replace_calls(s,old,lambda call: new+"({ SWARM_CONFIG: canonicalSwarmEntry })")
  s=s.replace(old,new)
 helper=os.path.relpath(root/'tests/fixtures/config/swarm-bundle.mjs',(root/name).parent)
 s="import { canonicalSwarmEntry } from '"+helper+"';\n"+s
 write(name,s)
for name in ['tests/verification/reliability/buster-preparation-ledger.test.mts','tests/verification/reliability/buster-extraction-concurrency.test.mts']:
 s=(root/name).read_text().replace('busterPreparationSettingsFromConfig','loadBusterPreparationSettings')
 s=re.sub(r"const authored = JSON.parse\(await fs.readFile\(new URL\('../../../charts/kubeclaw/files/config/swarm.config.json', import.meta.url\), 'utf8'\)\);",'const authored = readTestBundle(canonicalSwarmEntry);',s)
 s=s.replace('loadBusterPreparationSettings(authored)','loadBusterPreparationSettings({ SWARM_CONFIG: canonicalSwarmEntry })')
 s=s.replace('configured.operator.buster.preparation','configured[\'buster-engine\'].settings.preparation')
 s=s.replace('  const policy = loadBusterPreparationSettings(configured);',"  const configFile = path.join(root, 'swarm.config.json');\n  writeTestBundle(configFile, configured);\n  const policy = loadBusterPreparationSettings({ SWARM_CONFIG: configFile });")
 helper=os.path.relpath(root/'tests/fixtures/config/swarm-bundle.mjs',(root/name).parent)
 used=[x for x in ['canonicalSwarmEntry','readTestBundle','writeTestBundle'] if x in s]
 s="import { "+', '.join(used)+" } from '"+helper+"';\n"+s;write(name,s)
for name in ['tests/fixtures/test-gate/buster-admission.mts','tests/fixtures/test-gate/buster-cli-profile.mjs']:
 s=(root/name).read_text().replace("JSON.parse(fs.readFileSync('charts/kubeclaw/files/config/swarm.config.json', 'utf8'))",'readTestBundle(canonicalSwarmEntry)').replace('document.operator.buster.admission',"document['buster-engine'].settings.admission")
 s=re.sub(r'fs.writeFileSync\((file|swarm), JSON.stringify\(document\)\)',r'writeTestBundle(\1, document)',s)
 s="import { canonicalSwarmEntry, readTestBundle, writeTestBundle } from '../config/swarm-bundle.mjs';\n"+s;write(name,s)
p=out/'tests/fixtures/config/swarm-bundle.mjs';s=p.read_text();s += "\nexport const canonicalSwarmEntry = fileURLToPath(new URL('../../../charts/kubeclaw/files/config/swarm.config.json', import.meta.url));\n";p.write_text(s)
print('Staged explicit Buster fixture bundle loading; no live writes or tests.')
