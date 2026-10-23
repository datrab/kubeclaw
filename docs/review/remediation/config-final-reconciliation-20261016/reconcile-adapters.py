#!/usr/bin/env python3
"""Exact bounded Core scalar joins; admission/root fields remain explicit residuals."""
import collections
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
OUT = Path(__file__).resolve().parent
CORE = 'config/nova/core.config.json'
RUNTIME = 'skills/nova/core/execution/engine-runtime.ts'
SNAPSHOTS = 'skills/nova/core/execution/engine-snapshots.ts'
RUN = 'skills/nova/core/execution/engine-run.ts'
POLICY = 'skills/common/plugin-runtime/foundation/config/core-runtime-policy.ts'
ROSTER = 'docs/review/evidence/config-acceptance/c0-completion-20261013/PACKAGE-FIELD-CASE-JOINS.json'
# Deliberate reviewed field allowlist: no section-name or value-equality inference.
SPECS = {
    'artifact-store': ('artifactStore', 'artifact-store', ['maxArtifactBytes', 'maximumRecords', 'maximumStoreBytes', 'maximumRecordBytes']),
    'network-http': ('networkHttp', 'http', ['maxRequestBytes', 'maxResponseBytes', 'timeoutMs']),
    'state-store': ('stateStore', 'state', ['maxEntryBytes', 'maximumRecords', 'maximumStoreBytes']),
    'wait-store': ('waitStore', 'waits', ['maxEntryBytes', 'maximumRecords', 'maximumStoreBytes']),
    'telemetry-store': ('telemetryStore', 'telemetry', ['maxRecordBytes', 'maximumRecords', 'maximumStoreBytes']),
    'openclaw-agent-events': ('agentEventSource', 'source', ['maxQueueEvents', 'maxQueueBytes', 'drainTimeoutMs']),
}

def read(path):
    return json.loads((ROOT / path).read_text())

def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()

def pin(path):
    return {'path': path, 'sha256': hashlib.sha256((ROOT / path).read_bytes()).hexdigest()}

def pointer(value, location):
    for key in location.lstrip('/').split('/') if location else []:
        key = key.replace('~1', '/').replace('~0', '~')
        value = value[int(key)] if isinstance(value, list) else value[key]
    return value

def anchor(path, text):
    lines = [i + 1 for i, line in enumerate((ROOT / path).read_text().splitlines()) if text in line]
    if not lines:
        raise ValueError(f'Missing source anchor: {path}:{text}')
    return {**pin(path), 'anchor': text, 'lines': lines}

