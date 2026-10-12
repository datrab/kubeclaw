from pathlib import Path
import json,re,hashlib,datetime
base=Path(__file__).parent
registry='skills/common/plugin-runtime/foundation/registry/'
resolver='skills/nova/core/test-gates/resolver.ts'
runner='skills/buster/engine/test-gates/runner.ts'
runtime='skills/buster/engine/test-gates/'
capfiles={'command.execute':'direct-command-runtime.ts','container.build':'container-build-runtime.ts','kubernetes.fixture':'kubernetes-fixture-runtime.ts','kubernetes.exposure':'tailscale-exposure-runtime.ts','network.http':'network-http-runtime.ts','browser.axe':'browser-axe-runtime.ts','browser.lighthouse':'browser-lighthouse-runtime.ts','browser.visual':'browser-visual-runtime.ts','browser.playwright':'browser-playwright-runtime.ts','security.scan':'security-scan-runtime.ts','kubernetes.runtime-security':'kubernetes-runtime-security.ts'}
sources=set();roster=[];providers=[]
def classify(plugin,root,key):
 if plugin in ['kubeclaw.size-budget','kubeclaw.coverage-budget'] or root in ['policy','acceptances','assertions','rules','budget','overrides','comparisonProfile','expectedStatuses','expectedText','expectedContentType','minimumExecutedTests','requiredTests','resultMode']:
  return 'request.test-acceptance-or-evidence-rule'
 if root in ['secretReferences','testCredentials','usernameKey','passwordKey','cookieName','usernamePointer']:
  return 'request.credential-reference-or-authentication-contract'
 if re.search('Timeout|timeout|maximumResponse|maximumSteps|workers|runs',root):return 'request.resource-or-duration-budget'
 if root in ['retention','retentionMode']:return 'request.fixture-lifecycle'
 if root=='environment':return 'request.command-environment-not-host-environment'
 return 'request.test-or-fixture-declaration'
def locations(root,key):
 return [{'path':str(p),'line':i,'text':line.strip()} for p in sorted((root/'src').glob('*.js')) for i,line in enumerate(p.read_text().splitlines(),1) if re.search(r'\b'+re.escape(key)+r'\b',line)][:30]
for p in sorted(Path('skills').rglob('plugin.json')):
 d=json.loads(p.read_text());sources.add(p);rs=d.get('testProviders',[])
 roster.append({'manifest':str(p),'pluginId':d['id'],'testProviderRegistrations':[r['id'] for r in rs]})
 if not rs:continue
 root=p.parent
 sources.update(q for q in root.rglob('*') if q.is_file())
 for r in rs:
  schemaPath=root/r['configSchema'];schema=json.loads(schemaPath.read_text());fields=[];defaults=[];refs=[]
  def walk(v,pointer='$',fieldpath='',required=False,rootkey='',seen=()):
   if not isinstance(v,dict):return
   if 'default' in v:defaults.append({'schemaPointer':pointer,'field':fieldpath,'value':v['default']})
   if '$ref' in v:
    ref=v['$ref'];refs.append({'schemaPointer':pointer,'reference':ref})
    if ref.startswith('#/') and ref not in seen:
     target=schema
     for bit in ref[2:].split('/'):target=target[bit.replace('~1','/').replace('~0','~')]
     walk(target,pointer+'->$ref('+ref+')',fieldpath,required,rootkey,seen+(ref,))
   for k,child in v.get('properties',{}).items():
    fp=fieldpath+'.'+k if fieldpath else k;rk=rootkey or k
    fields.append({'field':fp,'schemaPointer':pointer+'/properties/'+k,'requiredByContainingObject':k in v.get('required',[]),'schema':child,'classification':classify(d['id'],rk,k),'currentAuthor':'test declaration config / suite merge / matrix variation; schema resolution may insert a default','resolver':resolver+':expandNodes -> configuration.ts:resolveTestProviderConfiguration -> schema.ts:resolve(useDefaults=true)','consumerModule':str(root/r['module']),'sourceOccurrences':locations(root,k),'operatorAuthority':False})
    walk(child,pointer+'/properties/'+k,fp,k in v.get('required',[]),rk,seen)
   if isinstance(v.get('items'),dict):walk(v['items'],pointer+'/items',fieldpath+'[]',False,rootkey,seen)
   if isinstance(v.get('additionalProperties'),dict):walk(v['additionalProperties'],pointer+'/additionalProperties',fieldpath+'.*',False,rootkey,seen)
   for branch in ['allOf','anyOf','oneOf']:
    for i,child in enumerate(v.get(branch,[])):walk(child,pointer+'/'+branch+'/'+str(i),fieldpath,required,rootkey,seen)
   for branch in ['if','then','else']:walk(v.get(branch),pointer+'/'+branch,fieldpath,required,rootkey,seen)
  walk(schema)
  providers.append({'pluginId':d['id'],'registrationId':r['id'],'contractId':r['contractId'],'kind':r['kind'],'manifest':str(p),'configSchema':str(schemaPath),'rawSchema':schema,'fields':fields,'schemaDefaults':defaults,'schemaReferences':refs,'requiredCapabilities':r['requiredCapabilities'],'runtimeConsumers':[runtime+capfiles[x] for x in r['requiredCapabilities'] if x in capfiles],'defaultApplyingResolver':registry+'configuration.ts:resolveTestProviderConfiguration','invocationConsumer':runner,'manifestPolicy':{k:r.get(k) for k in ['retrySafe','matrixFields','evidenceDefaults','reportFormats','inputs','outputs']},'proposedAuthority':'Keep declaration/effective resolved request in the plan; migrate operator capability ceilings separately to Buster config, not a duplicate per-plugin override.'})
