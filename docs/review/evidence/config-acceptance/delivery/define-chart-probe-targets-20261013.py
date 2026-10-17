"""Actual Chart probe fields, pinned Go defaulting/validation/kubelet consumers and future H cases."""
import pathlib,json,hashlib,copy
out=pathlib.Path(__file__).resolve().parent;repo=out.parents[4];v=json.loads((out/'inventory-fragment.json').read_text());cases=json.loads((out/'proposed-cases.json').read_text());folder=out/'chart-probe-target-profiles-20261013';folder.mkdir(exist_ok=True);records=[];sources={s['path']:s for s in v['sources']};acq=json.loads((out/'kubelet-prober-source-acquisitions-20261013.json').read_text());assert all(r['result']=='acquired' for r in acq['records'])
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def rel(p):return str(p.relative_to(repo))
def setfield(body,field,value):
 node=body;parts=field.split('.')
 for key in parts[:-1]:node=node[key]
 node[parts[-1]]=value
health=json.loads((out/'gateway-health-target-case-specifications-20261013.json').read_text());healthAliases={r['primaryAuthorAlias']['settingId']:r for r in health['fields'] if r.get('primaryAuthorAlias')}
for r in v['rows']:
 field=r['source']['field']
 if r['source']['path']!='charts/kubeclaw/values.yaml' or not field.startswith('probes.'):continue
 dependency=field.startswith('probes.dependencies.');stage=field.split('.')[1];leaf=field.split('.')[-1];refs=[]
 if dependency:
  derivative=healthAliases.get(r['id'])
  if not derivative:raise RuntimeError('No exact health consumer for dependency source '+r['id'])
  domain=copy.deepcopy(derivative['targetDomain']['domain']);oracle=derivative['nativeOracle'];native='generated Node /runtime-config/kubeclaw-health.mjs dependency flag/XADD/HTTP exact mapped consumer; no APIprobeclock proof from Nodecontrol';readonlyDerivative=derivative['settingId']
 else:
  domain={'type':'boolean'} if leaf=='enabled' else {'type':'integer','minimum':0 if leaf=='initialDelaySeconds' else 1,'maximum':2147483647,'unit':'count' if leaf=='failureThreshold' else 'seconds','sourceVsTarget':'exact pinned Go Probe fields int32; validateProbe currently validates NONNEGATIVE including raw0, defaulting maps timeout0→1/period0→10/failure0→3. Target explicit>=1 rejects that fallback for non-initial fields; no fabricated native min1 validator. initialdelay0 explicit valid.'};readonlyDerivative=None
  for version in ['v1.35.6','v1.34.11']:
   for path,function in [('pkg/apis/core/validation/validation.go','validateProbe'),('pkg/apis/core/v1/defaults.go','SetDefaults_Probe')]:
    p=out/'pinned-kubernetes'/version/path;refs.append({'path':rel(p),'sha256':sha(p),'version':version,'function':function})
  refs += [{'path':r['localPath'],'sha256':r['sha256'],'version':r['version'],'commit':r['commit']} for r in acq['records']]
  native='API int32 decode/defaults/validateProbe→kubelet probe worker→time.NewTickerPeriod / initial runningstart delay / exec timeout RunInContainer / resultRun threshold and onHold/containerID'
  oracle='actual admitted Pod probe definition/defaults and selected kubelet/CRI/worker behavior: enabled false omits this Podprobe, NOT a positive timer effect. Startup success gates readiness/liveness until Started; readiness failure marks notReady not automaticrestart, startup/liveness failure result after consecutivefailure threshold freezes oldcontainer onHold until newID. Actualtiming/drift/gates/restart/readback required. Source worker deletion success and kubelet restart reseeding are NOT module/foundations acceptance. Positive real selected Nodehealth/nativefixture before timeout/failure/oldauthor negatives.'
 profiles={}
 for name in ['A','B']:
  p=out/f'chart-kubernetes-target-profiles-20261013/kubeclaw-{name}.json';body=json.loads(p.read_text());body['probes']['dependencies']['timeoutMs']=1000 if name=='A' else 2000
  for mode in ['startup','readiness','liveness']:body['probes'][mode]['timeoutSeconds']=20 if name=='A' else 40
  node=body
  for key in field.split('.'):node=node[key]
  value=node
  if leaf=='enabled':value=True if name=='A' else False
  elif isinstance(value,int):value=max(1,value) if name=='A' else max(1,value)*2
  elif leaf=='stream':value='dlv:health:nova:'+name.lower()
  elif leaf=='endpoints':value=['http://127.0.0.1:'+('15001' if name=='A' else '15002')]
  setfield(body,field,value);p=folder/(r['id']+'.'+name+'.json');p.write_text(json.dumps(body,indent=2)+'\n');profiles[name]={'path':rel(p),'sha256':sha(p),'fieldValue':value,'scope':'complete current-flat plus proposed same-Chart dependency.timeoutMs extension, ignoredcurrenttemplate; targetC3 projection/coherent native fixture prerequisite. Booleanfalse suppresses actualprobe/check; supportedscoped omission, never fabricated positivefield effect.'}
 r['targetDomain']={'domain':domain,'required':True,'proposedOnly':True,'nativeVersionScope':'exact source v1.35.6/v1.34.11 static exemplars, current Chart no kubeVersion; selected actual server/defaults/gates/kubelet/CRI/image identities required, pins are NOT deployedAPI','correlations':['Pod timeout per-mode covers exact health sequential-dependency budget/teardown/localFS bound; target new dependencies.timeoutMs decouples current readiness.timeoutSeconds*1000 conflation','source int32 plus Go duration seconds conversion fits int64; any derived startup/failure/wholephase budget computed overflow-safe and primitive-supported before publication; do not guess universal business module deadline','disabledprobe fields still required strictowner definition but runtimeeffectcase must select enabled fixture, inactivecase non-effect separately','health marker/code conditionalchecks never replace mandatory original delivery/foundations/source/grant verification before imports/input/activation'],'activation':'H Pod/deployment generation; source defaulting and new kubelet worker eachPod/containerID; A running originalPod/source/grants/marker/stream retains original policy until explicit H roll/drain. B cannot rewrite A job/module/budget/cleanup.'}
 if refs:r['reader'].setdefault('targetPrimaryReferences',[]);r['reader']['targetPrimaryReferences']=refs
 for q in refs:
  s=sources.setdefault(q['path'],{'path':q['path'],'sha256':q['sha256'],'settingIds':[],'disposition':'exact pinned source static default/validator/kubelet probe consumer; not deployednative identity'})
  if r['id'] not in s['settingIds']:s['settingIds'].append(r['id'])
 records.append({'settingId':r['id'],'field':field,'targetDomain':r['targetDomain'],'completeProfiles':profiles,'source':r['source'],'nativeChain':native,'primaryReferences':refs,'readonlyHealthDerivative':readonlyDerivative,'actualProjection':r['reader'],'nativeOracle':oracle,'negativeCases':['missing/unknown/type/int32overflow/negative or targetnon-initial0 beforeHelm; rawnative0 APIdefaulting separatelycounterexample','old equal+different -f/--set/ENV/currentliteral default author beforeeffect','budgetoverflow/modewholebudget insufficiency','disabled→noinvocation NON-EFFECT vs enabledpositivefixture','nativeunsupportedcluster/image/CRI/gates/setup neversemanticnegativekill','A→B originalcontainer/Pod/grants/code/status/stream/cleanup provenance retained'], 'futureHarness':'tests/verification/config/delivery-chart-fields.test.mts','priorState':'nonempty original A PodUID/containerID/runningstartedAt/success/failurecounter/onHold/dependency source/trust/grants beforeB; preserve until its originaldrain/cleanup, universalparent contractpending','caseIds':r['caseIds']})
