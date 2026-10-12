import pathlib,json,hashlib,subprocess,copy,re,shlex
O=pathlib.Path('docs/review/evidence/config-acceptance/components'); sha=lambda p:hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest();write=lambda p,j:pathlib.Path(p).write_text(json.dumps(j,indent=2)+'\n');R=O/'residual-fragment.json';r=json.loads(R.read_text());head='40cf24e77388bced59475ece9651c9c94d848368';old=json.loads(subprocess.check_output(['git','show',head+':'+str(R)],text=True));archive=O/'historical-case-specifications-40cf24.json'
# Preserve the mistakenly labelled first working snapshot, then publish the exact immutable checkpoint.
if json.loads(archive.read_text()).get('cases')!=old['cases'] and not (O/'historical-first-correction-working-snapshot.json').exists():
 a=json.loads(archive.read_text());a['checkpoint']=None;a['reason']='First correction working snapshot captured after extra75 case addition; NOT exact committed219 checkpoint';write(O/'historical-first-correction-working-snapshot.json',a)
write(archive,{'checkpoint':head,'reason':'Exact git-show committed original49rows/219cases; independent NOT ACCEPTED report remains authoritative','cases':old['cases'],'coreDomainRows':[x for x in old['rows'] if x['owner']=='worker-core' and x['class']=='operator-setting']})
oldrows={x['id']:x for x in old['rows']}
for x in r['rows']:
 if x['owner']=='worker-core' and x['class']=='operator-setting':x['historicalDomainProposals']=[{'checkpoint':head,'domain':oldrows[x['id']]['supportedDomain'],'lifecycle':'superseded','reason':'ICD001 preservation-only const domain cannot discharge adjustable requirement'}]
for c in r['cases']:
 for k in ['supersedesCaseIds']:
  if k in c:c[k]=list(dict.fromkeys(c[k]))
 for k in ['supersedes','supersededBy']:c['lifecycle'][k]=list(dict.fromkeys(c['lifecycle'].get(k,[])))
