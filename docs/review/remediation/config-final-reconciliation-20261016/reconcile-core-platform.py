#!/usr/bin/env python3
"""Exact Core54 navigation: schema vocabulary is not an authored grant value."""
import collections
import importlib.util
import json
import re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[4]
OUT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('platform',OUT/'reconcile-platform-boundaries.py')
p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
read,pointer,pin,anchor,digest=p.read,p.pointer,p.pin,p.anchor,p.digest
FIELDS=str((OUT/'fields.json').relative_to(ROOT))
LOCATOR='config/core/nova/standard.json'
CORE='config/nova/core.config.json'
SCHEMA='skills/common/plugin-runtime/foundation/config/platform.schema.json'
POLICY_SCHEMA='skills/common/plugin-runtime/foundation/config/core-runtime-policy.schema.json'
POLICY='skills/common/plugin-runtime/foundation/config/core-runtime-policy.ts'
VOCAB='skills/common/plugin-runtime/foundation/registry/capability-vocabulary.ts'
CAPABILITIES='skills/common/plugin-runtime/foundation/registry/capabilities.ts'
CONSTRAINT='Two existing central lease-memory joins do not own the original Platform or grant values. One schema-version row remains protocol-invariant, not an operator-setting gap. 50 supplied Platform/grant rows and the fixed resolver retry default remain central-receiving OPEN. Capability vocabulary declares constraint keys, not allowed values. Preserve original class/IDs/cases, authenticated source/history/delivery and every independent/native gate; no new runtime acceptance.'