cid='DLV-CASE-CHART-KUBELET-PROBE-POLICY';template=copy.deepcopy(next(c for c in cases if c['id']=='DLV-CASE-CHART-ALTERNATE-PROFILE'));template.update(id=cid,settingIds=[r['settingId'] for r in records],sourceDigests={'charts/kubeclaw/templates/deployment.yaml':sha(repo/'charts/kubeclaw/templates/deployment.yaml'),'charts/kubeclaw/values.yaml':sha(repo/'charts/kubeclaw/values.yaml')},testDigests={},specDigests={},fieldSpecificationRefs=[],inputProfile={r['settingId']:r['completeProfiles'] for r in records},result='not-run',reviewerConfirmation='pending',productiveCaller='actualHelm Pod Exec probe definition→selected deployedAPI defaulting/admission→selectedkubelet worker/containerID→RunInContainer Nodehealth mode→native deps/status/result counters',expectedEffectOrBoundary='raw0APIdefaulting vs stricttargetrequired rejection, enabled/inactive scope, actual worker delay/ticker/execdeadline/consecutivefailure/restart/readiness effects; sourcepins not deployedAPI/CRI grant',priorState='A PodUID/containerID/runningstartedAt/counters/onHold/marker/stream/provider/physicalCRI/grants before B; originalcleanup refs pending');cases=[c for c in cases if c['id']!=cid]+[template]
for rec in records:
 row=next(r for r in v['rows'] if r['id']==rec['settingId']);row['caseIds']=sorted(set(row['caseIds']+[cid]));rec['caseIds']=row['caseIds']
f=out/'chart-probe-target-case-specifications-20261013.json';f.write_text(json.dumps({'scope':'23actualprobe/healthdependency authoredChart fields, pinned Go default/validate/worker vs target strictrequired domains/fullprofiles/nativefuturecases; no deployedAPI/kubelet/CRI/network/host/image effects','fields':records,'pinnedConsumerAcquisition':{'path':rel(out/'kubelet-prober-source-acquisitions-20261013.json'),'sha256':sha(out/'kubelet-prober-source-acquisitions-20261013.json')},'sourceNativeDefaulting':'raw0 nonnegativevalidator→APIdefaulting; stricttarget no fallback not fabricatedcurrentAPIrejection'},indent=2)+'\n')
for c in cases:
 if any(x['settingId'] in c['settingIds'] for x in records):c.setdefault('specDigests',{})[rel(f)]=sha(f);c.setdefault('fieldSpecificationRefs',[]);c['fieldSpecificationRefs']=[x for x in c['fieldSpecificationRefs'] if x!=rel(f)]+[rel(f)]
v['sources']=list(sources.values());(out/'inventory-fragment.json').write_text(json.dumps(v,indent=2)+'\n');(out/'proposed-cases.json').write_text(json.dumps(cases,indent=2)+'\n');print('Defined23actualChartprobes with exact raw0/defaulting vs stricttarget and primarykubelet consumers; native not-run')
