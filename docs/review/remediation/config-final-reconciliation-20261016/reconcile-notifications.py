#!/usr/bin/env python3
"""Exact notification original identities across Core, supplied config and manifest lanes."""
import collections
import importlib.util
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[4]
OUT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('platform', OUT/'reconcile-platform-boundaries.py')
p = importlib.util.module_from_spec(spec); spec.loader.exec_module(p)
read, digest, pointer, pin, anchor = p.read, p.digest, p.pointer, p.pin, p.anchor
PLUGIN = 'kubeclaw.notification-observer'
MANIFEST = 'skills/common/plugins/notification-observer/plugin.json'
SCHEMA = 'skills/common/plugins/notification-observer/schemas/config.schema.json'
OBSERVER = 'skills/common/plugins/notification-observer/src/observer.ts'
SCHEDULER = 'skills/nova/core/telemetry/observers.ts'
DELIVERY = 'skills/nova/core/telemetry/observer-delivery.ts'
CORE = 'config/nova/core.config.json'
RUNTIME = p.RUNTIME
FIELDS = str((OUT/'fields.json').relative_to(ROOT))

def build():
    # Recheck every authoritative original object, not just this subset.
    full = p.build()
    roster = read(p.ROSTER)
    originals = {r['id']:r for r in roster['fields']}
    fields = [r for r in read(FIELDS) if r['owner']==PLUGIN]
    if len(fields)!=26 or len({r['id'] for r in fields})!=26: raise ValueError('Notification roster drift')
    manifest = read(MANIFEST)
    if len(manifest['observers'])!=2: raise ValueError('Notification registrations drift')
    rows=[]
    for row in fields:
        ref=originals[row['id']]
        d,loc=ref['original'].split('#',1)
        original=pointer(read(roster['documents'][d]['path']),loc)
        if any(row[k]!=v for k,v in [('original',ref['original']),('originalObjectSha256',ref['sha256']),('caseIds',ref['caseIds']),('class',original['class'])]): raise ValueError('Original drift: '+row['id'])
        scope=original['scope']
        registration=scope['registration'] if isinstance(scope,dict) else scope
        index={'kubeclaw.notification-observer:notifications':0,'kubeclaw.notification-observer:preview-delivery':1}[registration]
        entry=manifest['observers'][index]
        if entry['id']!=registration.split(':')[1] or entry['module']!='src/observer.ts' or entry['export']!=['observe','deliverPreview'][index]: raise ValueError('Actual observer receiver drift')
        field=original.get('field')
        common={k:row[k] for k in ['id','original','originalObjectSha256','class','caseIds']}
        common.update(registration=registration,manifest=pin(MANIFEST),runtimeAcceptance='OPEN; original results unchanged',independentReview='OPEN')
        if field is not None:
            loc=original['source']['field'].removeprefix('#')
            fragment=pointer(read(SCHEMA),loc)
            top=field.removesuffix('[]').removesuffix('.{key}')
            common.update(originalField=field,schema={**pin(SCHEMA),'pointer':loc,'fragmentSha256':digest(fragment)},
                projection=anchor(RUNTIME,'selected[id] = Object.freeze({ ...raw, ...policy.notificationPresentation });'))
            if top=='maxMessageChars':
                values={name:profile['settings']['notificationPresentation'][top] for name,profile in read(CORE)['profiles'].items()}
                common.update(status='EXACT_CORE_NOTIFICATION_SOURCE_JOIN',centralPhysicalAuthor=pin(CORE),ownerPointerTemplate='/profiles/{profile}/settings/notificationPresentation/'+top,profileValueHashes={k:digest(v) for k,v in values.items()})
            else:
                common.update(status='SUPPLIED_OBSERVER_CONFIGURATION_CENTRAL_RECEIVING_OPEN',centralPhysicalAuthor=None,platformPointer='/observers/'+registration+'/'+top)
            if top=='target': effects=[anchor(OBSERVER,'context.contract.config.target'),anchor(OBSERVER,'canonicalId: target(context)')]
            elif index==1: effects=[]
            else:
                text={'pipelineLabel':"configuredText(context.contract.config, 'pipelineLabel'",'modelLabel':"configuredText(context.contract.config, 'modelLabel'",'stageLabels':'const stageLabels = context.contract.config.stageLabels;', 'maxMessageChars':'const maximum = context.contract.config.maxMessageChars;', 'suppressEventTypes':'suppressed.includes(delivery.event.type)'}[top]
                effects=[anchor(OBSERVER,text)]
            common.update(actualEffects=effects,effectDisposition='PRODUCTIVE_SOURCE_READER_NOT_RUNTIME_PROOF' if effects else 'SCHEMA_ACCEPTED_BUT_UNUSED_BY_DELIVER_PREVIEW')
            if not effects: common['constraint']='Preview receiver reads only target and its distinct Core fieldLimits; does not call observe/lifecycleNotification. Schema acceptance/projection is not an effect or justified nonapplicability.'
            if top=='pipelineLabel' and index==0: common['retainedFallback']=anchor(OBSERVER,"options.pipelineLabel ?? 'KubeClaw Pipeline'")
        else:
            field=original['source']['field'].split('].',1)[1]
            loc='/observers/'+str(index)+'/'+field.replace('.','/')
            value=pointer(manifest,loc)
            common.update(originalField=field,status='MANIFEST_OBSERVER_POLICY_CENTRAL_RECEIVING_OPEN',centralPhysicalAuthor=None,currentAuthor={**pin(MANIFEST),'pointer':loc,'valueSha256':digest(value)})
            text={'subscriptions':'!subscriptions.includes(event.type)', 'failurePolicy.mode':"policy.mode === 'required'", 'failurePolicy.maxAttempts':'prior >= policy.maxAttempts', 'failurePolicy.backoffMs':'await this.#wait(policy.backoffMs)', 'failurePolicy.timeoutMs':'const timeoutMs = entry.registration.failurePolicy.timeoutMs;'}[field]
            common.update(actualEffects=[anchor(DELIVERY if field.endswith('timeoutMs') else SCHEDULER,text)],effectDisposition='PRODUCTIVE_SOURCE_READER_NOT_RUNTIME_PROOF')
        rows.append(common)
    counts=dict(collections.Counter(r['status'] for r in rows))
    if counts!={'SUPPLIED_OBSERVER_CONFIGURATION_CENTRAL_RECEIVING_OPEN':14,'EXACT_CORE_NOTIFICATION_SOURCE_JOIN':2,'MANIFEST_OBSERVER_POLICY_CENTRAL_RECEIVING_OPEN':10}: raise ValueError('Notification lane drift')
    return {'scope':'All26 exact original notification fields; source joins only, NOT new externalization or runtime acceptance','preservedCounts':full['preservedCounts'],'counts':counts,'rows':rows,'snapshot':anchor(p.SNAPSHOTS,'configuration: runtime.configuration'),'registrySnapshot':anchor(p.SNAPSHOTS,'registration: entry.registration'),'recovery':anchor(p.RUN,'prepareRuntime(platform, definition, retained.corePolicy'),'originalCasesNewlyAccepted':0,'fullC0C6Complete':False,'independentReview':'OPEN; fresh non-author required','constraint':'24 non-Core fields remain supplied observer configuration or manifest authors. Preview accepts seven original fields without consuming them; retain obligations pending independent disposition. Core projection alone is not delivery/history acceptance. No private policy root, grant changes or denied v10 activation.'}

if __name__=='__main__':
    result=build()
    (OUT/'notification-successors.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:v for k,v in result.items() if k in ['counts','preservedCounts','originalCasesNewlyAccepted','fullC0C6Complete']}))
