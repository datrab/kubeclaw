#!/usr/bin/env python3
"""Exact Control source joins; role and ranking residuals remain open."""
import copy
import importlib.util
import json
from pathlib import Path
OUT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('helpers', OUT / 'reconcile-adapters.py')
h = importlib.util.module_from_spec(spec)
spec.loader.exec_module(h)
OWNER = 'config/components/prism-control.config.json'
LEGACIES = {'config/services/prism.config.json'}
HTTP = 'skills/prism/server/control-http.ts'
ROUTES = 'skills/prism/server/corpus-routes.ts'
CORPUS = 'skills/prism/corpus/index.ts'
SESSION = 'skills/prism/control/session.ts'
SPECS = {
 'AUTH-PRISM-CONTROL-SESSION-TTL': ('sessionLifetimeSeconds','mintSession expiresAt',SESSION,'expiresAt: now + lifetimeSeconds * 1000'),
 'AUTH-PRISM-CONTROL-HTTP-BODY-BYTES': ('maximumJsonBodyBytes','body maxBytes default',HTTP,'if (size > maxBytes)'),
 'AUTH-PRISM-CONTROL-ARTIFACT-WIRE-BYTES': ('maximumArtifactUploadBodyBytes','uploadArtifact body(request,8500000)',ROUTES,'body(request, context.config.maximumArtifactUploadBodyBytes)'),
 'AUTH-PRISM-CONTROL-ARTIFACT-DECODED-BYTES': ('maximumArtifactBytes','uploadArtifact decoded.byteLength',ROUTES,'decoded.byteLength > context.config.maximumArtifactBytes'),
 'AUTH-PRISM-CONTROL-SEARCH-DEFAULT-LIMIT': ('corpusSearchDefaultLimit','searchCorpus limit default; search limit default',ROUTES,'url.searchParams.get("limit") ?? config.corpusSearchDefaultLimit'),
 'AUTH-PRISM-CONTROL-SEARCH-MAX-LIMIT': ('corpusSearchMaximumLimit','searchCorpus Math.min(50,...)',ROUTES,'Math.min(config.corpusSearchMaximumLimit'),
 'AUTH-PRISM-CONTROL-SEARCH-FAMILY-DEFAULT': ('corpusSourceFamilyDefaultLimit','searchCorpus sourceFamilyLimit ??2; search options fallback',ROUTES,'url.searchParams.get("sourceFamilyLimit") ?? config.corpusSourceFamilyDefaultLimit'),
 'AUTH-PRISM-CONTROL-SEARCH-FAMILY-MAX': ('corpusSourceFamilyMaximumLimit','sourceFamilyLimit Math.min(10,...)',ROUTES,'config.corpusSourceFamilyMaximumLimit,'),
 'AUTH-PRISM-CONTROL-CORPUS-ACQUIRE-TIMEOUT': ('ingestionAcquireTimeoutMs','acquireCorpus AbortSignal.timeout',ROUTES,'AbortSignal.timeout(config.ingestionAcquireTimeoutMs)'),
 'AUTH-PRISM-CONTROL-CORPUS-CLEANUP-TIMEOUT': ('ingestionCleanupTimeoutMs','cleanAcquisition AbortSignal.timeout',ROUTES,'AbortSignal.timeout(config.ingestionCleanupTimeoutMs)'),
}
RESIDUALS = {
 'AUTH-PRISM-CONTROL-SESSION-DEFAULT-ROLES': ('mintSession roles default',SESSION,'roles=["editor"]','Default editor role remains literal; selected role domain and token/original semantics must be explicit. Do not change grants or add authentication authority hardening.'),
 'AUTH-PRISM-CONTROL-SEARCH-CANDIDATE-FLOOR': ('SQL LIMIT100 and Math.max(limit*10,100)',CORPUS,'Math.max(limit * 10, 100)','Two SQL inner LIMIT 100 and both outer candidate floors100 remain literals. Coupled selected receiving for actual HTTP/direct search and original query policy required; not the result limit.'),
 'AUTH-PRISM-CONTROL-SEARCH-CANDIDATE-MULTIPLIER': ('Math.max(limit*10,100)',CORPUS,'Math.max(limit * 10, 100)','Both SQL query branches retain oversampling multiplier10. Coherent candidate policy/receiving and original query binding required; no private policy root.'),
 'AUTH-PRISM-CONTROL-SEARCH-RRF-DAMPING': ('1.0/(60+rank)',CORPUS,'1.0/(60+t.rank)','Both rank arms retain damping60. Explicit selected ranking compatibility and actual DB/original acceptance remain required; ranking label is not proof of a protocol constant.'),
}
def build(ledgers=None, owner=None):
 roster=h.read(h.ROSTER);refs={r['id']:r for r in roster['fields']}
 ledgers=h.read(str((OUT/'fields.json').relative_to(h.ROOT))) if ledgers is None else ledgers
 owner=h.read(OWNER) if owner is None else owner
 if owner['owner']!='prism-control' or owner['schemaVersion']!='pipeline-component.v2':raise ValueError('Owner/version drift')
 rows=[];seen=set();cache={}
 for row in ledgers:
  locators=[x['path'] for x in row['explicitConfigLocatorObservations'] if x['path'] in LEGACIES]
  if not locators:continue
  identity=row['id']
  if identity not in set(SPECS)|set(RESIDUALS) or identity in seen:raise ValueError('Unknown/duplicate attempt field: '+identity)
  seen.add(identity);ref=refs[identity]
  if row['original']!=ref['original'] or row['originalObjectSha256']!=ref['sha256'] or row['caseIds']!=ref['caseIds']:raise ValueError('Original identity/hash/cases drift')
  doc,ptr=ref['original'].split('#',1);source=roster['documents'][doc]['path']
  if source not in cache:cache[source]=h.read(source)
  original=h.pointer(cache[source],ptr)
  if h.digest(original)!=ref['sha256'] or row['owner']!=original['owner'] or row['class']!=original['class']:raise ValueError('Original object/class/owner drift')
  expected=SPECS[identity][1] if identity in SPECS else RESIDUALS[identity][0]
  if original['source']['field']!=expected:raise ValueError('Original source coordinate drift')
  common={k:row[k] for k in ['id','original','originalObjectSha256','class','owner','caseIds']}
  common.update(historicalLocator=locators[0],originalSource=original['source'],originalHistoryObligation=original['recoveryRetryClaimDeadlineBudgetEffects'],runtimeAcceptance='NOT_INFERRED; zero original cases executed; original results unchanged',historyAcceptance='OPEN; source envelope/storage anchors are not executed original recovery proof')
  if identity in SPECS:
   leaf,_,effect,text=SPECS[identity];leaves=[]
   for profile in sorted(owner['profiles']):
    ptr='/profiles/'+profile.replace('~','~0').replace('/','~1')+'/settings/'+leaf
    leaves.append({'profile':profile,'pointer':ptr,'valueSha256':h.digest(h.pointer(owner,ptr))})
   if not leaves:raise ValueError('No profiles')
   common.update(status='EXACT_PRISM_CONTROL_SOURCE_JOIN',selectedOwner=h.pin(OWNER),selectedPointerTemplate='/profiles/<original-selected>/settings/'+leaf,authoredProfileLeaves=leaves,actualReceivingEffect=h.anchor(effect,text),startupCapture=h.anchor('skills/common/plugin-runtime/foundation/config/pipeline-boot.mjs','verifiedCaptures.add(result)'))
   common.update(composition=h.anchor('skills/prism/server/control-config.ts',leaf+': control.'+leaf),roleProjection=h.anchor('skills/common/plugin-runtime/foundation/config/pipeline-composition.ts',"assertPipelineBootCapture(capture, 'prism-control')"))
   if leaf=='sessionLifetimeSeconds':
    common.update(actualCaller=h.anchor('skills/prism/server/session-routes.ts','context.config.sessionLifetimeSeconds,'),cookieProjection=h.anchor('skills/prism/server/session-routes.ts','Max-Age=${context.config.sessionLifetimeSeconds}'),expiryVerifier=h.anchor(SESSION,'session.expiresAt <= now'))
   elif leaf=='maximumJsonBodyBytes':common['actualCaller']=h.anchor(ROUTES,'body(request, context.config.maximumJsonBodyBytes)')
   elif leaf.startswith('corpus'):
    common['directSearchReceiving']=h.anchor(CORPUS,'valid corpus search limits required')
    common['qualification']='HTTP defaults/clamps are selected policy; exported direct search now requires explicit limits, not a duplicate default. Direct API is not silently given the HTTP maximum.'
   if leaf.startswith('ingestion'):
    common['qualification']='Startup timeout source join only; no durable original acquisition endpoint/credential/uncertain effect reconstruction inferred.'

  else:
   _,path,text,constraint=RESIDUALS[identity];common.update(status='PRISM_CONTROL_RECEIVING_IMPLEMENTATION_OPEN',selectedOwner=None,actualLiteral=h.anchor(path,text),constraint=constraint)
  rows.append(common)
 if seen!=set(SPECS)|set(RESIDUALS):raise ValueError('Missing original attempt fields')
 return {'scope':'14 original Control fields;10 exact existing source joins and4 explicit receiving residuals, no new settings or runtime passes','inputs':[h.pin(h.ROSTER),h.pin(str((OUT/'fields.json').relative_to(h.ROOT)))],'counts':{'originalFields':len(rows),'exactSourceJoins':len(SPECS),'remainingOriginalFields':len(RESIDUALS)},'rows':rows,'independentReview':'OPEN; native spawn unavailable; unchanged direct reviewer EROFS not retried','fullAcceptance':'OPEN; all2409/6845/50/fullC0-C6 and original history/native/archive mandatory'}