def build():
    full=p.build();roster=read(p.ROSTER);originals={r['id']:r for r in roster['fields']};cache={}
    fields=[r for r in read(FIELDS) if any(o['path']==LOCATOR for o in r['explicitConfigLocatorObservations'])]
    if len(fields)!=54 or len({r['id'] for r in fields})!=54:raise ValueError('Core54 original roster drift')
    rows=[]
    for row in fields:
        ref=originals[row['id']];doc,loc=ref['original'].split('#',1)
        if doc not in cache:cache[doc]=read(roster['documents'][doc]['path'])
        original=pointer(cache[doc],loc)
        if any(row[k]!=v for k,v in [('original',ref['original']),('originalObjectSha256',ref['sha256']),('caseIds',ref['caseIds']),('class',original['class']),('owner',original['owner'])]):raise ValueError('Core original drift: '+row['id'])
        common={k:row[k] for k in ['id','original','originalObjectSha256','class','caseIds','owner']}
        common.update(originalSource=original['source'],runtimeAcceptance='OPEN; original results unchanged',independentReview='OPEN')
        identity=row['id'];field=original['source']['field']
        if identity in ['RT-CORE-LEASE-MEMORY','RT-OBSERVER-LEASE-MEMORY']:
            leaf='stageMemoryBytes' if identity=='RT-CORE-LEASE-MEMORY' else 'observerMemoryBytes'
            path='/profiles/standard/settings/'+leaf;value=pointer(read(CORE),path)
            fragment=pointer(read(POLICY_SCHEMA),'/properties/'+leaf)
            effects=[anchor(original['source']['path'],'memoryBytes: '+('this.#options.stageMemoryBytes' if leaf=='stageMemoryBytes' else 'options.memoryBytes'))]
            if leaf=='stageMemoryBytes':effects+=[anchor('skills/nova/core/execution/engine-run.ts','stageMemoryBytes: context.runtime.corePolicy.stageMemoryBytes'),anchor('skills/nova/core/execution/runner.ts','stageMemoryBytes: this.#options.stageMemoryBytes')]
            else:effects+=[anchor(p.RUNTIME,'memoryBytes: runtime.corePolicy.observerMemoryBytes')]
            common.update(status='EXACT_EXISTING_CENTRAL_LEASE_MEMORY_SOURCE_JOIN',centralPhysicalAuthor=pin(CORE),pointer=path,valueSha256=digest(value),schema={**pin(POLICY_SCHEMA),'pointer':'/properties/'+leaf,'fragmentSha256':digest(fragment)},loader=anchor(POLICY,'const settings=captureCoreRuntimePolicy('),actualEffects=effects,originalCapture=anchor(p.SNAPSHOTS,'configuration: runtime.configuration'),originalRestore=anchor(p.SNAPSHOTS,'return captureCoreRuntimePolicy(configuration.corePolicy)'))
        elif identity=='RT-RESOLVER-RETRY-DEFAULT':
            common.update(status='FIXED_RESOLVER_RETRY_CENTRAL_RECEIVING_OPEN',centralPhysicalAuthor=None,source=anchor(original['source']['path'],'const DEFAULT_RETRY_COUNT = 1;'),actualEffects=[anchor(original['source']['path'],'requestedRetries ?? DEFAULT_RETRY_COUNT')])
        elif row['owner']=='nova-platform':
            leaf=field.removeprefix('properties.');loc='/properties/'+leaf
            fragment=pointer(read(SCHEMA),loc)
            common.update(status='PROTOCOL_SCHEMA_VERSION_NOT_OPERATOR_GAP' if leaf=='schemaVersion' else 'SUPPLIED_PLATFORM_CENTRAL_RECEIVING_OPEN',centralPhysicalAuthor=None,schema={**pin(SCHEMA),'pointer':loc,'fragmentSha256':digest(fragment)},loader=anchor(p.PLATFORM,'return validatedPlatformConfig(value, path.dirname(canonical), canonical)'))
            effects={'installationRoots':(p.RUNTIME,'installationRoots: platform.installationRoots'),'trustedBuiltinRoots':(p.RUNTIME,'trustedBuiltinRoots: platform.trustedBuiltinRoots'),'externalTrust':(p.RUNTIME,'platform.externalTrust.allowedSourceDigests'),'providers':(p.RUNTIME,'providers: new Map(Object.entries(platform.providers))'),'grants':(p.RUNTIME,'grants: nestedMap(platform.grants)'),'adapters':(p.RUNTIME,'selectedAdapterConfigurations(platform.adapters'),'activeAdapters':(p.RUNTIME,'platform.activeAdapters.forEach'),'observers':(p.RUNTIME,'Object.keys(platform.observers)'),'isolation':(p.RUNTIME,'platform.isolation, inspected.corePolicy.isolationSession'),'storageRoot':(p.RUN,'resolveRunRoot(platform.storageRoot'),'shutdownTimeoutMs':(p.RUNTIME,'shutdownTimeoutMs: platform.shutdownTimeoutMs'),'effectLockTtlMs':(p.RUNTIME,'platform.effectLockTtlMs, runtime.corePolicy.resourceAcquisition'),'orchestratorIssuerId':(p.RUN,'orchestratorIssuerId: context.platform.orchestratorIssuerId'),'administrativeDecisionIssuers':('skills/nova/core/execution/engine-admin.ts','this.#platform.administrativeDecisionIssuers.some')}
            if leaf=='schemaVersion':
                if row['class']!='protocol-invariant' or fragment.get('const')!='pipeline-platform.v2':raise ValueError('Original protocol invariant drift')
                common['qualification']='Protocol version identity retained; not operator externalization or runtime acceptance'
            else:
                effect=effects[leaf];common.update(currentAuthor={'platformPointer':'/'+leaf},actualEffects=[anchor(*effect)])
        elif row['owner']=='nova-platform/capability grant owner':
            match=re.fullmatch(r'CAPABILITY_DEFINITIONS\.(.+)\.constraints\.(\w+)',field)
            if not match:raise ValueError('Grant original field drift')
            capability,leaf=match.groups()
            text=(ROOT/VOCAB).read_text()
            block=re.search(r"  '"+re.escape(capability)+r"': definition\((.*?)\),",text,re.S)
            if not block or "'"+leaf+"'" not in block.group(1):raise ValueError('Grant vocabulary constraint drift: '+identity)
            common.update(status='SUPPLIED_GRANT_VALUES_CENTRAL_RECEIVING_OPEN',centralPhysicalAuthor=None,capability=capability,constraintKey=leaf,currentAuthor={'platformPointer':'/grants/{enabled-registration}/'+capability.replace('~','~0').replace('/','~1')+'/'+leaf},vocabulary=anchor(VOCAB,"'"+capability+"': definition("),constraintVocabulary=anchor(VOCAB,"'"+leaf+"'"),valueReceiving=anchor(p.RUNTIME,'grants: nestedMap(platform.grants)'),validation=anchor(CAPABILITIES,'constraints: validateCapabilityConstraints(capability, constraints)'),qualification='Vocabulary declares permitted keys, not centrally authored allowed values; no authority hardening or grant change')
        else:raise ValueError('Foreign Core original owner')
        rows.append(common)
    counts=dict(collections.Counter(r['status'] for r in rows))
    if counts.get('EXACT_EXISTING_CENTRAL_LEASE_MEMORY_SOURCE_JOIN')!=2 or counts.get('PROTOCOL_SCHEMA_VERSION_NOT_OPERATOR_GAP')!=1:raise ValueError('Core source partition drift')
    return {'scope':'Exact54 original Core/Platform identities, not a whole Core owner mapping','preservedCounts':full['preservedCounts'],'counts':counts,'rows':rows,'constraint':CONSTRAINT,'originalCasesNewlyAccepted':0,'fullC0C6Complete':False,'independentReview':'OPEN'}

if __name__=='__main__':
    result=build();(OUT/'core-platform-successors.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:result[k] for k in ['counts','preservedCounts','fullC0C6Complete']}))