for f in ['configuration.ts','schema.ts','test-providers.ts','build.ts','types.ts']:
 p=Path(registry+f)
 if p.exists():sources.add(p)
sources.update(Path('skills/nova/core/test-gates').glob('*.ts'))
sources.update(Path(runtime).glob('*.ts'))
sources.update(Path('contracts/pipeline-test-gate/v1').glob('*.json'))
sources.add(Path('contracts/pipeline-test-gate/v1/examples/e2e-playwright.json'))
for f in ['runner.ts','capability-runtime.ts','composite-capability-runtime.ts','remote-plan-service.ts','remote-prepared-execution.ts','preparation-header.ts']+list(capfiles.values()):sources.add(Path(runtime+f))
sources.update([Path('docker/buster-runtime-entrypoint.sh'),Path('my-values/buster-values.yaml'),Path('charts/kubeclaw/files/config/buster-engine.config.json'),Path('skills/common/plugin-runtime/foundation/config/swarm.ts')])
# Keep actual decoder/entrypoint expressions verbatim; no execution or emulation.
expressions=[]
for p in sorted(sources):
 if p.suffix not in ['.js','.ts','.sh']:continue
 for n,line in enumerate(p.read_text().splitlines(),1):
  if ('/plugins/' in str(p) and re.search(r'\?\?|fallback|=\s*[\[\'{][^;]*\)|integer\(|const [A-Z_]+|!== false|=== undefined|process.env|child_process',line)) or (p.name=='buster-runtime-entrypoint.sh' and ('process.env' in line or re.search(r'maximum|pollInterval|allowed|termination|Executable',line))):
   expressions.append({'path':str(p),'line':n,'expression':line.strip(),'classification':'provider request fallback/semantic bound' if '/plugins/' in str(p) else 'image/runtime operator author or installation/secret input; classify per report'})
(base/'mapping.json').write_text(json.dumps({'sourceOnly':True,'manifestCount':len(roster),'providerRegistrationCount':len(providers),'topLevelFieldCount':sum(len(x['rawSchema'].get('properties',{})) for x in providers),'fieldOccurrencesIncludingNestedRefsBranches':sum(len(x['fields']) for x in providers),'roster':roster,'providers':providers},indent=2)+'\n')
(base/'code-authorities.json').write_text(json.dumps(expressions,indent=2)+'\n')
report=Path('docs/review/remediation/implementation/config-testprovider-authority-20260921.md')
if report.exists():sources.add(report)
rows=[]
for p in sorted(sources):
 data=p.read_bytes();dest=base/'sources'/p;dest.parent.mkdir(parents=True,exist_ok=True)
 if dest.exists() and dest.read_bytes()!=data:
  dest=base/'sources-final'/p;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data)
 elif not dest.exists():dest.write_bytes(data)
 rows.append({'path':str(p),'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'snapshot':str(dest.relative_to(base))})
(base/'source-identities-final.json').write_text(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Named source inventory, not full runtime closure; 48-manifest roster exhaustive','runtimeExecuted':False,'files':rows},indent=2)+'\n')
print(len(roster),len(providers),len(rows),sum(len(x['fields']) for x in providers))
