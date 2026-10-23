#!/usr/bin/env python3
"""Exact original dispatch source navigation, not runtime/independent acceptance."""
import collections
import importlib.util
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[4]
OUT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('platform',OUT/'reconcile-platform-boundaries.py')
p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
read,pointer,pin,anchor,digest=p.read,p.pointer,p.pin,p.anchor,p.digest
FIELDS=str((OUT/'fields.json').relative_to(ROOT))
CORE='config/nova/core.config.json'
BASE='skills/common/plugins/runtime-dispatch/'
CAPACITY='skills/common/plugin-runtime/foundation/config/openclaw-target-capacity.ts'
SHARED='skills/common/plugin-runtime/sdk/src/runtime-agent-task.ts'
TIMING={'spawnIntervalMs','pollMs','maxPollMs','maxPolls','sessionTimeoutMs'}
BYTES={'maxRequestBytes','maxResponseBytes'}
CAPACITIES={'tokenizerEncoding','maxPromptBytes','maxInputTokens','maxOutputTokens','maxContextTokens'}
LOCATOR='config/plugins/kubeclaw.runtime-dispatch/default/standard.json'
CONSTRAINT='Seven exact existing central byte/timing profile joins do not own original target endpoint/auth/identity/workspace/result settings. 34 target/normalization fields and one shared SDK result pathname limit remain central-receiving OPEN. Five target capacity fields still normalize from fixed source literals; Review sharing is not externalization. Preserve original class/secret-reference identities, selectors, history, full roster and native/independent gates. No source setting or original case newly accepted.'

