#!/usr/bin/env python3
"""Trace security86 original policy sources; no runtime or independent acceptance."""
import importlib.util,json,re
from pathlib import Path
OUT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('helpers',OUT/'reconcile-platform-boundaries.py')
h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
LOCATOR='config/plugins/kubeclaw.security-providers.config.json'
BASE='skills/buster/plugins/security-providers/'
COMMON=BASE+'src/common.js'
CONSTRAINT='All86 original security-provider central receiving obligations remain OPEN. Five registered providers still consume invocation configuration, hardcoded PROFILES and strict-v1 POLICY, or manifest declarations; these are not centrally externalized merely because the original proposed locator is absent. Shared verdict flags are hardcoded business policy, not protocol invariants. Preserve actual decision-clock waiver expiry, finite vocabulary, scanner/database/capability/grant and original history/native obligations. No new private root, task author or denied-v10 promotion.'
def originals():
 return {r['id']:r for r in h.read(str((OUT/'fields.json').relative_to(h.ROOT))) if any(x['path']==LOCATOR for x in r['explicitConfigLocatorObservations'])}
def rows_from_sources():
 roster=h.read(h.ROSTER);refs={r['id']:r for r in roster['fields']};cache={};rows=[]
 manifest=h.read(BASE+'plugin.json')
 if len(manifest['testProviders'])!=5:raise ValueError('Provider roster drift')
 for identity,row in originals().items():
  ref=refs[identity];doc,loc=ref['original'].split('#',1)
  if doc not in cache:cache[doc]=h.read(roster['documents'][doc]['path'])
  original=h.pointer(cache[doc],loc)
  for key,value in [('original',ref['original']),('originalObjectSha256',ref['sha256']),('caseIds',ref['caseIds']),('class',original['class']),('owner',original['owner'])]:
   if row[key]!=value:raise ValueError('Original drift: '+identity)
  src=original['source'];r={k:row[k] for k in ['id','original','originalObjectSha256','caseIds','class','owner']}
  r.update(originalSource=src,centralPhysicalAuthor=None,runtimeAcceptance='OPEN; original results unchanged',independentReview='OPEN')
  if src['path'].endswith('/plugin.json'):
   match=re.fullmatch(r'testProviders\[(\d+)\]\.(.+)',src['field'])
   if not match:raise ValueError('Manifest source pointer')
   index=int(match[1]);field=match[2];entry=manifest['testProviders'][index];pointer='/testProviders/'+str(index)+'/'+field.replace('.','/')
   value=h.pointer(manifest,pointer)
   if field.startswith('evidenceDefaults.'):
    outcome=field.split('.')[1];effect=h.anchor('skills/nova/core/test-gates/resolver.ts','provider.registration.evidenceDefaults.'+outcome)
   elif field=='retrySafe':effect=h.anchor('skills/nova/core/test-gates/resolver.ts','if (!effectiveProvider.registration.retrySafe && retryCount > 0')
   elif field=='matrixFields':effect=h.anchor('skills/nova/core/test-gates/resolver.ts','!provider.registration.matrixFields.includes(field)')
   else:raise ValueError('Unknown manifest declaration')
   r.update(status='MANIFEST_DECLARATION_CENTRAL_RECEIVING_OPEN',originalField=field,registration=entry['id'],currentAuthor={**h.pin(src['path']),'pointer':pointer,'valueSha256':h.digest(value)},actualEffects=[effect])
  elif src['path']==COMMON:
   field=original['field'];text={'blockingSeverities':'resolvedPolicy.blockingSeverities.includes(finding.severity)','blockActiveThreats':"resolvedPolicy.blockActiveThreats && finding.status === 'affected'",'blockMissingFixes':"resolvedPolicy.blockMissingFixes && finding.category === 'vulnerability'"}[field]
   r.update(status='HARDCODED_SHARED_VERDICT_POLICY_CENTRAL_RECEIVING_OPEN',originalField=field,registration='shared all five',currentAuthor=h.anchor(COMMON,'const POLICY = Object.freeze'),actualEffects=[h.anchor(COMMON,text)])
  else:
   field=original['field'];schema=src['path'];pointer=src['field'].split(' -> ')[-1].removeprefix('#');fragment=h.pointer(h.read(schema),pointer)
   entry=next(e for e in manifest['testProviders'] if BASE+e['configSchema']==schema)
   module=BASE+entry['module']
   if field.startswith('policy'):
    effects=[h.anchor(COMMON,{'policy':'export function policy(value)','policy.profile':'item.profile !== POLICY.profile','policy.acceptances':'acceptances: acceptances(item.acceptances)','policy.acceptances[]':'return list.map((entry)', 'policy.acceptances[].findingId':'accepted.get(finding.id)','policy.acceptances[].reason':'reason: waiver.reason','policy.acceptances[].expiresAt':'Date.parse(waiver.expiresAt) > now'}[field])]
   elif field=='profile':effects=[h.anchor(module,'const base = PROFILES[profileName]'),h.anchor(module,"value.profile === 'web-https-v1'")]
   elif field in ['timeoutMs','requestTimeoutMs']:effects=[h.anchor(module,field+': integer(value.'+field),h.anchor(module,'timeoutMs: config.'+field)]
   elif field.startswith('rules'):
    leaf=field.rsplit('.',1)[-1]
    text='const remove = value.remove' if field.startswith('rules.remove') else 'const replace = (value.replace' if field in ['rules.add','rules.add[]','rules.replace','rules.replace[]'] else 'const base = PROFILES[profileName]' if field=='rules' else {'id':'typeof item.id','header':'typeof item.header','severity':'SEVERITIES.includes(item.severity)','kind':"item.kind !== 'present'",'value':"typeof item.value !== 'string'"}[leaf]
    effects=[h.anchor(module,text)]
   else:raise ValueError('Unmapped security field: '+field)
   r.update(status='INVOCATION_AND_HARDCODED_POLICY_CENTRAL_RECEIVING_OPEN',originalField=field,registration=entry['id'],schema={**h.pin(schema),'pointer':pointer,'fragmentSha256':h.digest(fragment)},actualEffects=effects,entrypoint=h.anchor(module,'const config = configuration(invocation'))
  rows.append(r)
 if len(rows)!=86 or len({r['id'] for r in rows})!=86:raise ValueError('Security86 roster drift')
 return rows
def validate(result):
 if result['rows']!=rows_from_sources():raise ValueError('Security source matrix drift')
 if result['originalCasesNewlyAccepted']!=0 or result['fullC0C6Complete'] is not False:raise ValueError('False acceptance')
 return True
def build():
 full=h.build();result={'scope':'Exact security86 source lanes only; not implementation or acceptance','constraint':CONSTRAINT,'rows':rows_from_sources(),'preservedCounts':full['preservedCounts'],'originalCasesNewlyAccepted':0,'fullC0C6Complete':False,'independentReview':'OPEN'};validate(result);return result
if __name__=='__main__':
 result=build();(OUT/'security-provider-successors.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'fields':len(result['rows']),'preservedCounts':result['preservedCounts']}))
