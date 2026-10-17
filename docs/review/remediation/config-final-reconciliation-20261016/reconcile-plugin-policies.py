#!/usr/bin/env python3
"""Exact remaining secret reference and observer manifest source lanes, never acceptance."""
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
OWNERS={'kubeclaw.secret-resolver':2,'kubeclaw.agent-observability':10,'kubeclaw.telemetry-observer':5}
CONSTRAINT='All17 central receiving obligations remain OPEN. Secret bindings are references only; credential bytes stay external and ENV is read at invocation, not snapshotted. Observer policy remains manifest-authored, not a central Core author. Empty observer config shapes do not erase manifest policies. Source navigation is not effects/history/native or independent acceptance.'

def build():
    full=p.build() # all2409/6845/50 original objects, not subset preservation
    roster=read(p.ROSTER); originals={r['id']:r for r in roster['fields']};cache={}
    fields=[r for r in read(FIELDS) if r['owner'] in OWNERS and r['explicitConfigLocatorObservations']]
    if dict(collections.Counter(r['owner'] for r in fields))!=OWNERS or len({r['id'] for r in fields})!=17:raise ValueError('Plugin policy roster drift')
    rows=[]
    for row in fields:
        ref=originals[row['id']];doc,loc=ref['original'].split('#',1)
        if doc not in cache:cache[doc]=read(roster['documents'][doc]['path'])
        original=pointer(cache[doc],loc)
        if any(row[k]!=v for k,v in [('original',ref['original']),('originalObjectSha256',ref['sha256']),('caseIds',ref['caseIds']),('class',original['class']),('owner',original['owner'])]):raise ValueError('Original drift: '+row['id'])
        plugin=original['owner'];scope=original['scope'];registration=scope['registration'] if isinstance(scope,dict) else scope
        base='skills/common/plugins/'+plugin.removeprefix('kubeclaw.');mp=base+'/plugin.json';manifest=read(mp)
        common={k:row[k] for k in ['id','original','originalObjectSha256','class','caseIds','owner']}
        common.update(registration=registration,centralPhysicalAuthor=None,runtimeAcceptance='OPEN; original results unchanged',independentReview='OPEN')
        if plugin=='kubeclaw.secret-resolver':
            entries=manifest['adapters']
            if len(entries)!=1 or entries[0]['id']!='secrets' or entries[0]['module']!='src/adapter.ts' or entries[0]['export']!='activate':raise ValueError('Secret registration drift')
            schema=base+'/'+entries[0]['configSchema'];loc=original['source']['field'].removeprefix('#');fragment=pointer(read(schema),loc)
            if original['field'] not in ['environment','environment.{key}']:raise ValueError('Secret field drift')
            common.update(status='SUPPLIED_SECRET_REFERENCE_CENTRAL_RECEIVING_OPEN',originalField=original['field'],currentAuthor={'platformPointer':'/adapters/'+registration+'/environment'},schema={**pin(schema),'pointer':loc,'fragmentSha256':digest(fragment)},activation=anchor(base+'/src/adapter.ts','const names = Object.freeze({ ...(mapping as Record<string, string>) });'),actualEffects=[anchor(base+'/src/adapter.ts','const environmentName = names[request.resource.canonicalId];'),anchor(base+'/src/adapter.ts','const value = process.env[environmentName];')],failure=anchor(base+'/src/adapter.ts','SECRET_UNAVAILABLE:'),projection=anchor(p.RUNTIME,'selectedAdapterConfigurations(platform.adapters'))
        else:
            index={'kubeclaw.agent-observability:ingester':0,'kubeclaw.agent-observability:evidence':1,'kubeclaw.telemetry-observer:telemetry':0}[registration]
            entries=manifest['observers'];expected=2 if plugin=='kubeclaw.agent-observability' else 1
            if len(entries)!=expected:raise ValueError('Observer registration count drift')
            entry=entries[index];module='src/observers.ts' if expected==2 else 'src/observer.ts';export=['ingest','recordEvidence'][index] if expected==2 else 'observe'
            if entry['id']!=registration.split(':')[1] or entry['module']!=module or entry['export']!=export:raise ValueError('Observer registration drift')
            field=original['source']['field'].split('].',1)[1];loc='/observers/'+str(index)+'/'+field.replace('.','/');value=pointer(manifest,loc)
            text={'subscriptions':'!subscriptions.includes(event.type)','failurePolicy.mode':"policy.mode === 'required'",'failurePolicy.maxAttempts':'prior >= policy.maxAttempts','failurePolicy.backoffMs':'await this.#wait(policy.backoffMs)','failurePolicy.timeoutMs':'const timeoutMs = entry.registration.failurePolicy.timeoutMs;'}[field]
            consumer='skills/nova/core/telemetry/'+('observer-delivery.ts' if field.endswith('timeoutMs') else 'observers.ts')
            common.update(status='MANIFEST_OBSERVER_POLICY_CENTRAL_RECEIVING_OPEN',originalField=field,currentAuthor={**pin(mp),'pointer':loc,'valueSha256':digest(value)},actualEffects=[anchor(consumer,text)],entrypoint=anchor(base+'/'+module,'export async function '+export+'('))
        rows.append(common)
    return {'scope':'Exact17 original secret-reference/observer policy source lanes, NOT implementation or acceptance','preservedCounts':full['preservedCounts'],'counts':dict(collections.Counter(r['status'] for r in rows)),'rows':rows,'constraint':CONSTRAINT,'originalConfigurationCapture':anchor(p.SNAPSHOTS,'configuration: runtime.configuration'),'originalRegistrationCapture':anchor(p.SNAPSHOTS,'registration: entry.registration'),'recovery':anchor(p.RUN,'prepareRuntime(platform, definition, retained.corePolicy'),'originalCasesNewlyAccepted':0,'fullC0C6Complete':False,'independentReview':'OPEN'}

if __name__=='__main__':
    result=build();(OUT/'plugin-policy-successors.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:result[k] for k in ['counts','preservedCounts','fullC0C6Complete']}))
