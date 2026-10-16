#!/usr/bin/env python3
"""Exact engine source joins; literal rendering/provider residuals are never closed."""
import copy
import importlib.util
import json
from pathlib import Path
OUT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('helpers', OUT / 'reconcile-adapters.py')
h = importlib.util.module_from_spec(spec)
spec.loader.exec_module(h)
OWNER = 'config/components/prism-execution.config.json'
LEGACY = 'config/engines/prism.config.json'
ENGINE = 'skills/prism/engine/index.ts'
RENDER = 'skills/prism/engine/render-operation.ts'
CACHE = 'skills/prism/engine/execution-cache.ts'
SPECS = {
 'AUTH-PRISM-CACHE-maximumInFlight': ('cache/maximumInFlight', 'DEFAULT_ENGINE_CACHE_LIMITS.maximumInFlight', CACHE, 'this.#pending.size >= this.#limits.maximumInFlight'),
 'AUTH-PRISM-CACHE-maximumCompletedEntries': ('cache/maximumCompletedEntries', 'DEFAULT_ENGINE_CACHE_LIMITS.maximumCompletedEntries', CACHE, 'this.#completed.size >= this.#limits.maximumCompletedEntries'),
 'AUTH-PRISM-CACHE-maximumCompletedBytes': ('cache/maximumCompletedBytes', 'DEFAULT_ENGINE_CACHE_LIMITS.maximumCompletedBytes', CACHE, 'bytes > this.#limits.maximumCompletedBytes'),
 'AUTH-PRISM-INGEST-TEXT-LIMIT': ('maximumIngestTextCharacters', 'ingest.text.length', ENGINE, 'text.length > this.policy.maximumIngestTextCharacters'),
 'AUTH-PRISM-RENDER-ASSET-LENGTH': ('maximumAssetSourceCharacters', 'src.length', RENDER, 'src.length > maximumAssetSourceCharacters'),
}
RESIDUALS = {
 'AUTH-PRISM-DESIGN-PROVIDER-TIMEOUT': ('options.timeoutMs', 'skills/prism/engine/design-providers.ts', 'options.timeoutMs ?? 60_000'),
 'AUTH-PRISM-RENDER-WIDTH-COMPACT': ('compact', RENDER, 'compact: 390'),
 'AUTH-PRISM-RENDER-WIDTH-REGULAR': ('regular', RENDER, 'regular: 768'),
 'AUTH-PRISM-RENDER-WIDTH-WIDE': ('wide', RENDER, 'wide: 1440'),
 'AUTH-PRISM-RENDER-HEIGHT': ('height', RENDER, 'height: 1000'),
 'AUTH-PRISM-RENDER-LOCALE': ('locale', RENDER, 'locale: "en-US"'),
 'AUTH-PRISM-RENDER-TIMEZONE': ('timezoneId', RENDER, 'timezoneId: "UTC"'),
 'AUTH-PRISM-RENDER-MOTION': ('reducedMotion', RENDER, 'reducedMotion: "reduce"'),
}
def build(ledgers=None, owner=None):
 roster = h.read(h.ROSTER)
 refs = {r['id']: r for r in roster['fields']}
 ledgers = h.read(str((OUT / 'fields.json').relative_to(h.ROOT))) if ledgers is None else ledgers
 owner = h.read(OWNER) if owner is None else owner
 if owner['owner'] != 'prism-execution' or owner['schemaVersion'] != 'pipeline-component.v2': raise ValueError('Owner/version drift')
 rows, seen, cache = [], set(), {}
 for row in ledgers:
  if not any(x['path'] == LEGACY for x in row['explicitConfigLocatorObservations']): continue
  identity = row['id']
  if identity not in set(SPECS) | set(RESIDUALS) or identity in seen: raise ValueError('Unknown/duplicate engine field: ' + identity)
  seen.add(identity)
  ref = refs[identity]
  if row['original'] != ref['original'] or row['originalObjectSha256'] != ref['sha256'] or row['caseIds'] != ref['caseIds']: raise ValueError('Original identity/hash/cases drift')
  doc, ptr = ref['original'].split('#', 1)
  source = roster['documents'][doc]['path']
  if source not in cache: cache[source] = h.read(source)
  original = h.pointer(cache[source], ptr)
  if h.digest(original) != ref['sha256'] or row['owner'] != original['owner'] or row['class'] != original['class']: raise ValueError('Original object/class/owner drift')
  expected = SPECS[identity][1] if identity in SPECS else RESIDUALS[identity][0]
  if original['source']['field'] != expected: raise ValueError('Original source coordinate drift')
  common = {k: row[k] for k in ['id', 'original', 'originalObjectSha256', 'class', 'owner', 'caseIds']}
  common.update(historicalLocator=LEGACY, originalSource=original['source'], originalHistoryObligation=original['recoveryRetryClaimDeadlineBudgetEffects'], runtimeAcceptance='NOT_INFERRED; original cases/results unchanged', historyAcceptance='OPEN; startup/assigned-child snapshot is NOT durable original-attempt recovery proof')
  if identity in SPECS:
   leaf, _, effect, text = SPECS[identity]
   leaves = []
   for profile in sorted(owner['profiles']):
    ptr = '/profiles/' + profile.replace('~','~0').replace('/','~1') + '/settings/enginePolicy/' + leaf
    leaves.append({'profile':profile,'pointer':ptr,'valueSha256':h.digest(h.pointer(owner,ptr))})
   if not leaves: raise ValueError('No authored profiles')
   common.update(status='EXACT_PRISM_ENGINE_SOURCE_JOIN', selectedOwner=h.pin(OWNER), selectedPointerTemplate='/profiles/<original-selected>/settings/enginePolicy/'+leaf, authoredProfileLeaves=leaves,
    actualEffect=h.anchor(effect,text), immutableReceiver=h.anchor('skills/prism/config/engine-policy.ts','return Object.freeze({ cache: Object.freeze'),
    composition=h.anchor('skills/common/plugin-runtime/foundation/config/pipeline-composition.ts',"'resourcePolicy' | 'maximumResultBytes' | 'enginePolicy'"),
    assignedChild=h.anchor('skills/prism/server/native-worker-execution.ts','PRISM_NATIVE_ASSIGNED_ENGINE_POLICY: JSON.stringify(config.native.enginePolicy)'),
    assignedReceiver=h.anchor('skills/prism/config/native-worker.ts','const enginePolicy = readPrismEnginePolicy(assigned)'),
    actualCaller=h.anchor('skills/prism/server/native-worker-host.ts','new PrismEngine(new DeterministicDesignProvider(), config.enginePolicy)'),
    startupCapture=h.anchor('skills/common/plugin-runtime/foundation/config/pipeline-boot.mjs','verifiedCaptures.add(result)'))
   if leaf.startswith('cache/'):
    common['cacheConstruction'] = h.anchor(ENGINE,'new EngineExecutionCache(this.policy.cache)')
    if leaf.endswith('maximumCompletedBytes'): common['aggregateEffect'] = h.anchor(CACHE,'this.#completedBytes + bytes > this.#limits.maximumCompletedBytes')
   if identity == 'AUTH-PRISM-RENDER-ASSET-LENGTH': common['renderHandoff'] = h.anchor(ENGINE,'this.policy.maximumAssetSourceCharacters')
  else:
   _, path, text = RESIDUALS[identity]
   common.update(status='PRISM_ENGINE_RECEIVING_IMPLEMENTATION_OPEN',selectedOwner=None,actualLiteral=h.anchor(path,text),
    closedCurrentCodec=h.anchor('skills/prism/config/engine-policy.ts',"'cache,maximumAssetSourceCharacters,maximumIngestTextCharacters'"),
    constraint='Render dimensions/locale/timezone/motion need coherent versioned selected engine receiving, browser/metadata consumers, original attempt capture and normal delivery. Do not silently add fields to the existing closed codec or infer coverage from enginePolicy section presence.')
   if identity == 'AUTH-PRISM-DESIGN-PROVIDER-TIMEOUT':
    common['constraint'] = 'Optional HTTP DesignProvider timeout still defaults60000; actual native host constructs DeterministicDesignProvider. Need exact productive provider selection/receiving and original package/attempt closure; do not substitute native attempt timeout, invent a model/paid provider, or claim a currently exercised HTTP provider.'
    common['actualNativeProvider'] = h.anchor('skills/prism/server/native-worker-host.ts','new PrismEngine(new DeterministicDesignProvider(), config.enginePolicy)')
   if identity == 'AUTH-PRISM-RENDER-WIDTH-WIDE': common['fallbackEffect'] = h.anchor(RENDER,'?? 1440')
   if identity == 'AUTH-PRISM-RENDER-TIMEZONE': common['metadataEffect'] = h.anchor(RENDER,'timezone: "UTC"')
   if identity == 'AUTH-PRISM-RENDER-MOTION': common['metadataEffect'] = h.anchor(RENDER,'motion: "reduced"')
  rows.append(common)
 if seen != set(SPECS) | set(RESIDUALS): raise ValueError('Missing original engine fields')
 return {'scope':'13 original Prism engine fields; five existing selected source joins and eight explicit receiving residuals', 'inputs':[h.pin(h.ROSTER),h.pin(str((OUT/'fields.json').relative_to(h.ROOT)))], 'counts':{'originalFields':len(rows),'exactSourceJoins':len(SPECS),'remainingOriginalFields':len(RESIDUALS)},'rows':rows,'independentReview':'OPEN; native spawn unavailable; known unchanged EROFS helper not retried','fullAcceptance':'OPEN; all2409/6845/50/fullC0-C6 and original history/native/archive gates mandatory'}
def controls():
 baseline = build()
 ledger = h.read(str((OUT/'fields.json').relative_to(h.ROOT)))
 i = next(i for i,r in enumerate(ledger) if r['id']=='AUTH-PRISM-CACHE-maximumInFlight')
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
 owner=h.read(OWNER);del owner['profiles']['standard']['settings']['enginePolicy']['cache']['maximumInFlight']
 try: build(owner=owner)
 except KeyError as error: results.append({'control':'missing-selected-leaf','rejected':True,'error':str(error)})
 else: raise AssertionError('Accepted missing leaf')
 if baseline != build(): raise AssertionError('Restored nondeterminism')
 return {'controls':results,'restoredPositive':'PASS','qualification':'Matrix controls only; zero original runtime/native/history cases executed'}
if __name__=='__main__':
 result,checked=build(),controls()
 (OUT/'prism-engine-successors.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
 (OUT/'prism-engine-controls.json').write_text(json.dumps(checked,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({'counts':result['counts'],'rejectedControls':len(checked['controls']),'fullAcceptance':'OPEN'}))
