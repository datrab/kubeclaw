"""Read-only original/source/history end check, manifest only in this additive package."""
import hashlib,json,pathlib,subprocess
R=pathlib.Path.cwd();O=R/'docs/review/evidence/config-acceptance/c0-completion-20261013/nova-agent-target-contracts-01'
def read(p):return json.loads(p.read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def bsha(v):return hashlib.sha256(json.dumps(v,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
checks=[]
for name in ['source-pins.json','history-pins.json']:
 for p in read(O/name)['files']:
  ok=sha(R/p['path'])==p['sha256'];checks.append({'kind':name,'path':p['path'],'exact':ok});assert ok,p['path']
ident=read(O/'original/identity.json')
for p,key,container in [('docs/review/remediation/config-semantic-inventory.json','rowBodies','rows'),('docs/review/remediation/config-acceptance-matrix.json','caseBodies','cases'),('docs/review/evidence/config-acceptance/runtime/case-proposals.json','nativeBodies',None)]:
 value=read(R/p);rows=value[container] if container else value;index={x['id']:x for x in rows}
 for id,expected in ident[key].items():
  ok=bsha(index[id])==expected;checks.append({'kind':key,'id':id,'exact':ok});assert ok,id
result={'qualification':'Bounded author end conservation only, no self/global/implementation/native acceptance','checks':checks,'sourceCount':len(read(O/'source-pins.json')['files']),'historyCount':len(read(O/'history-pins.json')['files']),'originalRows':18,'originalCases':144,'originalNativeBodies':144,'originalPhaseResult':'144 implementation-proposal / not-run unchanged','sourceCommit':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'sourceTree':subprocess.check_output(['git','rev-parse','HEAD^{tree}'],text=True).strip(),'worktreeQualification':'Shared checkout may include other agents additive artifacts; relevant exact source/original/history bytes checked, not a clean-tree claim','productiveActions':0,'independentReview':'required and pending'}
(O/'end-conservation.json').write_text(json.dumps(result,indent=2)+'\n')
files=[]
for p in sorted(O.rglob('*')):
 if p.is_file() and p.name not in ['manifest.json','freeze.stdout.log','freeze.stderr.log','freeze.command.json']:
  files.append({'path':str(p.relative_to(O)),'sha256':sha(p),'bytes':p.stat().st_size})
(O/'manifest.json').write_text(json.dumps({'schemaVersion':'evidence-manifest.v1','scope':'nova-agent-target-contracts-01 additive C0 definition only','files':files,'artifactCount':len(files),'sourceCount':result['sourceCount'],'historyCount':result['historyCount'],'sourceCommit':result['sourceCommit'],'sourceTree':result['sourceTree'],'originalRows':18,'originalCases':144,'originalNativeBodies':144,'completeProfiles':42,'wholeFutureEntryViews':36,'currentWireViews':36,'independentReview':'pending','selfOrGlobalAcceptance':False,'nativeActions':0,'exclusions':'Own manifest and own freeze command/stdout/stderr avoid circular self hashing only'},indent=2)+'\n')
print(json.dumps({'artifactPins':len(files),'sourcePins':result['sourceCount'],'historyPins':result['historyCount'],'conservationChecks':len(checks),'originalRows':18,'cases':144,'nativeBodies':144,'productiveActions':0,'review':'pending'}))
