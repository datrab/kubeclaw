from pathlib import Path
import copy, hashlib, json, shutil

root = Path('/home/node/.openclaw/workspace/kubeclaw-pr13-recovery')
base = Path('/home/node/.openclaw/workspace/tmp/pr13-finish-20261021')
evidence = root / 'docs/blueprint/acceptance-evidence/reader-487f4e00-closeout-20261022'
matrix_path = root / 'docs/blueprint/documentation-completion-matrix.json'
read = lambda p: json.loads(p.read_text())
sha = lambda b: hashlib.sha256(b).hexdigest()
canonical = lambda v: sha(json.dumps(v, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode())
revision = '487f4e00af5d330b0fb253c2bdc67210476068f3'
original = read(base / 'preservation-487f4e00/original-records.json')
pending = read(base / 'preservation-487f4e00/integration-preparation/integration-payload-BROWSER-PENDING.json')
matrix = read(matrix_path)
assert matrix['completionRecords'] == original
assert sha(matrix_path.read_bytes()) == pending['matrixBefore']['sha256']
reader = read(base / 'reader-resume-final-20261022/final-adjudication.json')
quality = read(base / 'quality-resume-final-20261022/review.json')
source = read(base / 'source-resume-final-20261022/review.json')
assert reader['verdict'] == quality['verdict'] == 'PASS'
assert reader['revision'] == quality['candidate'] == revision
assert source.get('verdict', source.get('status', '')).startswith('PASS') or source.get('sourceVerdict') == 'PASS'

for name in ['reader-resume-final-20261022', 'source-resume-final-20261022', 'quality-resume-final-20261022']:
    assert not (evidence / name).exists()
    shutil.copytree(base / name, evidence / name)
shutil.copy2(base / 'resumed-root-visual-observation.json', evidence)
shutil.copy2(Path(__file__), evidence / 'integrate-resumed-guide-closeout.py')

def reference(path):
    return {'path': str(path.relative_to(root)), 'sha256': sha(path.read_bytes())}

reviews = {
    'source': reference(evidence / 'source-resume-final-20261022/review.json'),
    'reader': reference(evidence / 'reader-resume-final-20261022/final-adjudication.json'),
    'quality': reference(evidence / 'quality-resume-final-20261022/review.json'),
}
receipt = {
    'channel': 'discord', 'channelId': '1559288131876814898',
    'messageId': '1562743362333839360',
    'sourceRevision': revision,
    'archive': {'filename': 'kubeclaw-reader-offline-487f4e00.zip', 'bytes': 8106602,
                'sha256': '11f177e729b1f66ebd4d1af4493ab42da68bb77eeb1fef8af46d80fef9a5d482'},
    'deliveryStatus': 'sent',
}
(evidence / 'discord-delivery.json').write_text(json.dumps(receipt, indent=2) + '\n')

operations = {x['id']: x for x in pending['integrationOperations']}
applied = []
for record in matrix['completionRecords']:
    before = copy.deepcopy(record)
    if record['id'] not in operations:
        continue
    operation = operations[record['id']]
    assert canonical(record) == operation['preconditionCanonicalSha256']
    impact = copy.deepcopy(operation['appendImpactReview'])
    impact.update({
        'reviewer': '/root/reader_closeout (independent final Reader); original named nonauthor Source/Quality delta proofs retained; /root integration',
        'verdict': 'PASS',
        'summary': 'Preserve this exact original accepted scope after independently reviewed Source deltas and actual current Reader receiving. Original attribution, checks, summary, limits, review, verdict, pages, sources and accepted IDs are retained; no new acceptance or recount.',
        'readerEvidenceDisposition': {'R1': 'PASS', 'R2': 'PASS', 'R3': 'PASS', 'R4': 'PASS', 'R5': 'PASS', 'R6': 'PASS', 'R7': 'PASS'},
        'browserFinalization': {
            'status': 'PASS_BOUNDED_RECEIVING',
            'independentReader': reviews['reader'],
            'all94IndividualDispositions': reference(evidence / 'reader-resume-final-20261022/all94-reader-dispositions.json'),
            'whole433Ledger': reference(evidence / 'reader-resume-final-20261022/current433-ledger.json'),
            'observations': 'Original60 page widths,432 selected-box widths and633 table cases; original137 native endpoint failures retained. Exact137 retests plus57 supplement table cases and3 offline native searches pass. All23 changed/new boxes have same-block six fields and native disclosure at3 widths.',
            'visualScope': reference(evidence / 'resumed-root-visual-observation.json'),
            'limits': 'Scroll-mediated access, not simultaneous columns. No fresh persona, axe/screenreader or live product/runtime/role-consumer approval.',
        },
        'report': 'docs/blueprint/acceptance-evidence/reader-487f4e00-closeout-20261022/root-adoption.json',
        'reportAvailability': 'Later evidence adoption, not a Source file at reviewed487; not added to record.sources.',
    })
    record['revision'] = revision
    record.setdefault('impactReviews', []).append(impact)
    assert {key for key in record.keys() | before.keys() if record.get(key) != before.get(key)} == {'revision', 'impactReviews'}
    applied.append({'id': record['id'], 'originalCanonicalSha256': canonical(before),
                    'adoptedCanonicalSha256': canonical(record)})
assert len(applied) == 48
unchanged = [r for r in matrix['completionRecords'] if r['id'] not in operations]
assert len(unchanged) == 46
assert unchanged == [r for r in original if r['id'] not in operations]

candidate = read(base / 'source-resume-final-20261022/whole-union-completion-record-candidate.json')
candidate['reviewer'] = '/root/source_closeout (Source); /root/reader_closeout (Reader); /root/quality_closeout (Quality); /root combines independent decisions'
candidate['review'] = {'sourceAccuracy': 'PASS', 'readerUsability': 'PASS', 'quality': 'PASS'}
candidate['summary'] = 'Four whole guide gates accepted from the complete51-package Source union, all50 available README semantic comparisons, retained original12 chapter scopes, independently reviewed final corrections and current487 normal Reader/check/archive/browser proof. OPL-001 is accepted only if the separate exact legacy-finding disposition confirms its complete scope. No package/global/runtime acceptance.'
candidate['limits'] = [s for s in candidate['limits'] if not any(t in s for t in ['Reader and Quality verdicts must', 'Matrix remains 52/89'])]
candidate['limits'].append('Independent Reader and Quality final results are incorporated in this later adoption. This does not change the Source-only provenance of the original review.')
candidate['openIssues'] = []
candidate['verdict'] = 'PASS'
candidate.pop('integrationInstruction')
candidate['independentFinalReviews'] = reviews

# OPL001 is separately gated: do not erase the historical unresolved dependency findings by assumption.
opl_disposition_path = base / 'source-resume-final-20261022/opl001-legacy-findings-addendum.json'
if opl_disposition_path.exists():
    opl_disposition = read(opl_disposition_path)
    assert opl_disposition['opl001Verdict'] == 'PASS'
    candidate['legacyFindingsDisposition'] = reference(evidence / 'source-resume-final-20261022/opl001-legacy-findings-addendum.json')
else:
    candidate['requirementIds'] = []
    candidate['id'] = 'A910-07-08-09-12-whole-487f4e00-20261022'
    candidate['summary'] = candidate['summary'].replace(' OPL-001 is accepted only if the separate exact legacy-finding disposition confirms its complete scope.', ' OPL-001 remains separate pending its exact legacy-finding disposition.')

assert not {i for r in original if r['verdict'] == 'PASS' for i in r['gateIds']} & set(candidate['gateIds'])
assert not {i for r in original if r['verdict'] == 'PASS' for i in r['requirementIds']} & set(candidate['requirementIds'])
matrix['completionRecords'].append(candidate)
for key, ids in [('gates', candidate['gateIds']), ('requirements', candidate['requirementIds'])]:
    for row in matrix[key]:
        if row['id'] not in ids:
            continue
        assert row['state'] != 'accepted'
        row.setdefault('closureHistory', []).append(copy.deepcopy(row['closureDecision']))
        row['state'] = 'accepted'
        row['completionRecord'] = candidate['id']
        row['closureDecision'] = {
            'verdict': 'PASS', 'revision': revision, 'completionRecord': candidate['id'],
            'reason': 'Whole exact contract criterion independently Source/Reader/Quality PASS; complete51-package/50-README responsibility union and actual current Reader receiving; original findings/limits retained in named evidence.',
        }
        if key == 'requirements':
            row['sourceVerification'] = 'independent-whole-topic-review-PASS'
            row['legacyFindingHistory'] = row.pop('openFindingIds', [])
            row['openFindingIds'] = []
            row['findingDisposition'] = candidate['legacyFindingsDisposition']

assert sum(x['state'] == 'accepted' for x in matrix['gates']) == 56
assert sum(x['state'] == 'accepted' for x in matrix['requirements']) == 223 + len(candidate['requirementIds'])
adoption = {
    'sourceRevision': revision,
    'independentReviews': reviews,
    'oldRecords': 94, 'affectedPreserved': applied, 'unchangedRecords': 46,
    'onlyOriginalRecordFieldsChanged': ['revision', 'impactReviews append'],
    'newCompletionRecord': candidate['id'], 'newGates': candidate['gateIds'],
    'newRequirements': candidate['requirementIds'],
    'acceptedGates': 56, 'acceptedRequirements': 223 + len(candidate['requirementIds']),
    'originalEvidenceArchive': reference(evidence / 'evidence-index.json'),
    'readerDelivery': reference(evidence / 'discord-delivery.json'),
    'limits': 'No overall/package/release approval. Historical original failures,NOT_READY and product boundaries retained. Structural checker will run after this adoption; no checker result claimed by this script.',
}
(evidence / 'root-adoption.json').write_text(json.dumps(adoption, indent=2) + '\n')
matrix_path.write_text(json.dumps(matrix, indent=2, ensure_ascii=True) + '\n')
print(json.dumps({'gates': adoption['acceptedGates'], 'requirements': adoption['acceptedRequirements'], 'affectedOriginalRecords': len(applied)}))
