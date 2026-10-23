"""Case metadata controls; no new consumer test or C0 acceptance asserted."""
import copy
import hashlib
import json
from pathlib import Path
import sys
import tempfile

root = Path.cwd()
sys.path.insert(0, str(root/'docs/review/evidence/config-acceptance/author'))
from definition_cases import validate_case
from review_receipts import ReviewReceipts

results = []
def rejects(name, fn, expected):
    try:
        fn()
    except ValueError as error:
        assert expected in str(error), (name, str(error))
        results.append({'id': name, 'result': 'passed', 'boundary': expected})
    else:
        raise AssertionError('missing rejection:' + name)

with tempfile.TemporaryDirectory(prefix='c0-finalized-case-') as directory:
    private = Path(directory)
    def write(path, value):
        data = (json.dumps(value, sort_keys=True)+'\n').encode()
        (private/path).write_bytes(data)
        return {'path': path, 'sha256': hashlib.sha256(data).hexdigest()}
    source_ref = write('source.json', {'synthetic': 'definition source identity control'})
    original = {'id': 'C', 'settingIds': ['S'], 'requirementIds': ['R'], 'result': 'failed',
                'phase': 'proposed-after-approval', 'nativeMapping': {'id': 'original-native'}}
    proposed = {'id': 'TEST-C', 'targetTestPath': 'proposed/consumer.test.ts',
                'command': 'proposed-test-command --case C',
                'proposedSource': 'test("C", async () => { await realConsumer(profile); assert(effect); });',
                'assertions': {'effect': 'Observe selected value at actual consumer, not mock.'},
                'mutations': {'fallback': 'Reintroduce missing-value fallback at the productive boundary.'},
                'restorationAssertions': {'restore': 'Restore exact baseline and rerun effect/rejection oracle.'}}
    proposed_ref = write('proposed-test.json', proposed)
    body = {'schemaVersion': 'config-finalized-case.v1', 'id': 'C', 'originalCase': original,
            'requirementIds': ['R'], 'settingIds': ['S'], 'applicability': 'applicable',
            'replacementCaseIds': [], 'executionPhase': 'implementation', 'implementationSlice': 'C3',
            'scope': 'local', 'scopeDerivation': {'originalValue': None,
                'reason': 'Explicit synthetic local metadata scope; original had no scope.', 'evidenceRefs': [source_ref]},
            'result': 'not-run', 'executedEvidence': None,
            'specification': {'productiveCaller': 'synthetic metadata-control consumer, no real effect claimed',
                'inputProfile': {'id': 'synthetic-complete-input'}, 'priorState': 'synthetic original A',
                'expectedEffectOrRejectingBoundary': 'synthetic metadata control only',
                'observerMethod': 'identity/metadata validator', 'command': proposed['command'],
                'identities': {k: [{'id': 'synthetic-'+k, 'revision': 'synthetic-metadata-revision'}]
                               for k in ('software', 'tools', 'dependencies', 'images', 'config')},
                'reason': 'control future specification and immutable history separation', 'definitionSourceRefs': [source_ref]},
            'plannedTests': [{'id': proposed['id'], 'targetTestPath': proposed['targetTestPath'],
                'command': proposed['command'], 'specificationRef': proposed_ref, 'assertionIds': ['effect'],
                'mutationIds': ['fallback'], 'restorationAssertionIds': ['restore']}]}
    catalog = {('case', 'C'): body, ('setting', 'S'): {}, ('requirement', 'R'): {}}
    original_cases = {'C': original}
    pins = ReviewReceipts(private)
    def check(value):
        validate_case(value, original, catalog, pins, original_cases)
    check(body)
    assert not (private/proposed['targetTestPath']).exists()
    results.append({'id': 'future source artifact verified without fabricated executable-test digest', 'result': 'passed'})
    def mutate(name, edit, expected):
        value = copy.deepcopy(body)
        edit(value)
        rejects(name, lambda: check(value), expected)
    mutate('historical failure changed to retrospective pass', lambda v: v['originalCase'].update(result='passed'), 'HISTORY_CHANGED')
    mutate('historical original phase rewritten', lambda v: v['originalCase'].update(phase='C0'), 'HISTORY_CHANGED')
    mutate('historical native map deleted', lambda v: v['originalCase'].pop('nativeMapping'), 'HISTORY_CHANGED')
    mutate('scope derivation cannot rewrite original scope',
           lambda v: v['scopeDerivation'].update(originalValue='invented'), 'SCOPE_HISTORY_CHANGED')
    mutate('scope derivation needs a reason',
           lambda v: v['scopeDerivation'].update(reason=''), 'SCOPE_REASON_MISSING')
    mutate('scope derivation needs pinned evidence',
           lambda v: v['scopeDerivation'].update(evidenceRefs=[]), 'SCOPE_EVIDENCE_MISSING')
    descriptive_original = {**original, 'scope': 'historical role-description, not a typed local/live value'}
    descriptive = copy.deepcopy(body)
    descriptive['originalCase'] = descriptive_original
    descriptive['scopeDerivation']['originalValue'] = descriptive_original['scope']
    validate_case(descriptive, descriptive_original, catalog, pins, original_cases)
    results.append({'id': 'descriptive historical scope retained with explicit evidenced local derivation', 'result': 'passed'})
    mutate('original requirements dropped', lambda v: v.update(requirementIds=[]), 'ORIGINAL_OR_DANGLING_REQUIREMENTIDS')
    mutate('IC10 null placeholder is not software identity',
           lambda v: v['specification']['identities'].update(software=[{'notAnIdentity': None}]), 'IDENTITIES_SOFTWARE')
    mutate('IC10 config identity needs a concrete nonnull revision',
           lambda v: v['specification']['identities'].update(config=[{'id': 'config', 'revision': None}]), 'IDENTITY_REVISION_INVALID')
    mutate('unapproved future runtime PASS', lambda v: v.update(result='passed'), 'UNAPPROVED_RUNTIME_RESULT')
    mutate('original runtime case cannot masquerade as a C0 observation',
           lambda v: v.update(executionPhase='C0-definition'), 'ORIGINAL_RUNTIME_CASE_RECLASSIFIED')
    mutate('future case fabricates execution evidence', lambda v: v.update(executedEvidence={'testDigests': ['fake']}), 'UNAPPROVED_RUNTIME_RESULT')
    mutate('missing proposed harness', lambda v: v.update(plannedTests=[]), 'PLANNED_TEST_MISSING')
    mutate('fake actual digest on planned test', lambda v: v['plannedTests'][0].update(actualTestSha256='0'*64), 'PLANNED_TEST_INVALID')
    mutate('planned test path/source mismatch', lambda v: v['plannedTests'][0].update(targetTestPath='different.test.ts'), 'PLANNED_TEST_SOURCE_MISMATCH')
    mutate('required mutation specification dropped', lambda v: v['plannedTests'][0].update(mutationIds=[]), 'PLANNED_OBLIGATIONS_INVALID')
    mutate('required restoration specification dropped', lambda v: v['plannedTests'][0].update(restorationAssertionIds=[]), 'PLANNED_OBLIGATIONS_INVALID')
    mutate('invariant substitution silently drops former case', lambda v: v.update(applicability='invariant-substitution'), 'INVARIANT_OBLIGATIONS_MISSING')
    catalog[('case', 'replacement')] = {'requirementIds': []}
    mutate('invariant replacement loses requirements', lambda v: v.update(applicability='invariant-substitution', replacementCaseIds=['replacement']), 'INVARIANT_REQUIREMENTS_LOST')
    catalog[('case', 'replacement')]['requirementIds'] = ['R']
    mutate('requirement labels alone cannot replace an executable case',
           lambda v: v.update(applicability='invariant-substitution', replacementCaseIds=['replacement']),
           'INVARIANT_REPLACEMENT_CONTEXT_MISSING')
    replacement_original = copy.deepcopy(original)
    replacement_original['id'] = 'replacement'
    replacement = copy.deepcopy(body)
    replacement['id'] = 'replacement'
    replacement['originalCase'] = replacement_original
    original_cases['replacement'] = replacement_original
    catalog[('case', 'replacement')] = replacement
    invariant = copy.deepcopy(body)
    invariant.update(applicability='invariant-substitution', replacementCaseIds=['replacement'])
    check(invariant)
    results.append({'id': 'explicit invariant replacement preserves all requirements and original failed history', 'result': 'passed'})
    catalog[('case', 'replacement')]['plannedTests'] = []
    rejects('invariant replacement must have complete planned executable harness', lambda: check(invariant), 'PLANNED_TEST_MISSING')
    catalog[('case', 'replacement')] = copy.deepcopy(body)
    catalog[('case', 'replacement')].update(id='replacement', originalCase=replacement_original)
    # Identity-check an actual already-executed definition observation, not a
    # synthetic stdout called proof of an unimplemented runtime consumer.
    base = root/'docs/review/evidence/config-acceptance/c0-completion-20261013/active-definition-generation-01'
    log = json.loads((base/'root-structural-alias.stdout').read_text())
    assert log['errorCount'] == 0 and log['settings'] == 2409 and log['cases'] == 6845
    def copy_actual(path, target):
        data = path.read_bytes()
        (private/target).write_bytes(data)
        return {'path': target, 'sha256': hashlib.sha256(data).hexdigest()}
    checker_ref = copy_actual(root/'docs/review/evidence/config-acceptance/author/check-matrix.py', 'actual-checker.py')
    stdout = copy_actual(base/'root-structural-alias.stdout', 'actual.stdout')
    stderr = copy_actual(base/'root-structural-alias.stderr', 'actual.stderr')
    command = 'python3 docs/review/evidence/config-acceptance/author/check-matrix.py --structural'
    observed = copy.deepcopy(body)
    source_original = copy.deepcopy(original)
    source_original.update(id='C0-OBS-ROOT-STRUCTURAL', phase='C0', result='not-run')
    observed.update(id=source_original['id'], originalCase=source_original)
    catalog[('case', source_original['id'])] = observed
    observed.update(executionPhase='C0-definition', implementationSlice=None, plannedTests=[], result='passed')
    observed['specification']['command'] = command
    observed['specification']['definitionSourceRefs'] = [checker_ref]
    observed['specification']['reason'] = 'identity control for actually executed root structural observation; not global semantic acceptance'
    observed['executedEvidence'] = {'command': command, 'exitCode': 0, 'sourceRefs': [checker_ref], 'testRefs': [checker_ref],
        'stdoutRef': stdout, 'stderrRef': stderr, 'toolIdentities': {'python': sys.version},
        'observedAssertions': ['actual structural report: 2409 settings, 6845 cases, errorCount 0']}
    def check_observed(value):
        validate_case(value, source_original, catalog, pins, original_cases)
    check_observed(observed)
    results.append({'id': 'actual structural observation source/test/stdout/stderr identity metadata verified', 'result': 'passed'})
    broken = copy.deepcopy(observed)
    broken['executedEvidence']['toolIdentities'] = {'python': None}
    rejects('IC10 executed tool version cannot be null', lambda: check_observed(broken), 'C0_TOOL_REVISION_INVALID')
    broken = copy.deepcopy(observed)
    broken['executedEvidence']['testRefs'] = []
    rejects('C0 observation without actual executed-test identity', lambda: check_observed(broken), 'C0_TEST_IDENTITY_MISSING')
    broken = copy.deepcopy(observed)
    broken['executedEvidence']['exitCode'] = True
    rejects('Boolean cannot masquerade as execution exit code', lambda: check_observed(broken), 'C0_EXECUTION_INVALID')
    broken = copy.deepcopy(observed)
    broken['executedEvidence']['observedAssertions'] = []
    rejects('empty C0 observation is not passed evidence', lambda: check_observed(broken), 'C0_OBSERVATION_EMPTY')
    broken = copy.deepcopy(observed)
    broken.update(executionPhase='implementation', implementationSlice='C3', result='not-run', executedEvidence=None)
    rejects('original C0 observation cannot be hidden as future not-run work',
            lambda: check_observed(broken), 'ORIGINAL_DEFINITION_PHASE_LOST')
    wrong_slice_original = copy.deepcopy(original)
    wrong_slice_original['phase'] = 'C3'
    wrong_slice = copy.deepcopy(body)
    wrong_slice.update(originalCase=wrong_slice_original, implementationSlice='C4')
    rejects('known original C3 obligation cannot shift to C4',
            lambda: validate_case(wrong_slice, wrong_slice_original, catalog, pins, original_cases),
            'ORIGINAL_IMPLEMENTATION_SLICE_CHANGED')
    pins.assert_no_drift()
print(json.dumps({'controls': results, 'passed': len(results), 'failed': 0, 'globalC0Accepted': False,
                 'qualification': 'case contract candidate only; metadata identity is not semantic proof; not integrated into strict acceptance'}, indent=2))
