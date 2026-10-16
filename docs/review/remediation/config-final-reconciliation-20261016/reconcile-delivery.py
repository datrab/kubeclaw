#!/usr/bin/env python3
"""Bounded original delivery fields: store scalars versus selected profile derivation.
Never infer a profile from equal values, or mark platform/secret fields closed.
"""
import collections
import copy
import importlib.util
import json
from pathlib import Path

OUT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('scalar_joins', OUT / 'reconcile-adapters.py')
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
ROOT = base.ROOT
SPECS = {
    'operator-messaging': ('operatorMessagingStore', 'operatorMessagingPayload', 'operator', 'operatorSelections', 'retainedOperatorSelections'),
    'transport-publisher': ('transportPublisherStore', 'transportPublisherPayload', 'publisher', 'publisherSelections', 'retainedPublisherSelections'),
}
STORE_FIELDS = {'maximumDeliveryRecords': 'maximumRecords', 'maximumDeliveryBytes': 'maximumBytes'}

def build(ledgers=None, core=None):
    roster = base.read(base.ROSTER)
    originals = {r['id']: r for r in roster['fields']}
    ledgers = base.read(str((OUT / 'fields.json').relative_to(ROOT))) if ledgers is None else ledgers
    core = base.read(base.CORE) if core is None else core
    cache, seen = {}, set()
    groups = collections.defaultdict(list)
    for row in ledgers:
        plugin = row['owner'].removeprefix('kubeclaw.') if isinstance(row['owner'], str) else ''
        if plugin not in SPECS or not row['explicitConfigLocatorObservations']:
            continue
        identity = row['id']
        if identity not in originals or identity in seen:
            raise ValueError(f'Duplicate/foreign field: {identity}')
        seen.add(identity)
        ref = originals[identity]
        if row['original'] != ref['original']:
            raise ValueError(f'Original reference drift: {identity}')
        document, location = ref['original'].split('#', 1)
        path = roster['documents'][document]['path']
        if path not in cache:
            cache[path] = base.read(path)
        original = base.pointer(cache[path], location)
        if base.digest(original) != ref['sha256'] or row['originalObjectSha256'] != ref['sha256']:
            raise ValueError(f'Original hash drift: {identity}')
        if row['class'] != original.get('class', original.get('classification')) or row['owner'] != original['owner']:
            raise ValueError(f'Original classification/owner drift: {identity}')
        if row['caseIds'] != ref.get('caseIds', []):
            raise ValueError(f'Original case join drift: {identity}')
        field = original['field']
        store, payload, registration, selection, retained = SPECS[plugin]
        adapter = f'skills/common/plugins/{plugin}/src/adapter.ts'
        item = {k: row[k] for k in ['id', 'original', 'originalObjectSha256', 'class', 'caseIds']}
        item.update({'originalField': field, 'historicalLocators': [x['path'] for x in row['explicitConfigLocatorObservations']],
                     'runtimeAcceptance': 'NOT_INFERRED; original case results unchanged'})
        target_payload = field.startswith('targets.') and field.endswith('.maxPayloadBytes')
        if field in STORE_FIELDS or target_payload:
            section = payload if target_payload else store
            item.update({'owner': base.pin(base.CORE), 'registration': f'kubeclaw.{plugin}:{registration}',
                'projection': base.anchor(base.RUNTIME, 'policy.' + section),
                'competingAuthorRejection': base.anchor(base.RUNTIME, 'POLICY_COMPETING_AUTHOR:${field}'),
                'originalRecovery': [base.anchor(base.SNAPSHOTS, 'return captureCoreRuntimePolicy(configuration.corePolicy)'),
                    base.anchor(base.RUN, 'prepareRuntime(platform, definition, retained.corePolicy')],
                'qualification': 'Source navigation only, not new implementation, executed original case, physical delivery, native proof or independent acceptance.'})
            if not target_payload:
                location = '/profiles/standard/settings/' + store + '/' + field
                value = base.pointer(core, location)
                item.update({'status': 'EXACT_CURRENT_DELIVERY_STORE_SOURCE_JOIN', 'pointer': location,
                    'valueSha256': base.digest(value), 'receivingEffect': base.anchor(adapter, STORE_FIELDS[field] + ': config.' + field)})
            else:
                location = '/profiles/standard/settings/' + payload + '/targetPayloadProfiles'
                profiles = base.pointer(core, location)
                if not isinstance(profiles, dict) or not profiles:
                    raise ValueError('Missing selected payload profiles')
                # Pin all authored profiles, but select NONE here: original target decides.
                values = {name: {'pointer': location + '/' + name.replace('~','~0').replace('/','~1') + '/maxPayloadBytes',
                    'valueSha256': base.digest(profile['maxPayloadBytes'])} for name, profile in sorted(profiles.items())}
                config = f'skills/common/plugins/{plugin}/src/config.ts' if plugin == 'operator-messaging' else adapter
                receiver = 'const maxPayloadBytes = profiles.get(raw.payloadProfile)!' if plugin == 'operator-messaging' else 'maxPayloadBytes: profiles.get(rawTarget.payloadProfile)!'
                effect = 'parsePayload(request.payload, target.maxPayloadBytes, target.payloadStructure)' if plugin == 'operator-messaging' else 'publicationBody(request.payload, target.maxPayloadBytes, config.maxJsonDepth)'
                item.update({'status': 'ORIGINAL_TARGET_SELECTED_PROFILE_SOURCE_JOIN', 'profileOwnerPointer': location,
                    'profileValuePointers': values, 'selectedProfile': 'DYNAMIC_FROM_ORIGINAL_TARGET_NOT_INFERRED',
                    'receivingDerivation': base.anchor(config, receiver), 'receivingEffect': base.anchor(adapter, effect),
                    'originalSelectionCapture': base.anchor(base.SNAPSHOTS, 'Object.defineProperty(' + selection + ',id,{value:target.payloadProfile,enumerable:true})'),
                    'originalSelectionRestore': base.anchor(base.RUNTIME, 'payloadProfile:' + retained + '[id]'),
                    'oldTargetAuthorRejection': base.anchor(config, 'exactKeys(raw, TARGET_KEYS' if plugin == 'operator-messaging' else "exactKeys(rawTarget, ['endpoint', 'signingSecret', 'payloadProfile']")})
        else:
            item.update({'status': 'ORIGINAL_PLATFORM_TARGET_SECRET_OR_ROOT_JOIN_OPEN',
                'constraint': 'Not a leaf of delivery store or selected payload-profile policy. Trace original platform/root/target/secret owner separately; no inferred Core pointer or author; enclosing target objects are not closed by one child mapping.'})
        groups[plugin].append(item)
    if len(seen) != 26 or len(groups) != 2:
        raise ValueError('Bounded original delivery roster drift')
    counts = collections.Counter(r['status'] for rows in groups.values() for r in rows)
    if counts['EXACT_CURRENT_DELIVERY_STORE_SOURCE_JOIN'] != 4 or counts['ORIGINAL_TARGET_SELECTED_PROFILE_SOURCE_JOIN'] != 2:
        raise ValueError('Exact delivery source join roster drift')
    return {'scope': '26 original fields in two delivery adapter groups; four store scalars, two original-target-selected profile derivations,20 explicit residuals',
        'inputs': [base.pin(base.ROSTER), base.pin(str((OUT / 'fields.json').relative_to(ROOT)))],
        'counts': {'groups': 2, 'originalFields': 26, **counts},
        'groups': [{'plugin': 'kubeclaw.' + plugin, 'rows': rows,
            'remainingFieldIds': [r['id'] for r in rows if r['status'].endswith('_OPEN')]} for plugin, rows in sorted(groups.items())],
        'independentReview': 'OPEN; native reviewer/spawn tools not exposed; known unchanged direct EROFS initialization not retried',
        'fullAcceptance': 'OPEN; all2409 fields/6845 cases/50 requirements/fullC0-C6 original/native/archive gates remain mandatory'}

