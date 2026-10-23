#!/usr/bin/env python3
"""Exact four original instruction/product/budget source lanes; never runtime acceptance."""
import copy
import importlib.util
import json
from pathlib import Path
OUT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('helpers',OUT/'reconcile-platform-boundaries.py')
h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
IDS={'RT-REVIEW-PROMPT-BOUNDARY-RESERVE','AUTH-PRISM-DESIGN-SYSTEM-PROMPT','AUTH-PRISM-PRODUCT-ENABLE','AUTH-PRISM-PRODUCT-DECISION-TTL'}
CONSTRAINT='One existing selected Control lifetime source join; product enable remains ENV-authored, design instruction remains dormant HTTP-provider literal, Review boundary reserve remains source literal. No new owner or authority, no original outcome changed; original/history/independent/native/full C0-C6 acceptance OPEN.'
def build():
 full=h.build()
 roster=h.read(h.ROSTER);originals={r['id']:r for r in roster['fields']};cache={}
 rows=[]
 for row in h.read(str((OUT/'fields.json').relative_to(h.ROOT))):
  if row['id'] not in IDS:continue
  ref=originals[row['id']];doc,loc=ref['original'].split('#',1)
  if doc not in cache:cache[doc]=h.read(roster['documents'][doc]['path'])
  original=h.pointer(cache[doc],loc)
  if any(row[k]!=v for k,v in [('original',ref['original']),('originalObjectSha256',ref['sha256']),('caseIds',ref['caseIds']),('class',original['class']),('owner',original['owner'])]):raise ValueError('Original identity drift')
  r={k:row[k] for k in ['id','original','originalObjectSha256','caseIds','class','owner']}
  r.update(originalSource=original['source'],centralPhysicalAuthor=None,runtimeAcceptance='OPEN; original results unchanged',independentReview='OPEN')
  if r['id']=='RT-REVIEW-PROMPT-BOUNDARY-RESERVE':
   src='skills/nova/plugins/review/src/review-prompt-budget.ts'
   r.update(status='SOURCE_LITERAL_CENTRAL_RECEIVING_OPEN',currentAuthor=h.anchor(src,'const PROMPT_TOKEN_BOUNDARY_RESERVE = 64;'),actualEffects=[h.anchor(src,'tokens: measured.tokens + fixedTokens + RUNTIME_RESULT_FILE_MAX_BYTES + PROMPT_TOKEN_BOUNDARY_RESERVE')],constraint='Shared Review/runtime target envelope reservation; must preserve original run binding and nonnegative tuning domain, not invent a Review-only disconnected author.')
  elif r['id']=='AUTH-PRISM-DESIGN-SYSTEM-PROMPT':
   src='skills/prism/engine/design-providers.ts'
   r.update(status='DORMANT_PROVIDER_LITERAL_CENTRAL_RECEIVING_OPEN',currentAuthor=h.anchor(src,'Return JSON with an operations array. Use only Prism typed operations. Do not return code or markdown.'),actualEffects=[h.anchor(src,'export class OpenAICompatibleDesignProvider')],constraint='Optional HTTP provider instruction remains literal. Dormant constructor/export is not productive composition or nonapplicability; preserve original effect case OPEN, no paid calls.')
  elif r['id']=='AUTH-PRISM-PRODUCT-ENABLE':
   r.update(status='ENV_AUTHOR_CENTRAL_RECEIVING_OPEN',currentAuthor=h.anchor('skills/prism/control/product-decisions.ts',"if (env.PRISM_PRODUCT_DECISIONS_ENABLED !== 'true') return undefined;"),actualEffects=[h.anchor('skills/prism/server/control-config.ts','const product = await loadProductAuthorityConfig(snapshot);')],constraint='Enable policy is not a secret; remains ENV author. No boolean central schema/receiving inferred from presence of other Control fields.')
  else:
   owner='config/components/prism-control.config.json';schema='skills/common/plugin-runtime/foundation/config/swarm-components.schema.json'
   profiles=h.read(owner)['profiles'];values=[]
   for name,profile in profiles.items():
    loc='/profiles/'+name+'/settings/productDecisionLifetimeMs'
    value=h.pointer(h.read(owner),loc)
    if not isinstance(value,int) or isinstance(value,bool) or value<=0:raise ValueError('Lifetime domain drift')
    values.append({'pointer':loc,'valueSha256':h.digest(value)})
   definitions=h.read(schema)['$defs'];schemas=[]
   for name,body in definitions.items():
    if 'productDecisionLifetimeMs' in body.get('properties',{}):
     if 'productDecisionLifetimeMs' not in body['required']:raise ValueError('Optional lifetime policy')
     fragment=body['properties']['productDecisionLifetimeMs']
     if fragment!={'$ref':'#/$defs/positiveTimerInteger'}:raise ValueError('Lifetime schema drift')
     schemas.append({'pointer':'/$defs/'+name+'/properties/productDecisionLifetimeMs','fragmentSha256':h.digest(fragment)})
   if len(values)!=2 or not schemas:raise ValueError('Incomplete lifetime profiles/schema')
   r.update(status='EXACT_EXISTING_CONTROL_LIFETIME_SOURCE_JOIN',centralPhysicalAuthor=h.pin(owner),profiles=values,schema={**h.pin(schema),'fragments':schemas},actualEffects=[h.anchor('skills/prism/server/control-config.ts','productDecisionLifetimeMs: control.productDecisionLifetimeMs,'),h.anchor('skills/prism/server/control-server.ts','productDecisionLifetimeMs: config.productDecisionLifetimeMs'),h.anchor('skills/prism/server/product-decisions.ts','recordProductIntent(options.db, intent, actor, options.config, options.productDecisionLifetimeMs)'),h.anchor('skills/prism/storage/product-decisions.ts','signProductIntent(intent, actor, config, lifetimeMs)'),h.anchor('skills/prism/control/product-decisions.ts','Math.floor(Math.min(now + lifetimeMs, actor.expiresAt) / 1000) * 1000')],capture=h.anchor('skills/prism/server/control-config.ts','projectControlSettings(capture)'),constraint='Selected lifetime does not centralize product enable/credentials; actor expiry and second flooring unchanged. Stored envelope reuse remains original authority, no backdating.')
  rows.append(r)
 if {r['id'] for r in rows}!=IDS or len(rows)!=4:raise ValueError('Four-field roster drift')
 return {'scope':'Four exact original source lanes, not new implementation or acceptance','rows':rows,'preservedCounts':full['preservedCounts'],'constraint':CONSTRAINT,'originalCasesNewlyAccepted':0,'fullC0C6Complete':False,'independentReview':'OPEN'}
def validate(candidate):
 if candidate!=build():raise ValueError('Exact source/identity/acceptance drift')
 return True
if __name__=='__main__':
 result=build();validate(result)
 mutations=[]
 for index in range(4):
  for key,value in [('originalObjectSha256','false'),('caseIds',[]),('runtimeAcceptance','PASS'),('centralPhysicalAuthor',{'path':'invented'})]:
   bad=copy.deepcopy(result);bad['rows'][index][key]=value
   try:validate(bad)
   except ValueError:mutations.append(str(index)+':'+key)
   else:raise ValueError('Accepted matrix corruption')
 (OUT/'author-residual-successors.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({'sourceLanes':4,'existingCentralJoins':1,'receivingResiduals':3,'negativeControlsRejected':len(mutations),'preservedCounts':result['preservedCounts'],'fullC0C6Complete':False}))