def controls():
 baseline = build()
 ledger = h.read(str((OUT/'fields.json').relative_to(h.ROOT)))
 i = next(i for i,r in enumerate(ledger) if r['id']=='AUTH-PRISM-CONTROL-SESSION-TTL')
 results=[]
 for key,value in [('id','FOREIGN'),('original','FOREIGN#/0'),('originalObjectSha256','0'*64),('caseIds',[]),('class','protocol'),('owner','wrong')]:
  mutant=copy.deepcopy(ledger);mutant[i][key]=value
  try: build(ledgers=mutant)
  except (ValueError,KeyError) as error: results.append({'control':key+'-drift','rejected':True,'error':str(error)})
  else: raise AssertionError('Accepted mutant: '+key)
 mutant=copy.deepcopy(ledger);mutant.append(copy.deepcopy(ledger[i]))
 try: build(ledgers=mutant)
 except ValueError as error: results.append({'control':'duplicate-id','rejected':True,'error':str(error)})
 else: raise AssertionError('Accepted duplicate')
 owner=h.read(OWNER);del owner['profiles']['standard']['settings']['sessionLifetimeSeconds']
 try: build(owner=owner)
 except KeyError as error: results.append({'control':'missing-selected-leaf','rejected':True,'error':str(error)})
 else: raise AssertionError('Accepted missing leaf')
 if baseline != build(): raise AssertionError('Restored nondeterminism')
 return {'controls':results,'restoredPositive':'PASS','qualification':'Matrix controls only; zero original runtime/native/history cases executed'}
if __name__=='__main__':
 result,checked=build(),controls()
 (OUT/'prism-control-successors.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
 (OUT/'prism-control-controls.json').write_text(json.dumps(checked,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({'counts':result['counts'],'rejectedControls':len(checked['controls']),'fullAcceptance':'OPEN'}))