def build(ledgers=None, core=None):
    roster = read(ROSTER)
    original_fields = {r['id']: r for r in roster['fields']}
    cache = {}
    core = read(CORE) if core is None else core
    ledgers = read(str((OUT / 'fields.json').relative_to(ROOT))) if ledgers is None else ledgers
    groups = collections.defaultdict(list)
    seen = set()
    for row in ledgers:
        plugin = row['owner'].removeprefix('kubeclaw.') if isinstance(row['owner'], str) else ''
        if plugin not in SPECS or not row['explicitConfigLocatorObservations']:
            continue
        section, registration, leaves = SPECS[plugin]
        identity = row['id']
        if identity not in original_fields or identity in seen:
            raise ValueError(f'Duplicate/foreign field: {identity}')
        seen.add(identity)
        original_ref = original_fields[identity]
        if row['original'] != original_ref['original']:
            raise ValueError(f'Original reference drift: {identity}')
        document, location = original_ref['original'].split('#', 1)
        path = roster['documents'][document]['path']
        if path not in cache:
            cache[path] = read(path)
        original = pointer(cache[path], location)
        if digest(original) != original_ref['sha256'] or row['originalObjectSha256'] != original_ref['sha256']:
            raise ValueError(f'Original hash drift: {identity}')
        if row['class'] != original.get('class', original.get('classification')) or row['owner'] != original['owner']:
            raise ValueError(f'Original classification/owner drift: {identity}')
        if row['caseIds'] != original_ref.get('caseIds', []):
            raise ValueError(f'Original case join drift: {identity}')
        field = original['field']
        common = {k: row[k] for k in ['id', 'original', 'originalObjectSha256', 'class', 'caseIds']}
        common.update({'originalField': field, 'historicalLocators': [x['path'] for x in row['explicitConfigLocatorObservations']],
                       'runtimeAcceptance': 'NOT_INFERRED; original case results unchanged'})
        if field not in leaves:
            common.update({'status': 'ORIGINAL_PLATFORM_ADMISSION_OR_ROOT_JOIN_OPEN',
                           'constraint': 'Not a leaf of this Core scalar policy. Trace actual platform/provider/root/admission owner and retained closure separately; do not invent a Core pointer or treat adjacent section as closure.'})
        else:
            location = '/profiles/standard/settings/' + section + '/' + field
            value = pointer(core, location)
            consumer = f'skills/common/plugins/{plugin}/src/adapter.ts'
            receiver = None
            effects = []
            if plugin == 'openclaw-agent-events':
                receiver = anchor(consumer, 'ingressLimits(context.config)')
                effects = [anchor('skills/common/plugins/openclaw-agent-events/src/ingress-queue.ts', 'this.#limits.' + field)]
            else:
                receiver = anchor(consumer, 'config.' + field)
            common.update({'status': 'EXACT_CURRENT_CORE_SCALAR_SOURCE_JOIN', 'owner': pin(CORE), 'pointer': location,
                'valueSha256': digest(value), 'registration': f'kubeclaw.{plugin}:{registration}',
                'projection': anchor(RUNTIME, f"['kubeclaw.{plugin}:{registration}', policy.{section},"),
                'competingAuthorRejection': anchor(RUNTIME, 'POLICY_COMPETING_AUTHOR:${field}'),
                'policyType': anchor(POLICY, 'readonly ' + section + ':'),
                'receivingConsumer': receiver, 'effectAnchors': effects,
                'originalRecovery': [anchor(SNAPSHOTS, 'return captureCoreRuntimePolicy(configuration.corePolicy)'),
                    anchor(RUN, 'prepareRuntime(platform, definition, retained.corePolicy'),
                    anchor(RUNTIME, 'configuration: { corePolicy, providers: platform.providers')],
                'qualification': 'Exact source navigation only; not new scalar implementation, executed original cases, delivery/native proof or independent acceptance.'})
        groups[plugin].append(common)
    result_groups = []
    for plugin, rows in sorted(groups.items()):
        result_groups.append({'plugin': 'kubeclaw.' + plugin, 'rows': rows,
            'exactScalarFieldIds': [r['id'] for r in rows if r['status'] == 'EXACT_CURRENT_CORE_SCALAR_SOURCE_JOIN'],
            'remainingFieldIds': [r['id'] for r in rows if r['status'] != 'EXACT_CURRENT_CORE_SCALAR_SOURCE_JOIN']})
    if len(seen) != 31 or len(result_groups) != 6:
        raise ValueError('Bounded original adapter roster drift')
    counts = collections.Counter(r['status'] for g in result_groups for r in g['rows'])
    if counts['EXACT_CURRENT_CORE_SCALAR_SOURCE_JOIN'] != 19:
        raise ValueError('Bounded exact scalar roster drift')
    return {'scope': 'Six original adapter locator groups, exact scalar joins with root/admission residuals retained',
        'inputs': [pin(ROSTER), pin(str((OUT / 'fields.json').relative_to(ROOT)))],
        'counts': {'groups': len(result_groups), 'originalFields': len(seen), **counts}, 'groups': result_groups,
        'independentReview': 'OPEN; native reviewer/spawn tool unavailable on scheduled surface; unchanged known direct initialization EROFS not retried',
        'fullAcceptance': 'OPEN; all2409 fields/6845 cases/50 requirements/fullC0-C6 original/native/archive gates remain mandatory'}

if __name__ == '__main__':
    result = build()
    (OUT / 'adapter-successors.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(result['counts']))
