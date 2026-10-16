#!/usr/bin/env python3
"""Exact original service-to-component navigation; never certify runtime/history."""
import copy
import importlib.util
import json
from pathlib import Path

OUT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('adapter_join_helpers', OUT / 'reconcile-adapters.py')
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)
ROOT, read, digest, pin, pointer, anchor = (helper.ROOT, helper.read, helper.digest, helper.pin, helper.pointer, helper.anchor)
OWNER = 'config/components/prism-control.config.json'
COMPOSITION = 'skills/common/plugin-runtime/foundation/config/pipeline-composition.ts'
BOOT = 'skills/common/plugin-runtime/foundation/config/pipeline-boot.mjs'
BUNDLE = 'skills/common/plugin-runtime/foundation/config/swarm-bundle.ts'
# Exact original source-field -> selected-owner leaf -> actual effect anchor.
GROUPS = {
 'prism-database-bootstrap': ('databaseBootstrap', 'prism-control', 'skills/prism/config/database-bootstrap.ts', 'projectControlSettings(capture).control.databaseBootstrap', 'skills/prism/server/bootstrap-database.ts', 'runPrismDatabaseBootstrap(prismDatabaseBootstrapConfig(capture))', 'skills/prism/server/database-bootstrap-runtime.ts', {
  'AUTH-PRISM-DB-BOOTSTRAP-connectionTimeoutMs': ('connectionTimeoutMs', 'connectionTimeoutMs', 'connectionTimeoutMillis: config.connectionTimeoutMs'),
  'AUTH-PRISM-DB-BOOTSTRAP-maximumAttempts': ('maximumAttempts', 'maximumAttempts', 'attempt <= config.maximumAttempts'),
  'AUTH-PRISM-DB-BOOTSTRAP-retryDelayMs': ('retryDelayMs', 'retryDelayMs', 'setTimeout(resolve, config.retryDelayMs)'),
 }),
 'prism-agent-bridge': ('agentBridge', 'prism-agent-bridge', 'skills/prism/server/agent-bridge-config.ts', 'return projectAgentBridgeSettings(capture)', 'skills/prism/server/agent-bridge-entry.mjs', 'startAgentBridge(config)', 'skills/prism/server/agent-bridge.mjs', {
  'AUTH-PRISM-BRIDGE-PORT': ('PORT', 'port', "server.listen(port,'127.0.0.1'"),
  'AUTH-PRISM-BRIDGE-CONTROL': ('PRISM_CONTROL_URL', 'controlUrl', "new URL('/v1/dispatch',controlUrl)"),
  'AUTH-PRISM-BRIDGE-BODY': ('size', 'maximumRequestBytes', 'size>config.maximumRequestBytes'),
  'AUTH-PRISM-BRIDGE-DISPATCH': ('AbortSignal.timeout', 'dispatchTimeoutMs', 'AbortSignal.timeout(config.dispatchTimeoutMs)'),
  'AUTH-PRISM-BRIDGE-JOB-LOOKUP': ('controlRequest', 'controlRequestTimeoutMs', 'AbortSignal.timeout(config.controlRequestTimeoutMs)'),
  'AUTH-PRISM-BRIDGE-POLL': ('setInterval', 'pollIntervalMs', 'setInterval(tick,config.pollIntervalMs)'),
 }),
 'prism-ingestion': ('ingestionServer', 'prism-ingestion', 'skills/prism/server/ingestion-config.ts', 'projectIngestionSettings(capture)', 'skills/prism/server/ingestion-entry.ts', 'startIngestionServer(loadIngestionConfig(capture))', 'skills/prism/server/ingestion.ts', {
  'AUTH-PRISM-INGESTION-ROOT': ('PRISM_QUARANTINE_ROOT', 'quarantineRoot', 'quarantineRoot: root'),
  'AUTH-PRISM-INGESTION-TTL': ('PRISM_QUARANTINE_TTL_MS', 'quarantineTtlMs', 'info.mtimeMs>=quarantineTtl'),
  'AUTH-PRISM-INGESTION-PORT': ('PORT', 'port', "server.listen(config.port, '0.0.0.0'"),
  'AUTH-PRISM-INGESTION-ACQUIRED-BYTES': ('getPinned.size', 'maximumSourceBytes', 'size>config.maximumSourceBytes'),
  'AUTH-PRISM-INGESTION-REQUEST-BYTES': ('handleRequest.size', 'maximumRequestBytes', 'size>config.maximumRequestBytes'),
  'AUTH-PRISM-INGESTION-HTTP-TIMEOUT': ('request.setTimeout', 'sourceRequestTimeoutMs', 'request.setTimeout(config.sourceRequestTimeoutMs'),
  'AUTH-PRISM-INGESTION-REDIRECTS': ('redirects', 'maximumRedirects', 'redirects<=config.maximumRedirects'),
 }),
}

