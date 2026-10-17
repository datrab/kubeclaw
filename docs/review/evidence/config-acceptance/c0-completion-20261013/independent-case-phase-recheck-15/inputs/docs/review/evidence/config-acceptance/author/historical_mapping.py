"""Evidence-only historical mappings; never reactivate obsolete case bodies.

This guard prepares a bounded projection. It does not modify the root matrix,
accept fields, or execute future behavior cases. Changed reviewed inputs require
a new material review rather than retaining the old review by case ID.
"""
import hashlib
import json

MAP = 'docs/review/evidence/config-acceptance/runtime/batches/6606af9-historical-case-links-12/native-historical-successor-map.json'
MAP_SHA = '1c0cf5830f0c91a0c3a5000831fb7be98ce278255a44050673491923e2ca9ad3'
REVIEW = 'docs/review/evidence/config-acceptance/independent-runtime-historical-links-6606/stable-independent-review-receipt.json'
REVIEW_SHA = 'b6f59adce3b44c68edc2268c89fe24b47411c1771cc4680daeeba9c71e7e2787'
REPORT = 'docs/review/remediation/independent-runtime-historical-links-6606.md'
REPORT_SHA = '5a99aff9cac9a448d8b08429831165cc16aca569b3d17177bd43db131d9bd749'


def canonical_sha(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'),
                                    ensure_ascii=False).encode()).hexdigest()


def require(condition, reason):
    if not condition:
        raise ValueError('HISTORICAL_MAPPING:' + reason)


def indexed(items, label):
    result = {item['id']: item for item in items}
    require(len(result) == len(items), 'duplicate ' + label)
    return result


def validate(mapping, native_cases, rows, dispositions, canonical_ids):
    """Return inactive history links after checking every reviewed dependency."""
    originals = indexed(native_cases, 'native case')
    fields = indexed(rows, 'field')
    history = indexed(dispositions, 'disposition')
    records = mapping['records']
    require(len(records) == 269 and len({r['nativeCaseId'] for r in records}) == 269,
            'historical record set drift')
    result = {}
    for record in records:
        cid = record['nativeCaseId']
        require(cid in originals and cid in history, cid + ': missing historical input')
        original = originals[cid]
        disposition = history[cid]
        require(canonical_sha(original) == record['historicalCaseCanonicalSha256'],
                cid + ': historical body drift')
        require(disposition == record['historicalDisposition'], cid + ': disposition drift')
        require(disposition['disposition'] == 'superseded' and
                disposition['countsTowardAcceptance'] is False and
                record['semanticAcceptance'] is False and cid not in canonical_ids,
                cid + ': obsolete case reactivation/acceptance')
        require(original['requirements'] == record['nativeOriginalRequirements'] ==
                disposition['originalRequirementsPreserved'], cid + ': original requirement loss')
        require(original['result'] == record['nativeOriginalResult'] ==
                disposition['evidenceResultPreserved'] and
                original['scope'] == record['nativeOriginalScope'], cid + ': result/scope drift')
        successors = record['oneToManyActiveCanonicalSuccessors']
        successor_ids = [s['caseId'] for s in successors]
        require(successor_ids and len(set(successor_ids)) == len(successor_ids) and
                successor_ids == disposition['supersededBy'], cid + ': successor set/order drift')
        requirements = set()
        for successor in successors:
            sid = successor['caseId']
            require(sid in canonical_ids and sid in originals, cid + ': dangling successor')
            current = originals[sid]
            require(canonical_sha(current) == successor['caseCanonicalSha256'],
                    cid + ': successor material drift')
            require(current['requirements'] == successor['requirements'] and
                    current['result'] == successor['result'] and
                    current['scope'] == successor['scope'], cid + ': successor obligations drift')
            require(history[sid]['disposition'] == 'active', cid + ': inactive successor')
            successor_disposition = history[sid]
            require(successor_disposition['countsTowardAcceptance'] is False and
                    successor_disposition['evidenceResultPreserved'] == current['result'] and
                    successor_disposition['originalRequirementsPreserved'] == current['requirements'] and
                    successor_disposition['activeSettingLinks'] == current['settings'] and
                    successor_disposition['supersededBy'] == [],
                    cid + ': successor disposition metadata drift')
            requirements.update(current['requirements'])
        require(set(original['requirements']) <= requirements, cid + ': successor requirement loss')
        require([s['settingId'] for s in record['settings']] == original['settings'],
                cid + ': field links drift')
        for setting in record['settings']:
            field = fields.get(setting['settingId'])
            require(field is not None and canonical_sha(field) == setting['rowDefinitionCanonicalSha256'],
                    cid + ': reviewed field material drift')
            require(field['source'] == setting['source'] and
                    all(sid in field['cases'] for sid in successor_ids),
                    cid + ': active field/successor binding drift')
        result[cid] = {
            'mappingKind': 'reviewed-historical-supersession',
            'canonicalCaseId': None,
            'historicalCaseCanonicalSha256': record['historicalCaseCanonicalSha256'],
            'historicalDisposition': disposition,
            'activeCanonicalSuccessors': successors,
            'reviewedSettings': record['settings'],
            'historicalMappingReview': {'mapPath': MAP, 'mapSha256': MAP_SHA,
                'receiptPath': REVIEW, 'receiptSha256': REVIEW_SHA,
                'reportPath': REPORT, 'reportSha256': REPORT_SHA,
                'scope': 'historical supersession definition only; parent projection review pending'},
            'countsTowardAcceptance': False,
            'semanticAcceptance': False,
        }
    require(len({s['caseId'] for r in result.values() for s in r['activeCanonicalSuccessors']}) == 356,
            'distinct successor count drift')
    return result


def load_reviewed(root, native_cases, rows, dispositions, canonical_ids):
    for path, expected in [(MAP, MAP_SHA), (REVIEW, REVIEW_SHA), (REPORT, REPORT_SHA)]:
        require(hashlib.sha256((root/path).read_bytes()).hexdigest() == expected,
                'reviewed artifact drift: ' + path)
    mapping = json.loads((root/MAP).read_text())
    review = json.loads((root/REVIEW).read_text())
    require(review['materialFindings'] == [] and
            review['independentResults']['droppedRequirements'] == [], 'unresolved independent findings')
    for record in mapping['records']:
        for setting in record['settings']:
            source = setting['source']
            require(hashlib.sha256((root/source['path']).read_bytes()).hexdigest() == source['sha256'],
                    'reviewed productive source drift: ' + source['path'])
    return validate(mapping, native_cases, rows, dispositions, canonical_ids)
