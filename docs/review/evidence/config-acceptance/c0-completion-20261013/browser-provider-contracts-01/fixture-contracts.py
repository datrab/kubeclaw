import json,hashlib,copy
from pathlib import Path
O=Path('docs/review/evidence/config-acceptance/c0-completion-20261013/browser-provider-contracts-01');read=lambda p:json.loads(Path(p).read_text());sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest();write=lambda n,x:(O/n).write_text(json.dumps(x,indent=2)+'\n')
F=O/'task-fixtures/repository/browser-pages';F.mkdir(exist_ok=True)
head='<!doctype html><html lang="en"><head><title>Bound source fixture</title><meta name="viewport" content="width=device-width"></head><body><main><h1>E2E ready</h1>'
img=lambda id,alt='':f'<img id="{id}" width="80" height="80" {alt} src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7">'
html={'axe-waiver':head+img('case')+'</main></body></html>','axe-tags':head+img('case')+'<p id="contrast" style="color:#aaa;background:white">Visible AA contrast failure</p></main></body></html>','axe-exclude':head+img('a')+img('b')+'</main></body></html>','lighthouse-seo':head+'<p>No meta description intentionally</p></main></body></html>','visual-mask':head+'<style>body{margin:0;background:black}#a{position:absolute;left:0;top:0;width:80px;height:80px;background:#404040}#b{position:absolute;left:100px;top:0;width:80px;height:80px;background:black}</style><div id="a"></div><div id="b"></div></main></body></html>','playwright-primary':head+'</main></body></html>','playwright-alternate':head.replace('E2E ready','E2E alternate')+'</main></body></html>'}
for name,body in html.items():(F/f'{name}.html').write_text(body)
fields=read(O/'field-definitions.json')['rows'];oracles=read(O/'field-oracles.json')['entries'];assets=[];axis=[f for f in fields if f['classification']=='owned-browser-profile']
owners={p:read(O/f'stand/config/plugins/kubeclaw.{p}.config.json')for p in ['axe','lighthouse','playwright','visual']}
# Isolate acceptance scope from competing AA violations/profiles on both sides; active whole pair explicit, not a silent singleton transplant.
for f in fields:
 if f['provider']=='axe'and f['field'].startswith('acceptances'):
  for side in ['A','B']:
   name=f['wholeProfiles'][side]
   if name:
    q=owners['axe']['profiles'][name]['processing'];q['tags']=['wcag2a'];q['selectedProfiles']=['desktop']
for p,d in owners.items():write(f'stand/config/plugins/kubeclaw.{p}.config.json',d)
# Actual browser observable -> DOM image-alt control. No JS is run now.
expr={'browser':"navigator.userAgent.includes('Firefox') ? 'firefox' : navigator.userAgent.includes('Chrome') ? 'chromium' : 'webkit'",'width':'window.innerWidth','height':'window.innerHeight','colorScheme':"matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light'",'reducedMotion':"matchMedia('(prefers-reduced-motion:reduce)').matches ? 'reduce' : 'no-preference'",'locale':"Intl.NumberFormat().resolvedOptions().locale",'timezoneId':"Intl.DateTimeFormat().resolvedOptions().timeZone",'hasTouch':'navigator.maxTouchPoints > 0','isMobile':'window.innerWidth === 980','deviceScaleFactor':'window.devicePixelRatio'}
for f in axis:
 field=f['field'];name=field.split('.')[0];leaf=field.split('.')[-1];q=owners['axe']['profiles'][f['wholeProfiles']['A']]['processing']['profiles'][name];value=q['viewport'][leaf]if leaf in ['width','height']else q[leaf];control=expr[leaf];h=head+img('case')+f'<script>const observed=({control});document.documentElement.dataset.observed=String(observed);if(observed==={json.dumps(value)})document.getElementById("case").alt="baseline condition";</script></main></body></html>'
 if leaf=='isMobile':h=h.replace('width=device-width','width=980');# Layout signal is purpose-specific; UA echo is never substituted for this behavior.
 p=F/f'{f["id"]}.html';p.write_text(h);assets.append({'settingId':f['id'],'path':str(p),'sha256':sha(p),'actualDOMObserver':control,'AExpectedContextValue':value,'BProfileReference':f['wholeProfiles']['B'],'expectedControl':'DOM alt reflects actual page observable, not copied profile metadata; exact browser/library platform identity and supported behavior must be demonstrated. isMobile width980 fixture is a future native layout probe, not a guaranteed pure-browser result.','nativeStatus':'not-run'})