def build(ledgers=None, owner=None):
    roster = read(helper.ROSTER)
    references = {r['id']: r for r in roster['fields']}
    ledgers = read(str((OUT / 'fields.json').relative_to(ROOT))) if ledgers is None else ledgers
    owner = read(OWNER) if owner is None else owner
    if owner['owner'] != 'prism-control' or owner['schemaVersion'] != 'pipeline-component.v2':
        raise ValueError('Selected component owner/version drift')
    originals = {}
    groups, seen = [], set()
    for service, (section, caller, receiver, receive_text, entry, entry_text, effect, specs) in GROUPS.items():
        rows = []
        for row in ledgers:
            if row['id'] not in specs and row['owner'] != service:
                continue
            identity = row['id']
            if identity not in specs or identity not in references or identity in seen:
                raise ValueError('Unknown/duplicate service field: ' + identity)
            seen.add(identity)
            ref = references[identity]
            if row['original'] != ref['original'] or row['originalObjectSha256'] != ref['sha256']:
                raise ValueError('Original reference/hash drift: ' + identity)
            doc, location = ref['original'].split('#', 1)
            document = roster['documents'][doc]['path']
            if document not in originals:
                originals[document] = read(document)
            original = pointer(originals[document], location)
            if digest(original) != ref['sha256'] or row['owner'] != original['owner'] or row['class'] != original['class']:
                raise ValueError('Original object/class/owner drift: ' + identity)
            if row['caseIds'] != ref['caseIds']:
                raise ValueError('Original case join drift: ' + identity)
            oldfield, leaf, effect_text = specs[identity]
            if original['source']['field'] != oldfield:
                raise ValueError('Original source coordinate drift: ' + identity)
            legacy = 'config/services/' + service + '.config.json'
            if legacy not in [v['path'] for v in row['explicitConfigLocatorObservations']]:
                raise ValueError('Historical locator drift: ' + identity)
            profile_pointers = []
            for profile in sorted(owner['profiles']):
                location = '/profiles/' + profile.replace('~', '~0').replace('/', '~1') + '/settings/' + section + '/' + leaf
                profile_pointers.append({'profile': profile, 'pointer': location, 'valueSha256': digest(pointer(owner, location))})
            if not profile_pointers:
                raise ValueError('Missing component profiles')
            rows.append({**{k: row[k] for k in ['id', 'original', 'originalObjectSha256', 'class', 'caseIds']},
                'historicalLocator': legacy, 'originalSourceField': oldfield, 'owner': pin(OWNER),
                'selectedPointerTemplate': '/profiles/<original-selected>/settings/' + section + '/' + leaf,
                'authoredProfileLeaves': profile_pointers,
                'status': 'EXACT_CURRENT_PRISM_SERVICE_SOURCE_JOIN',
                'projection': anchor(COMPOSITION, 'const { dispatchTimeoutMs, ...control }' if section == 'databaseBootstrap' else '.' + section), 'receiver': anchor(receiver, receive_text),
                'actualEntrypoint': anchor(entry, entry_text), 'actualEffect': anchor(effect, effect_text),
                'startupCapture': [anchor(BOOT, "selection.digest !== expected.selectionDigest"),
                    anchor(BOOT, 'const capture = captureSwarmSettings('), anchor(BOOT, 'verifiedCaptures.add(result)'),
                    anchor(BUNDLE, "authors[binding.owner].profiles, binding.profileId"),
                    anchor(COMPOSITION, "assertPipelineBootCapture(capture, '" + caller + "')")],
                'originalHistoryObligation': original['recoveryRetryClaimDeadlineBudgetEffects'],
                'historyAcceptance': 'OPEN; captured service startup is NOT durable per-acquisition/job reconstruction proof',
                'runtimeAcceptance': 'NOT_INFERRED; original cases/results unchanged'})
        if set(r['id'] for r in rows) != set(specs):
            raise ValueError('Missing bounded service fields: ' + service)
        groups.append({'service': service, 'historicalLocator': 'config/services/' + service + '.config.json', 'rows': rows})
    if len(seen) != 16:
        raise ValueError('Bounded service roster drift')
    return {'scope': 'Three historical Prism service aliases; exact selected component leaves/real startup/effect source navigation, not new implementation',
        'inputs': [pin(helper.ROSTER), pin(str((OUT / 'fields.json').relative_to(ROOT)))],
        'counts': {'groups': len(groups), 'originalFields': len(seen), 'exactSourceJoins': len(seen)}, 'groups': groups,
        'independentReview': 'OPEN; native spawn/reviewer unavailable; known unchanged direct-surface EROFS not retried',
        'fullAcceptance': 'OPEN; all2409 fields/6845 cases/50 requirements/fullC0-C6/native/archive and original history gates mandatory'}

