#!/usr/bin/env python3
"""Exact endpoint/nonce navigation, including the distinct unresolved live runner."""
import copy
import importlib.util
import json
from pathlib import Path
OUT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('helpers', OUT / 'reconcile-adapters.py')
h = importlib.util.module_from_spec(spec)
spec.loader.exec_module(h)
ROOT, read, digest, pin, pointer, anchor = h.ROOT, h.read, h.digest, h.pin, h.pointer, h.anchor
CONTROL = 'config/components/prism-control.config.json'
WORKER = 'config/components/prism-worker.config.json'
COMPOSITION = 'skills/common/plugin-runtime/foundation/config/pipeline-composition.ts'
BOOT = 'skills/common/plugin-runtime/foundation/config/pipeline-boot.mjs'
SPECS = {
 'AUTH-PRISM-ENDPOINT-WORKER': (CONTROL, 'workerUrl', 'PRISM_WORKER_URL', 'skills/prism/server/control-config.ts', 'workerUrl: new URL(control.workerUrl)', 'skills/prism/control/worker-operation-transport.ts', "new URL('/v1/attempts', config.workerUrl)"),
 'AUTH-PRISM-ENDPOINT-CONTROL-INTERNAL': (CONTROL, 'controlInternalUrl', 'PRISM_CONTROL_INTERNAL_URL', 'skills/prism/server/worker-config.ts', 'controlInternalUrl: new URL(snapshot.controlInternalUrl)', 'skills/prism/server/native-worker-host.ts', 'new WorkerArtifactClient(config.controlInternalUrl'),
 'AUTH-PRISM-ENDPOINT-INGESTION': (CONTROL, 'ingestionUrl', 'PRISM_INGESTION_URL', 'skills/prism/server/control-config.ts', 'ingestionUrl: new URL(control.ingestionUrl)', 'skills/prism/server/corpus-routes.ts', 'ingestionUrl),'),
 'AUTH-PRISM-CONTROL-HMAC-WINDOW': (WORKER, 'nonceDatabase/authenticationWindowMs', 'WINDOW_MS verification and nonce expiresAt', 'skills/prism/server/worker-readiness.ts', 'this.authenticationWindowMs = settings.authenticationWindowMs', 'skills/prism/server/internal-auth.ts', 'Math.abs(now - timestamp) > authenticationWindowMs'),
 'AUTH-PRISM-CONTROL-NONCE-CLEANUP-BATCH': (WORKER, 'nonceDatabase/maximumCleanupRows', 'PostgresNonceStore.consume DELETE LIMIT1000', 'skills/prism/server/worker-readiness.ts', 'this.maximumCleanupRows = settings.maximumCleanupRows', 'skills/prism/server/internal-auth.ts', '[this.maximumCleanupRows]'),
}
RUNNER = 'AUTH-PRISM-ENDPOINT-AGENT-LIVE-RUNNER'
LOCATORS = {'config/deployment/prism.config.json', 'config/workers/prism.config.json'}