P=O/'refined-case-profiles.json';profiles=json.loads(P.read_text());hist=O/'historical-refined-case-profiles-a07de567.json'
if not hist.exists():hist.write_text(subprocess.check_output(['git','show',head+':'+str(P)],text=True))
id='CMP-C1-EFFECT-buster-engine-clusterInvokers.tailscaleExposure.allowedHostSuffixes';v=profiles[id];v['B']['buster-engine']['settings']['clusterInvokers']['tailscaleExposure']['allowedHostSuffixes']=['.config-acceptance.ts.net'];v['delta']['B']=['.config-acceptance.ts.net'];write(P,profiles)
actions={
'pipelinePreferenceSubject':('Actual loadControlConfig maps configured null to undefined; authenticated POST /v1/dispatch uses authorizePipelinePreferenceSubject. Request user-aaaaaaaaaaaaaaaaaaaaaaaa under both profiles; repeat with omitted preferenceSubjectId.','A rejects requested B with pipeline preference subject is not authorized by platform configuration; B admits same requested subject. Omitted request resolves null under A and configured subject under B; dispatched startDesignRound subjectId matches.'),
'artifactRoot':('Actual control-context ContentAddressedArtifactStore: put/read same fixed bytes in fresh disposable mounted roots from complete profiles.','Same digest and bytes; genuine artifact path is under selected A/B root, absent in other root. Do not write production directories.'),
'studioPublicUrl':('Successful real agent-route response under same fenced project/document fixture; inspect response.studioUrl.','Exact selected public URL plus project/document query; not an allowlist grant or network reachability claim.'),
'controlUrl':('Actual studio-request fetch of same supported request against genuine disposable HTTP endpoints and isolated DNS for both selected upstreams.','Only selected A/B upstream receives real proxy request and its response is returned.'),
'kubectlExecutable':('Actual cluster invoker spawning genuine kubectl binaries installed at both absolute selected paths in disposable image/cluster; inspect child executable and real successful API operation.','Selected absolute binary path changes; same allowed API operation succeeds. No replacement script/mock kubectl.'),
'leaseApiGroup':('Fresh S/R disposable cluster: deploy matching actual generated lease CRD/RBAC/controller/client closure for each selected API group; submit same allowed lease operation and reconcile.','Real API request and controller reconciliation use selected group; captured existing claims/finalizers are not retargeted to current group.'),
'leaseApiVersion':('Fresh S/R disposable cluster: deploy matching generated CRD/RBAC/controller/client closure for selected version; same allowed lease operation and real reconciliation.','Actual API request/reconcile selected version; original claims/grants/finalizers stable, not per-request module retarget.'),
'registryRepositoryPrefixes':('Same immutable digest image under config-acceptance repository in genuine selected disposable registry, normal fixture readRequest and cluster operation; kubeclaw repository positive control both.','A KUBERNETES_FIXTURE_IMAGE_DENIED before effect; B allows exact image via selected registryReference/repository projection; positive control both.'),
'allowedSecretReferences':('Same fixture request secretReferences=[config-acceptance-secret] backed by actual disposable Kubernetes reference; empty-list control both.','A KUBERNETES_FIXTURE_SECRET_REFERENCE_DENIED; B admits exact reference and real lease reference, no secret content recorded.'),
'allowedStorageClasses':('Same actual disposable PVC request storageClassName=config-acceptance-storage with real class provisioned; no-class positive control.','A KUBERNETES_FIXTURE_STORAGE_CLASS_DENIED:config-acceptance-storage; B admits real PVC path.'),
'runnerServiceAccount':('Actual fixture preparation lease spec and real disposable cluster deployer authorization using selected controllerNamespace/runnerServiceAccount; hold credential reader fixed.','lease.spec access.deployer is exact selected namespaced subject; selected real service account authorized, other account not implicitly added.'),
'credentialReaderServiceAccount':('Actual fixture preparation lease spec and genuine disposable credential-read authorization for selected controllerNamespace/credentialReaderServiceAccount; runner held fixed.','lease.spec credential.readers exact selected namespaced subject; real reader identity changes, secret bytes never evidence.'),
'allowedHostSuffixes':('Actual TailscaleExposure publicURL guard with fixture.other.ts.net and fixture.config-acceptance.ts.net. For complete live effect require genuine tailnet/lease fixture; guard-only observation never claimed delivery.','A admits both; narrowed B rejects fixture.other.ts.net with TAILSCALE_EXPOSURE_HOST_DENIED, admits fixture.config-acceptance.ts.net. Historical appended suffix was redundant and is superseded.'),
'executableSearchPath':('Actual KubernetesRuntimeSecurity real child env.PATH and genuine kubectl credential exec plugin/helper installed only /opt/config-acceptance/bin, same disposable allowed cluster fixture; standard executable positive control.','PATH exactly joins selected list; A cannot resolve helper, B executes actual helper and succeeds; absolute kubectl selection unchanged; no replacement kubectl.'),
}
for u in r['caseRefinements']:
 if not u['observer']['action'].startswith('Drive actual selected'):continue
 field=u['completeProfiles']['delta']['field'];leaf=field.rsplit('/',1)[1]
 if leaf=='allowedNamespacePrefixes':
  role=field.split('/')[-2];error={'kubernetesFixture':'KUBERNETES_FIXTURE_NAMESPACE_PREFIX_DENIED','tailscaleExposure':'TAILSCALE_EXPOSURE_NAMESPACE_DENIED','runtimeSecurity':'KUBERNETES_RUNTIME_SECURITY_NAMESPACE_DENIED'}[role]
  action='Actual '+role+' input guard and real disposable owned lease/task for namespace config-acceptance-fixture; fixture namespacePrefix=config-acceptance where applicable; test-fixture positive control both.';oracle='A rejects before effect ('+error+'; tailscale diagnostic must match exact real guard text); B admits selected prefix then actual owned operation. Prefix requires trailing hyphen namespace relationship, not arbitrary substring.'
 else:action,oracle=actions[leaf]
 u['observer']['action']=action;u['observer']['boundary']=oracle;u['observer']['taskInputs']['preciseWitness']=action;u['completeProfiles']['delta']=copy.deepcopy(profiles[u['replacementForCaseId']]['delta']);u['observer']['taskInputs']['B']=copy.deepcopy(u['completeProfiles']['delta']['B'])
# Historical loader receipt still binds unchanged archived profile bytes, not current corrected bytes.
for c in r['cases']:
 if c['id']=='CMP-C0-REFINED-COMPLETE-PROFILES':
  c['lifecycle']={'state':'historical','required':False,'supersedes':[],'supersededBy':['CMP-C0-REFINED-PROFILES-ICD-CORRECTED'],'reason':'Original296 positives bind archived profile file; narrowed suffix fixture requires fresh current check'};c['historicalInputConfigProfile']={'path':str(hist),'sha256':sha(hist),'originalPath':str(P)}
write(R,r)
print('Exact historical snapshot',len(old['rows']),len(old['cases']),'17 refined witnesses corrected; narrowed suffix; historical296 retained')