def build():
    full=p.build()
    roster=read(p.ROSTER);originals={r['id']:r for r in roster['fields']};cache={}
    fields=[r for r in read(FIELDS) if any(o['path']==LOCATOR for o in r['explicitConfigLocatorObservations'])]
    if len(fields)!=42 or len({r['id'] for r in fields})!=42:raise ValueError('Dispatch original roster drift')
    rows=[]
    for row in fields:
        ref=originals[row['id']];doc,loc=ref['original'].split('#',1)
        if doc not in cache:cache[doc]=read(roster['documents'][doc]['path'])
        original=pointer(cache[doc],loc)
        if any(row[k]!=v for k,v in [('original',ref['original']),('originalObjectSha256',ref['sha256']),('caseIds',ref['caseIds']),('class',original['class']),('owner',original['owner'])]):raise ValueError('Dispatch original drift: '+row['id'])
        common={k:row[k] for k in ['id','original','originalObjectSha256','class','caseIds','owner']}
        common.update(runtimeAcceptance='OPEN; original results unchanged',independentReview='OPEN')
        if row['id']=='RT-RUNTIME-RESULT-PATH-BYTES':
            common.update(status='SHARED_SDK_LITERAL_CENTRAL_RECEIVING_OPEN',centralPhysicalAuthor=None,originalField=original['source']['field'],source=anchor(SHARED,'export const RUNTIME_RESULT_FILE_MAX_BYTES = 2_048;'),actualEffects=[anchor(SHARED,"Buffer.byteLength(resultFile, 'utf8') > RUNTIME_RESULT_FILE_MAX_BYTES"),anchor(BASE+'src/openclaw.ts',"Buffer.byteLength(file, 'utf8') > RUNTIME_RESULT_FILE_MAX_BYTES"),anchor('skills/nova/plugins/review/src/review-prompt-budget.ts','fixedBytes + RUNTIME_RESULT_FILE_MAX_BYTES')])
            rows.append(common);continue
        if original['owner']!='kubeclaw.runtime-dispatch':raise ValueError('Dispatch foreign owner')
        registration=original['scope']['registration'];kind=registration.removeprefix('kubeclaw.runtime-dispatch:')
        manifest=read(BASE+'plugin.json');entry=next(e for e in manifest['adapters'] if e['id']==kind)
        module='src/adapter.ts' if kind=='runtime' else 'src/openclaw-adapter.ts'
        if kind not in ['runtime','openclaw'] or entry['module']!=module or entry['export']!='activate':raise ValueError('Dispatch actual registration drift')
        field=original['field'];leaf=field.split('.')[-1]
        schema=BASE+entry['configSchema'];rawschema=read(schema)
        common.update(originalField=field,registration=registration,activation=anchor(BASE+module,'export function activate('))
        if (kind=='runtime' and leaf in BYTES) or (kind=='openclaw' and leaf in TIMING):
            section='httpDispatch' if kind=='runtime' else 'openClawDispatch'
            profiles='targetByteProfiles' if kind=='runtime' else 'targetTimingProfiles'
            selector='byteProfile' if kind=='runtime' else 'timingProfile'
            corepath='/profiles/standard/settings/'+section+'/'+profiles
            values=pointer(read(CORE),corepath)
            if not values:raise ValueError('Dispatch empty central profile set')
            loc='/properties/targetByteProfiles/additionalProperties/properties/'+leaf if kind=='runtime' else '/$defs/targetTiming/properties/'+leaf
            fragment=pointer(rawschema,loc)
            common.update(status='ORIGINAL_TARGET_SELECTED_DISPATCH_PROFILE_SOURCE_JOIN',centralPhysicalAuthor=pin(CORE),centralProfiles=[{'pointer':corepath+'/'+key.replace('~','~0').replace('/','~1')+'/'+leaf,'valueSha256':digest(value[leaf])} for key,value in values.items()],selector={'platformPointer':'/adapters/'+registration+'/targets/{original-target}/'+selector,'originalCapture':anchor(p.SNAPSHOTS,'value:target.'+selector+',enumerable:true'),'originalRestore':anchor(p.RUNTIME,selector+':retained'+('Http' if kind=='runtime' else 'Timing')+'Selections[')},schema={**pin(schema),'pointer':loc,'fragmentSha256':digest(fragment)},projection=anchor(p.RUNTIME,'policy.'+section),receiver=anchor(BASE+('src/adapter.ts' if kind=='runtime' else 'src/openclaw-config.ts'),'profiles.get(value.byteProfile)' if kind=='runtime' else 'const timing = profiles[raw.timingProfile]!;'))
            effect={'spawnIntervalMs':('openclaw.ts','setTimeout(resolve, target.spawnIntervalMs)'), 'pollMs':('openclaw-session.ts','target.pollMs *'), 'maxPollMs':('openclaw-session.ts','Math.min(target.maxPollMs,'), 'maxPolls':('openclaw-session.ts','poll < target.maxPolls'), 'sessionTimeoutMs':('openclaw-session.ts','AbortSignal.timeout(target.sessionTimeoutMs)'), 'maxRequestBytes':('adapter.ts','> target.maxRequestBytes'), 'maxResponseBytes':('adapter.ts','target.maxResponseBytes')}[leaf]
            common['actualEffects']=[anchor(BASE+'src/'+effect[0],effect[1])]
        else:
            loc='/properties/targets'
            if field!='targets':loc+='/additionalProperties'
            if leaf not in ['targets','{key}']:loc+='/properties/'+leaf
            fragment=pointer(rawschema,loc)
            common.update(status='SUPPLIED_DISPATCH_TARGET_CENTRAL_RECEIVING_OPEN',centralPhysicalAuthor=None,currentAuthor={'platformPointer':'/adapters/'+registration+'/'+field.replace('.','/')},schema={**pin(schema),'pointer':loc,'fragmentSha256':digest(fragment)})
            source=BASE+('src/adapter.ts' if kind=='runtime' else 'src/openclaw-config.ts')
            if kind=='openclaw' and leaf in CAPACITIES:
                common.update(status='FIXED_TARGET_CAPACITY_CENTRAL_RECEIVING_OPEN',normalization=anchor(CAPACITY,'raw.'+leaf),actualEffects=[anchor(BASE+'src/openclaw.ts','target.'+leaf)])
            elif kind=='openclaw' and leaf in ['runtime','agentId','model','thinking']:
                common.update(normalization=anchor(CAPACITY,'raw.'+leaf),actualEffects=[anchor(BASE+'src/openclaw.ts','target.'+leaf)])
            elif field in ['targets','targets.{key}']:
                common['receiver']=anchor(source,'Object.entries(raw.targets)')
            else:
                common['receiver']=anchor(source,('value.' if kind=='runtime' else 'raw.')+leaf)
        rows.append(common)
    counts=dict(collections.Counter(r['status'] for r in rows))
    if counts.get('ORIGINAL_TARGET_SELECTED_DISPATCH_PROFILE_SOURCE_JOIN')!=7 or counts.get('FIXED_TARGET_CAPACITY_CENTRAL_RECEIVING_OPEN')!=5:raise ValueError('Dispatch source partition drift')
    return {'scope':'Exact42 original dispatch identities; existing7 central profile joins and35 explicit receiving residuals, no runtime acceptance','preservedCounts':full['preservedCounts'],'counts':counts,'rows':rows,'constraint':CONSTRAINT,'originalConfigurationCapture':anchor(p.SNAPSHOTS,'configuration: runtime.configuration'),'recovery':anchor(p.RUN,'prepareRuntime(platform, definition, retained.corePolicy'),'originalCasesNewlyAccepted':0,'fullC0C6Complete':False,'independentReview':'OPEN'}

if __name__=='__main__':
    result=build();(OUT/'dispatch-successors.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:result[k] for k in ['counts','preservedCounts','fullC0C6Complete']}))
