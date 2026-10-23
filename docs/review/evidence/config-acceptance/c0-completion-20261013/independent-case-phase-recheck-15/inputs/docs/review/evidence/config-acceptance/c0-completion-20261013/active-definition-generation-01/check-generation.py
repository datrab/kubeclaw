"""Synthetic rehashed adversarial controls at the real catalog loader boundary.

Private baseline registration is library-only and cannot yield C0 acceptance.
These are catalog integrity controls, not semantic/native consumer evidence.
"""
import copy
import gzip
import hashlib
import json
from pathlib import Path
import shutil
import sys
import tempfile

root = Path.cwd()
sys.path.insert(0, str(root/'docs/review/evidence/config-acceptance/author'))
from definition_generation import DefinitionGeneration, DefinitionRoots, generation_sha, load_paired_generation, SCHEMA_PATH
from review_receipts import canonical_sha

results = []
def rejects(name, fn, expected):
    try:
        fn()
    except ValueError as error:
        assert expected in str(error), (name, str(error))
        results.append({'id': name, 'result': 'passed', 'boundary': expected})
    else:
        raise AssertionError('missing rejection:' + name)

with tempfile.TemporaryDirectory(prefix='c0-active-catalog-') as directory:
    private = Path(directory)
    schema = private/SCHEMA_PATH
    schema.parent.mkdir(parents=True)
    shutil.copyfile(root/SCHEMA_PATH, schema)
    def write(path, value):
        path = private/path
        path.parent.mkdir(parents=True, exist_ok=True)
        data = (json.dumps(value, sort_keys=True, ensure_ascii=False, allow_nan=False)+'\n').encode()
        path.write_bytes(data)
        return {'path': str(path.relative_to(private)), 'sha256': hashlib.sha256(data).hexdigest()}
    setting = {'id': 'S', 'caseIds': ['C'], 'requirementIds': ['R'], 'currentValue': 1024,
               'semanticStatus': 'unresolved', 'reviewerConfirmation': None}
    case = {'id': 'C', 'settingIds': ['S'], 'requirementIds': ['R'], 'phase': 'C3',
            'result': 'failed', 'nativeMapping': {'id': 'original-native'}, 'reviewerConfirmation': None}
    requirement = {'id': 'R', 'text': 'Preserve every original obligation.'}
    inventory_path = 'docs/review/remediation/config-semantic-inventory.json'
    matrix_path = 'docs/review/remediation/config-acceptance-matrix.json'
    inventory = {'rows': [setting], 'gaps': [{'id': 'original-gap'}]}
    matrix = {'cases': [case], 'requirements': [requirement], 'implementationAuthorization': None}
    originals = {inventory_path: inventory, matrix_path: matrix}
    inputs = []
    for path, body in originals.items():
        raw = (json.dumps(body, sort_keys=True)+'\n').encode()
        packed = gzip.compress(raw, mtime=0)
        packed_path = 'baseline/'+hashlib.sha256(raw).hexdigest()+'.json.gz'
        (private/packed_path).parent.mkdir(parents=True, exist_ok=True)
        (private/packed_path).write_bytes(packed)
        inputs.append({'gitRevision': 'synthetic-not-production', 'encoding': 'gzip', 'originalPath': path,
                       'objectPath': packed_path, 'objectSha256': hashlib.sha256(packed).hexdigest(),
                       'objectBytes': len(packed), 'uncompressedBytes': len(raw),
                       'uncompressedSha256': hashlib.sha256(raw).hexdigest()})
    catalog = []
    for kind, identifier, body, path, pointer in [('case', 'C', case, matrix_path, '/cases/0'),
        ('requirement', 'R', requirement, matrix_path, '/requirements/0'),
        ('setting', 'S', setting, inventory_path, '/rows/0')]:
        source = next(v for v in inputs if v['originalPath'] == path)
        catalog.append({'kind': kind, 'id': identifier, 'bodySha256': canonical_sha(body),
                        'occurrences': [{'originalPath': path, 'pointer': pointer,
                                         'uncompressedSha256': source['uncompressedSha256']}]})
    catalog_sha = canonical_sha(catalog)
    catalog_ref = write('baseline/catalog.json', {'schemaVersion': 'config-definition-baseline-catalog.v1',
        'sourceRevision': 'synthetic-not-production', 'records': catalog, 'catalogSha256': catalog_sha})
    baseline_ref = write('baseline/manifest.json', {'schemaVersion': 'config-definition-baseline-manifest.v1',
        'sourceRevision': 'synthetic-not-production', 'inputs': inputs, 'catalogRef': catalog_ref,
        'catalogSha256': catalog_sha, 'catalogUniqueIds': 3, 'catalogOccurrences': 3})
    registrations = [{**baseline_ref, 'sourceRevision': 'synthetic-not-production'}]
    bodies = {'case': case, 'requirement': requirement, 'setting': setting}
    body_ref = write('active-bodies.json', bodies)
    records = []
    for record in catalog:
        records.append({'kind': record['kind'], 'id': record['id'],
            'origin': {'tag': 'baseline', 'bodySha256': record['bodySha256']},
            'activeBodyRef': {**body_ref, 'pointer': '/'+record['kind'], 'bodySha256': record['bodySha256']},
            'change': {'kind': 'unchanged', 'reason': 'synthetic unchanged preservation control',
                       'preservedOriginalCaseIds': ['C'] if record['kind'] in {'case', 'setting'} else [],
                       'refinementEvidenceRefs': []}, 'reviewerConfirmation': None})
    input_ref = write('inputs.json', {'schemaVersion': 'config-active-definition-inputs.v1', 'files': [body_ref]})
    original_generation = {'schemaVersion': 'config-active-definition-generation.v1', 'id': 'synthetic-control',
        'baselineManifestRef': baseline_ref, 'baselineCatalogSha256': catalog_sha, 'inputManifestRef': input_ref,
        'requirementContextSha256': canonical_sha([{'id': 'R', 'bodySha256': canonical_sha(requirement)}]),
        'records': records, 'reviewerConfirmation': None}
    def seal(value):
        value['contentSha256'] = generation_sha(value)
        return {**write('generation.json', value), 'schemaVersion': value['schemaVersion'],
                'contentSha256': value['contentSha256']}
    def load(value=None):
        value = copy.deepcopy(original_generation if value is None else value)
        return DefinitionGeneration(private, seal(value), registrations)
    verified = load()
    assert verified.baseline.bodies[('case', 'C')]['result'] == 'failed'
    verified.assert_no_drift()
    results.append({'id': 'synthetic unchanged whole catalog with failed case and gap history preserved', 'result': 'passed'})
    rejects('production registry rejects synthetic baseline',
            lambda: DefinitionGeneration(private, seal(copy.deepcopy(original_generation))), 'DEFINITION_BASELINE_NOT_REGISTERED')
    rejects('legacy case shape is not finalized semantic acceptance', verified.require_acceptance,
            'DEFINITION_CASE_BODY_INVALID')
    proposed = {'id': 'TEST-C', 'targetTestPath': 'proposed/consumer.test.ts',
                'command': 'synthetic-case-command C', 'proposedSource': 'synthetic future harness; no consumer proof',
                'assertions': {'effect': 'Observe the productive selected value.'},
                'mutations': {'fallback': 'Introduce productive fallback.'},
                'restorationAssertions': {'restore': 'Restore and repeat the oracle.'}}
    proposed_ref = write('proposed-test.json', proposed)
    finalized = {'schemaVersion': 'config-finalized-case.v1', 'id': 'C', 'originalCase': case,
        'requirementIds': ['R'], 'settingIds': ['S'], 'applicability': 'applicable',
        'replacementCaseIds': [], 'executionPhase': 'implementation', 'implementationSlice': 'C3',
        'scope': 'local', 'scopeDerivation': {'originalValue': None,
            'reason': 'Explicit synthetic local metadata scope; original had no scope.', 'evidenceRefs': [proposed_ref]},
        'result': 'not-run', 'executedEvidence': None,
        'specification': {'productiveCaller': 'synthetic metadata control', 'inputProfile': {'id': 'synthetic'},
            'priorState': 'original', 'expectedEffectOrRejectingBoundary': 'synthetic control only',
            'observerMethod': 'metadata validator', 'command': proposed['command'],
            'identities': {k: [{'id': k, 'revision': 'synthetic'}] for k in ('software', 'tools', 'dependencies', 'images', 'config')},
            'reason': 'exercise integrated case validation, not consumer execution', 'definitionSourceRefs': [proposed_ref]},
        'plannedTests': [{'id': proposed['id'], 'targetTestPath': proposed['targetTestPath'],
            'command': proposed['command'], 'specificationRef': proposed_ref,
            'assertionIds': ['effect'], 'mutationIds': ['fallback'], 'restorationAssertionIds': ['restore']}]}
    def finalized_load(body):
        active = {**bodies, 'case': body}
        active_ref = write('finalized-bodies.json', active)
        value = copy.deepcopy(original_generation)
        value['inputManifestRef'] = write('finalized-inputs.json', {
            'schemaVersion': 'config-active-definition-inputs.v1', 'files': [active_ref, proposed_ref]})
        for record in value['records']:
            record['activeBodyRef'].update(active_ref)
            record['activeBodyRef']['bodySha256'] = canonical_sha(active[record['kind']])
            if record['kind'] == 'case':
                record['change'].update(kind='corrected', refinementEvidenceRefs=[copy.deepcopy(record['activeBodyRef'])])
        return load(value)
    finalized_verified = finalized_load(finalized)
    finalized_verified.validate_cases()
    results.append({'id': 'integrated finalized future case preserves original failed C3 body', 'result': 'passed'})
    rejects('valid case metadata cannot accept remaining whole-generation gates', finalized_verified.require_acceptance,
            'DEFINITION_GENERATION_SEMANTIC_ACCEPTANCE_NOT_IMPLEMENTED')
    disguised = copy.deepcopy(finalized)
    disguised['executionPhase'] = 'C0-definition'
    rejects('fully rehashed original runtime case cannot become C0 execution',
            lambda: finalized_load(disguised).validate_cases(), 'ORIGINAL_RUNTIME_CASE_RECLASSIFIED')
    shifted = copy.deepcopy(finalized)
    shifted['implementationSlice'] = 'C4'
    rejects('fully rehashed original C3 cannot become C4',
            lambda: finalized_load(shifted).validate_cases(), 'ORIGINAL_IMPLEMENTATION_SLICE_CHANGED')
    def mutate(name, change, expected):
        value = copy.deepcopy(original_generation)
        change(value)
        rejects(name, lambda: load(value), expected)
    mutate('missing original setting after valid reseal', lambda v: v['records'].pop(), 'ORIGINAL_ID_MISSING')
    mutate('duplicate original ID after valid reseal', lambda v: v['records'].append(copy.deepcopy(v['records'][0])), 'ID_ORDER_INVALID')
    mutate('noncanonical record ordering after valid reseal', lambda v: v['records'].reverse(), 'ID_ORDER_INVALID')
    mutate('false original-body provenance after valid reseal', lambda v: v['records'][0]['origin'].update(bodySha256='0'*64), 'ORIGIN_DRIFT')
    mutate('baseline case disguised as discovery', lambda v: v['records'][0]['change'].update(kind='discovered'), 'CHANGE_ORIGIN_INVALID')
    mutate('original case obligation omitted', lambda v: v['records'][0]['change'].update(preservedOriginalCaseIds=[]), 'ORIGINAL_CASE_SET_INVALID')
    mutate('stale requirement context after valid reseal', lambda v: v.update(requirementContextSha256='0'*64), 'REQUIREMENT_CONTEXT_INVALID')
    mutate('stale pointed-body digest after valid reseal', lambda v: v['records'][0]['activeBodyRef'].update(bodySha256='0'*64), 'BODY_DRIFT')
    mutate('body file outside manifest after valid reseal', lambda v: v['records'][0]['activeBodyRef'].update(path='unlisted.json'), 'BODY_NOT_IN_INPUT_SET')
    mutate('wrong baseline catalog context after valid reseal', lambda v: v.update(baselineCatalogSha256='0'*64), 'BASELINE_CONTEXT_INVALID')
    # Change body bytes, file/body/manifest/envelope hashes coherently. Rejection
    # must come from the conservation/link rule, not a stale outer file hash.
    def changed_body(name, kind, edit, expected):
        changed = copy.deepcopy(bodies)
        edit(changed[kind])
        changed_ref = write('changed-bodies.json', changed)
        value = copy.deepcopy(original_generation)
        value['inputManifestRef'] = write('changed-inputs.json', {'schemaVersion': 'config-active-definition-inputs.v1', 'files': [changed_ref]})
        for record in value['records']:
            record['activeBodyRef'].update(changed_ref)
            record['activeBodyRef']['bodySha256'] = canonical_sha(changed[record['kind']])
            if record['kind'] == kind:
                record['change']['kind'] = 'corrected'
                record['change']['refinementEvidenceRefs'] = [copy.deepcopy(record['activeBodyRef'])]
        rejects(name, lambda: load(value), expected)
    changed_body('normative requirement cannot be edited', 'requirement', lambda b: b.update(text='weakened'), 'REQUIREMENT_CHANGED')
    changed_body('coherently rehashed dangling case-to-setting join', 'case', lambda b: b.update(settingIds=['absent']), 'DANGLING_LINK')
    ref = seal(copy.deepcopy(original_generation))
    left, right = {**inventory, 'activeDefinitionGenerationRef': ref}, {**matrix, 'activeDefinitionGenerationRef': ref}
    write(inventory_path, left)
    write(matrix_path, right)
    paired = load_paired_generation(private, left, right, baseline_registrations=registrations)
    paired.assert_no_drift()
    results.append({'id': 'matching two-root authority preserves complete original projections', 'result': 'passed'})
    rejects('one-sided root activation', lambda: load_paired_generation(private, left, matrix), 'ROOT_REFERENCES_DIFFER')
    rejects('null is not historical absence', lambda: load_paired_generation(private, {'activeDefinitionGenerationRef': None}, {}), 'NULL_ROOT_REFERENCE')
    rejects('parsed root cannot differ from pinned root bytes', lambda: load_paired_generation(private,
        {**left, 'gaps': []}, right, baseline_registrations=registrations), 'PARSED_ROOT_DRIFT')
    write(inventory_path, {**left, 'gaps': []})
    rejects('coherently referenced actual root history mutation', lambda: load_paired_generation(private,
        {**left, 'gaps': []}, right, baseline_registrations=registrations), 'ROOT_HISTORY_DRIFT')
    write(inventory_path, left)
    root_file = private/inventory_path
    root_raw = root_file.read_bytes()
    write(inventory_path, {**left, 'gaps': []})
    rejects('IC09 actual root bytes changed after paired load', paired.assert_no_drift, 'REVIEW_INPUT_CHANGED')
    root_file.write_bytes(root_raw)
    sibling = root_file.with_suffix('.original')
    root_file.rename(sibling)
    root_file.symlink_to(sibling.name)
    rejects('IC09 same-byte root symlink changed after paired load', paired.assert_no_drift, 'REVIEW_INPUT_CHANGED')
    root_file.unlink()
    sibling.rename(root_file)
    paired.assert_no_drift()
    # Explicit checker root arguments retain their own named references too.
    write('alternate-inventory.json', left)
    write('alternate-matrix.json', right)
    alternate = DefinitionRoots(private)
    alt_left = alternate.read('inventory', 'alternate-inventory.json')
    alt_right = alternate.read('matrix', private/'alternate-matrix.json')
    alternate_pair = load_paired_generation(private, alt_left, alt_right, root_documents=alternate,
                                            baseline_registrations=registrations)
    write('alternate-matrix.json', {**right, 'implementationAuthorization': 'fabricated'})
    rejects('explicit checker-path matrix changed at final root check', alternate_pair.assert_no_drift, 'REVIEW_INPUT_CHANGED')
    write('alternate-matrix.json', right)
    alternate_pair.assert_no_drift()
    results.append({'id': 'restored canonical and explicit-path paired-root positives', 'result': 'passed'})
    for inv_path, mat_path, mode in [(inventory_path, matrix_path, 'canonical'),
                                    ('alternate-inventory.json', 'alternate-matrix.json', 'explicit')]:
        write(inv_path, inventory)
        write(mat_path, matrix)
        cached = DefinitionRoots(private)
        cached_inventory = cached.read('inventory', inv_path)
        cached_matrix = cached.read('matrix', mat_path)
        cached_inventory['activeDefinitionGenerationRef'] = ref
        cached_matrix['activeDefinitionGenerationRef'] = ref
        rejects('IC10 mutable parsed '+mode+' roots cannot activate absent disk generation',
                lambda: load_paired_generation(private, cached_inventory, cached_matrix, root_documents=cached,
                                               baseline_registrations=registrations), 'PARSED_ROOT_DRIFT')
        write(inv_path, left)
        write(mat_path, right)
    paired.assert_no_drift()
    alternate_pair.assert_no_drift()
    outside = private.parent/'not-inside-checkout.json'
    rejects('root authority cannot select external checkout path',
            lambda: DefinitionRoots(private).read('inventory', outside), 'ROOT_PATH_OUTSIDE_CHECKOUT')
    file = private/'active-bodies.json'
    raw = file.read_bytes()
    file.write_bytes(raw+b' ')
    rejects('body byte mutation at final logical pin check', paired.assert_no_drift, 'REVIEW_INPUT_CHANGED')
    file.write_bytes(raw)
    file.rename(private/'original-bodies.json')
    file.symlink_to('original-bodies.json')
    rejects('same-byte body symlink retarget at final pin check', paired.assert_no_drift, 'REVIEW_INPUT_CHANGED')
    file.unlink()
    (private/'original-bodies.json').rename(file)
    paired.assert_no_drift()
    results.append({'id': 'restored original positive at same catalog boundary', 'result': 'passed'})
print(json.dumps({'controls': results, 'passed': len(results), 'failed': 0,
    'globalC0Accepted': False, 'qualification': 'synthetic catalog integrity only; semantic validator and genuine whole review remain open'}, indent=2))