def controls():
    baseline = build()
    ledger = read(str((OUT / 'fields.json').relative_to(ROOT)))
    index = next(i for i,r in enumerate(ledger) if r['id'].startswith('AUTH-PRISM-BRIDGE-'))
    results = []
    for name, key, value in [('foreign-id', 'id', 'UNKNOWN'), ('hash-drift', 'originalObjectSha256', '0'*64),
        ('classification-drift', 'class', 'protocol'), ('owner-drift', 'owner', 'other'),
        ('case-drift', 'caseIds', []), ('original-reference-drift', 'original', 'UNKNOWN#/0')]:
        mutant = copy.deepcopy(ledger)
        mutant[index][key] = value
        try: build(ledgers=mutant)
        except (ValueError, KeyError) as error: results.append({'control': name, 'rejected': True, 'error': str(error)})
        else: raise AssertionError('Accepted mutant: ' + name)
    mutant = copy.deepcopy(ledger)
    mutant.append(copy.deepcopy(ledger[index]))
    try: build(ledgers=mutant)
    except ValueError as error: results.append({'control': 'duplicate-id', 'rejected': True, 'error': str(error)})
    else: raise AssertionError('Accepted duplicate')
    mutant_owner = read(OWNER)
    del mutant_owner['profiles']['spiffe']['settings']['agentBridge']['pollIntervalMs']
    try: build(owner=mutant_owner)
    except KeyError as error: results.append({'control': 'missing-alternate-profile-leaf', 'rejected': True, 'error': str(error)})
    else: raise AssertionError('Accepted missing profile leaf')
    if baseline != build(): raise AssertionError('Nondeterministic restored output')
    return {'controls': results, 'restoredPositive': 'PASS', 'deterministicReplay': True,
        'qualification': 'Matrix integrity only; zero runtime/native/history cases executed'}

if __name__ == '__main__':
    result = build()
    checked = controls()
    (OUT / 'prism-service-successors.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    (OUT / 'prism-service-controls.json').write_text(json.dumps(checked, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'counts': result['counts'], 'rejectedControls': len(checked['controls']), 'fullAcceptance': 'OPEN'}))
