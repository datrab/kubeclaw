#!/usr/bin/env python3
"""Exact preservation/navigation audit. Never equate source presence with runtime acceptance."""
import collections
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
OUT = Path(__file__).resolve().parent
ROSTER = ROOT / 'docs/review/evidence/config-acceptance/c0-completion-20261013/PACKAGE-FIELD-CASE-JOINS.json'
roster = json.loads(ROSTER.read_text())
cache = {}

def resolve(reference):
    document, pointer = reference.split('#', 1)
    file = ROOT / roster['documents'][document]['path']
    if file not in cache:
        cache[file] = json.loads(file.read_text())
    value = cache[file]
    for segment in pointer.lstrip('/').split('/') if pointer else []:
        key = segment.replace('~1', '/').replace('~0', '~')
        value = value[int(key)] if isinstance(value, list) else value[key]
    return value

def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest()

def locator(value):
    if isinstance(value, dict):
        path = value.get('path')
        return [path.split('#')[0]] if isinstance(path, str) and path.startswith('config/') else []
    if isinstance(value, str) and value.startswith('config/'):
        return [value.split('#')[0]]
    return []

failures = []
ledgers = {}
for group in ['fields', 'cases', 'requirements']:
    seen = set()
    ledger = []
    for row in roster[group]:
        original = resolve(row['original'])
        actual = digest(original)
        if row['id'] in seen or original['id'] != row['id'] or actual != row['sha256']:
            failures.append({'group': group, 'id': row['id'], 'original': row['original'], 'hashMatches': actual == row['sha256']})
        seen.add(row['id'])
        entry = {'id': row['id'], 'original': row['original'], 'originalObjectSha256': actual,
                 'preserved': actual == row['sha256'], 'runtimeAcceptance': 'NOT_INFERRED_BY_PRESERVATION_AUDIT'}
        if group == 'fields':
            candidates = []
            for ref in row.get('target', {}).get('author', []):
                try:
                    candidates.extend(locator(resolve(ref)))
                except (KeyError, IndexError, ValueError) as error:
                    failures.append({'group': 'navigation', 'id': row['id'], 'reference': ref, 'error': type(error).__name__})
            entry.update({'owner': original.get('owner'), 'class': original.get('class', original.get('classification')),
                          'primaryPhase': row['primaryPhase'], 'caseIds': row.get('caseIds', []),
                          'targetAuthorReferences': row.get('target', {}).get('author', []),
                          'explicitConfigLocatorObservations': [{'path': p, 'presentInCheckout': (ROOT / p).is_file(),
                              'qualification': 'Locator observation only; not implementation/acceptance or authority to promote v10'} for p in sorted(set(candidates))]})
        elif group == 'cases':
            entry.update({'fieldIds': row['fieldIds'], 'requirementIds': row['requirementIds'],
                          'implementationPhases': row['implementationPhases'], 'originalResultReference': row.get('result'),
                          'originalResult': resolve(row['result']) if row.get('result') else None})
        ledger.append(entry)
    ledgers[group] = ledger
    (OUT / (group + '.json')).write_text(json.dumps(ledger, ensure_ascii=False, indent=2) + '\n')
fields = {row['id'] for row in roster['fields']}
requirements = {row['id'] for row in roster['requirements']}
unknown_field_ids = sorted({v for row in roster['cases'] for v in row['fieldIds']} - fields)
unknown_requirement_ids = sorted({v for row in roster['cases'] for v in row['requirementIds']} - requirements)
missing = collections.defaultdict(list)
for row in ledgers['fields']:
    for observed in row['explicitConfigLocatorObservations']:
        if not observed['presentInCheckout']:
            missing[observed['path']].append(row['id'])
summary = {'scope': 'Complete ORIGINAL identity/hash/result preservation plus exact navigation audit; NOT runtime implementation or C6 acceptance',
           'roster': str(ROSTER.relative_to(ROOT)), 'rosterSha256': hashlib.sha256(ROSTER.read_bytes()).hexdigest(),
           'counts': {k: len(v) for k, v in ledgers.items()},
           'preservedCounts': {k: sum(row['preserved'] for row in v) for k, v in ledgers.items()},
           'integrityFailures': failures, 'caseFieldIdsOutsideRoster': unknown_field_ids,
           'caseRequirementIdsOutsideRoster': unknown_requirement_ids,
           'operatorFieldCountsByPrimaryPhase': dict(collections.Counter(row['primaryPhase'] for row in ledgers['fields'] if row['class'] == 'operator-setting')),
           'missingExplicitTargetConfigLocators': [{'path': p, 'originalFieldIds': ids, 'qualification': 'Precise source followup; final successor precedence/actual caller contracts must be checked. This is not permission to invent author values or activate denied v10.'} for p, ids in sorted(missing.items())],
           'taskComplete': False, 'fullAcceptance': 'OPEN',
           'nextAction': 'Resolve exact remaining source/target/caller gaps against final successor precedence and current verified checkpoints; execute original applicable cases, retain native/archive blockers and obtain integrated independent C6 review.'}
(OUT / 'RESULT.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'counts': summary['counts'], 'preserved': summary['preservedCounts'], 'integrityFailures': len(failures),
                  'unknownFieldIds': len(unknown_field_ids), 'unknownRequirementIds': len(unknown_requirement_ids),
                  'missingTargetLocatorCount': len(missing), 'fullAcceptance': 'OPEN'}))
raise SystemExit(bool(failures))