contracts=[]
for f in fields:
 fam=next(x for x in oracles if x['settingId']==f['id'])['family'];asset='axe-waiver'if 'waiver'in fam and f['provider']=='axe'else 'axe-tags'if fam=='axe-rule-tag-filter'else 'axe-exclude'if fam=='axe-dom-coverage-exclusion'else 'lighthouse-seo'if fam=='lighthouse-seo-audit-waiver'else 'visual-mask'if fam=='visual-task-target-mask-association'else 'playwright-primary'if f['provider']=='playwright'else None
 refs=[{'path':str(F/f'{asset}.html'),'sha256':sha(F/f'{asset}.html')}]if asset else []
 if f['classification']=='owned-browser-profile':refs=[x for x in assets if x['settingId']==f['id']]
 contracts.append({'settingId':f['id'],'originalCaseIds':f['originalGroupMember']['originalCaseIds'],'family':fam,'safeLocalDefinitionRefs':refs,'futureServingDefinition':{'method':'GET','originA':'http://127.0.0.1:18080','originB':'http://127.0.0.1:18081','routes':['/a','/b'],'sameCaseBothSides':'Same exact fixture asset/source/version/seed/claims/counters for policy A/B; task source/data case variants explicit separately','noHostedEndpointClaim':True},'timingFixtureApplicability':'For timeout families, use actual stable bounded response/analyze/process workload with measured phase completion strictly between A/B and original original host/caller/claim budgets. Reject unqualified or earlier competing guard fixture; do NOT mark original case passed based on fake source arithmetic. Native execution/fixture host remains not-run.','LighthouseBudgetApplicability':'For budget/source settings pairs actual SAME captured representative report must place selected metric between declared A80/B90 without competing budget/errors. Synthetic85 report proves helper definition only; actual Chrome/version/fixture performance variance qualification is OPEN. No uncontrolled score guarantee or arbitrary numeric-midpoint native substitute.','VisualApplicability':'Defined PNG is not approved screenshot. Future genuine browser-bound approved baseline and current capture (same exact version, viewport/page conditions/masks/origin/source/profile/claim) required; dimensions mismatch/version mismatch reject, not a native positive. Preserve original alternate/effect/BIND/MUT/recovery/cleanup/fixed Eval obligations.'})
write('future-fixture-contracts.json',{'contracts':contracts,'axisDOMControls':assets,'notHostedNotExecuted':True})
# Actual source producer service geometry; unsigned shape only. These local YAML bytes are intent fixtures, not Kube receipts.
yaml='''apiVersion: v1
kind: Service
metadata:
  name: service-a
spec:
  selector:
    app: real-pipeline-e2e-nginx
  ports:
    - port: 18080
      targetPort: 80
---
apiVersion: v1
kind: Service
metadata:
  name: service-b
spec:
  selector:
    app: real-pipeline-e2e-nginx
  ports:
    - port: 18081
      targetPort: 80
''';(O/'task-fixtures/repository/selector-service-intents.yaml').write_text(yaml)
# Precise numeric/read method coordinates, no scanner fiction or global exclusion.
extra=read(O/'processing-source-obligations.json');needles={'axe':['262144','Object.keys(custom).length > 32','const selected =','config.timeoutMs ?? 30000'],'lighthouse':['262144','profileNames.length','budgetNames.length','Number.MIN_VALUE','const runCount =','const representative ='],'visual':['1024 * 1024','document.entries.length > 128','64 * 1024 * 1024','width * height','config.targets.length * 3','policy.maximumDifferencePercent','uncertain ='],'playwright':['invocation.limits.processes - 4','Math.min(config.timeoutMs','minimumExecuted','maximumResultBytes: Math.min']}
for member in extra['members']:
 lines=Path(member['path']).read_text().splitlines();p=Path(member['path']).parts[-3]if '/plugins/'in member['path']else 'lighthouse'if 'lighthouse'in member['path']else 'visual';member['exactSourceCoordinates']=[{'line':i,'text':line,'sourceSha256':member['sourceSha256']}for i,line in enumerate(lines,1)if any(n in line for n in needles.get(p,[]))];member['associatedOriginalCaseRefs']=[{'id':id,'artifact':'case-definitions.json'}for id in sorted({id for f in fields if f['id']in member['associatedOriginalIds']for id in f['originalGroupMember']['originalCaseIds']})]
write('processing-source-coordinate-adjudication.json',extra)
# Update physical full-profile hashes after explicit paired isolation; receiver regeneration command follows.
for f in fields:
 for side in ['A','B']:
  name=f['wholeProfiles'][side];f['wholeProfileHashes'][side]=hashlib.sha256(json.dumps(owners[f['provider']]['profiles'][name],sort_keys=True,separators=(',',':')).encode()).hexdigest()if name else None
write('field-definitions.json',{'rows':fields})
print(json.dumps({'axisDOMControls':len(assets),'originalFixtureContracts':len(contracts),'explicitPairedAxeWaiverIsolation':8,'nativeExecution':0}))