def build(ledgers=None, owners=None):
    roster = read(h.ROSTER)
    refs = {r['id']: r for r in roster['fields']}
    ledgers = read(str((OUT / 'fields.json').relative_to(ROOT))) if ledgers is None else ledgers
    owners = {p: read(p) for p in [CONTROL, WORKER]} if owners is None else owners
    cache, rows, seen = {}, [], set()
    for row in ledgers:
        locators = {x['path'] for x in row['explicitConfigLocatorObservations']}
        if row['id'] not in set(SPECS) | {RUNNER} and not locators & LOCATORS:
            continue
        identity = row['id']
        if identity not in set(SPECS) | {RUNNER} or identity in seen:
            raise ValueError('Unknown/duplicate boundary field: ' + identity)
        seen.add(identity)
        ref = refs[identity]
        if row['original'] != ref['original'] or row['originalObjectSha256'] != ref['sha256'] or row['caseIds'] != ref['caseIds']:
            raise ValueError('Original identity/hash/cases drift: ' + identity)
        doc, ptr = ref['original'].split('#', 1)
        source = roster['documents'][doc]['path']
        if source not in cache: cache[source] = read(source)
        original = pointer(cache[source], ptr)
        if digest(original) != ref['sha256'] or row['owner'] != original['owner'] or row['class'] != original['class']:
            raise ValueError('Original object/class/owner drift: ' + identity)
        legacy = 'config/workers/prism.config.json' if identity in list(SPECS)[3:] else 'config/deployment/prism.config.json'
        if legacy not in locators: raise ValueError('Historical locator drift')
        common = {k: row[k] for k in ['id', 'original', 'originalObjectSha256', 'class', 'owner', 'caseIds']}
        common.update(historicalLocator=legacy, originalSource=original['source'], originalHistoryObligation=original['recoveryRetryClaimDeadlineBudgetEffects'], runtimeAcceptance='NOT_INFERRED; original cases/results unchanged', historyAcceptance='OPEN; startup capture is NOT durable original acquisition/attempt/nonce retention proof')
        if identity == RUNNER:
            if original['source']['field'] != 'PRISM_AGENT_URL': raise ValueError('Live runner original field drift')
            common.update(status='LIVE_RUNNER_ROUTE_OWNER_JOIN_OPEN', selectedOwner=None,
                actualConsumer=anchor('tests/verification/live/prism-nova-production-e2e.mjs', 'const agentEndpoint = required("PRISM_AGENT_URL")'),
                actualDeliveryLiteral=anchor('scripts/deploy.sh', 'name: PRISM_AGENT_URL, value: "http://127.0.0.1:18444"'),
                rejectedAlias='studioPublicUrl is Studio UI, not production verification agent runner egress18444; agentToolControlUrl is also a distinct route',
                constraint='No exact selected live-runner deployment author/normal delivery projection identified. Preserve explicit required ENV and distinct runner route; implement coherent selected deployment receiving/delivery, not substitute Studio URL or modify production.')
        else:
            owner, leaf, oldfield, receiver, receive_text, effect, effect_text = SPECS[identity]
            if original['source']['field'] != oldfield: raise ValueError('Original source coordinate drift')
            author = owners[owner]
            if author['owner'] != ('prism-control' if owner == CONTROL else 'prism-worker') or author['schemaVersion'] != 'pipeline-component.v2':
                raise ValueError('Selected component owner/version drift')
            leaves = []
            for profile in sorted(author['profiles']):
                ptr = '/profiles/' + profile.replace('~', '~0').replace('/', '~1') + '/settings/' + leaf
                leaves.append({'profile': profile, 'pointer': ptr, 'valueSha256': digest(pointer(author, ptr))})
            if not leaves: raise ValueError('No authored profiles')
            common.update(status='EXACT_PRISM_BOUNDARY_SOURCE_JOIN', selectedOwner=pin(owner), selectedPointerTemplate='/profiles/<original-selected>/settings/' + leaf,
                authoredProfileLeaves=leaves, receiver=anchor(receiver, receive_text), actualEffect=anchor(effect, effect_text),
                composition=anchor(COMPOSITION, 'nonceDatabase: worker.nonceDatabase' if owner == WORKER else ('controlInternalUrl: control.controlInternalUrl' if 'controlInternal' in leaf else 'const { dispatchTimeoutMs, ...control }')),
                startupCapture=[anchor(BOOT, 'selection.digest !== expected.selectionDigest'), anchor(BOOT, 'verifiedCaptures.add(result)')])
            if owner == WORKER:
                common['actualCaller'] = anchor('skills/prism/server/worker.ts', 'new WorkerNonceDatabase(config.databaseUrl, config.nonceDatabase)')
                common['nonceReceiving'] = anchor('skills/prism/server/worker-config.ts', 'nonceDatabase: snapshot.nonceDatabase')
                common['effectCompanion'] = anchor(effect, 'new Date(timestamp + authenticationWindowMs)' if 'HMAC' in identity else 'expires_at <= now() ORDER BY expires_at LIMIT $1')
                common['databaseBridge'] = anchor(receiver, 'this.authenticationWindowMs), signal)' if 'HMAC' in identity else 'new PostgresNonceStore({ query }, this.maximumCleanupRows)')
        rows.append(common)
    if seen != set(SPECS) | {RUNNER}: raise ValueError('Missing boundary fields')
    return {'scope': 'Six original Prism route/nonce fields; five exact existing source joins and one explicitly unresolved distinct runner route',
        'inputs': [pin(h.ROSTER), pin(str((OUT / 'fields.json').relative_to(ROOT)))],
        'counts': {'originalFields': len(rows), 'exactSourceJoins': 5, 'remainingOriginalFields': 1}, 'rows': rows,
        'independentReview': 'OPEN; native spawn unavailable; unchanged known EROFS helper not retried',
        'fullAcceptance': 'OPEN; all2409/6845/50/fullC0-C6 and original history/native/archive gates mandatory'}

def controls():
    baseline = build()
    ledger = read(str((OUT / 'fields.json').relative_to(ROOT)))
    i = next(i for i,r in enumerate(ledger) if r['id'] == 'AUTH-PRISM-ENDPOINT-WORKER')
    results = []
    for key, value in [('id', 'UNKNOWN'), ('original', 'UNKNOWN#/0'), ('originalObjectSha256', '0'*64), ('caseIds', []), ('class', 'protocol'), ('owner', 'wrong')]:
        mutant = copy.deepcopy(ledger); mutant[i][key] = value
        try: build(ledgers=mutant)
        except (ValueError, KeyError) as error: results.append({'control': key+'-drift', 'rejected': True, 'error': str(error)})
        else: raise AssertionError('Accepted mutant: ' + key)
    mutant = copy.deepcopy(ledger); mutant.append(copy.deepcopy(ledger[i]))
    try: build(ledgers=mutant)
    except ValueError as error: results.append({'control': 'duplicate-id', 'rejected': True, 'error': str(error)})
    else: raise AssertionError('Accepted duplicate')
    owners = {p: read(p) for p in [CONTROL, WORKER]}
    del owners[CONTROL]['profiles']['spiffe']['settings']['workerUrl']
    try: build(owners=owners)
    except KeyError as error: results.append({'control': 'missing-alternate-profile-leaf', 'rejected': True, 'error': str(error)})
    else: raise AssertionError('Accepted missing leaf')
    if baseline != build(): raise AssertionError('Restored nondeterminism')
    return {'controls': results, 'restoredPositive': 'PASS', 'qualification': 'Matrix checks only; zero runtime/native/history cases executed'}

if __name__ == '__main__':
    result, checked = build(), controls()
    (OUT / 'prism-boundary-successors.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    (OUT / 'prism-boundary-controls.json').write_text(json.dumps(checked, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'counts': result['counts'], 'rejectedControls': len(checked['controls']), 'fullAcceptance': 'OPEN'}))