def controls():
    ledgers = base.read(str((OUT / 'fields.json').relative_to(ROOT)))
    core = base.read(base.CORE)
    selected = next(i for i,r in enumerate(ledgers) if r['id'] == 'RT-36e57df09adb3bc3')
    result = build(ledgers, core)
    checks = []
    for label in ['original-hash', 'case-join', 'original-reference', 'owner', 'foreign-id', 'duplicate-id', 'missing-store-pointer', 'missing-profile-leaf']:
        rows, policy = copy.deepcopy(ledgers), copy.deepcopy(core)
        row = rows[selected]
        if label == 'original-hash': row['originalObjectSha256'] = '0' * 64
        elif label == 'case-join': row['caseIds'] = ['FOREIGN-CASE']
        elif label == 'original-reference': row['original'] = 'D228#/rows/0'
        elif label == 'owner': row['owner'] = 'kubeclaw.transport-publisher'
        elif label == 'foreign-id': row['id'] = 'FOREIGN-ID'
        elif label == 'duplicate-id': rows.append(copy.deepcopy(row))
        elif label == 'missing-store-pointer': del policy['profiles']['standard']['settings']['operatorMessagingStore']['maximumDeliveryRecords']
        elif label == 'missing-profile-leaf': del policy['profiles']['standard']['settings']['operatorMessagingPayload']['targetPayloadProfiles']['standard']['maxPayloadBytes']
        try: build(rows, policy)
        except (ValueError, KeyError) as error: checks.append({'control': label, 'rejected': True, 'error': str(error)})
        else: raise AssertionError('Mutant accepted: ' + label)
    if result != build(ledgers, core): raise AssertionError('Non-deterministic restored positive')
    return {'controls': checks, 'restoredPositive': 'PASS', 'deterministicReplay': True,
        'qualification': 'Source/matrix controls only; no original runtime cases executed or independently accepted'}

if __name__ == '__main__':
    result = build()
    (OUT / 'delivery-successors.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    (OUT / 'delivery-successor-controls.json').write_text(json.dumps(controls(), ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(result['counts']))
