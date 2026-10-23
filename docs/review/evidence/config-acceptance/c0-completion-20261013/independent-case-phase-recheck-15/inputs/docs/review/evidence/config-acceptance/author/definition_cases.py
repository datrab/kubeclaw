"""Finalized C0 case-body contract candidate; not yet wired to acceptance.

This separates immutable historical outcomes, future executable specifications,
and actually executed C0 observations. It checks evidence identity, not the
truth of an oracle or independent review. No runtime result is invented.
"""
from definition_baseline import strict_json
from review_receipts import canonical_sha


def fail(code):
    raise ValueError('DEFINITION_CASE_' + code)


def exact(value, fields, code):
    if not isinstance(value, dict) or set(value) != set(fields):
        fail(code)


def nonempty(value, code):
    if not isinstance(value, str) or not value.strip():
        fail(code)


def file_ref(ref, pins):
    exact(ref, {'path', 'sha256'}, 'FILE_REF_INVALID')
    return pins._pinned(ref['path'], ref['sha256'])


def file_refs(refs, pins, code):
    if not isinstance(refs, list) or not refs:
        fail(code)
    paths = []
    for ref in refs:
        file_ref(ref, pins)
        paths.append(ref['path'])
    if len(paths) != len(set(paths)):
        fail(code)


def validate_case(body, original, catalog, pins, original_cases=None):
    exact(body, {'schemaVersion', 'id', 'originalCase', 'requirementIds', 'settingIds',
                 'applicability', 'replacementCaseIds', 'executionPhase', 'implementationSlice',
                 'scope', 'scopeDerivation', 'specification', 'result', 'plannedTests', 'executedEvidence'}, 'BODY_INVALID')
    if (body['schemaVersion'] != 'config-finalized-case.v1'
            or not isinstance(body['id'], str) or not body['id'].strip()
            or original is not None and body['id'] != original['id']):
        fail('IDENTITY_INVALID')
    if canonical_sha(body['originalCase']) != canonical_sha(original):
        fail('HISTORY_CHANGED')
    history = original if original is not None else {}
    original_phase = history.get('phase')
    if original_phase in {'C0', 'current-source-definition'}:
        if body['executionPhase'] != 'C0-definition':
            fail('ORIGINAL_DEFINITION_PHASE_LOST')
    elif original_phase in {'implementation-proposal', 'proposed-after-approval', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6'}:
        if body['executionPhase'] != 'implementation':
            fail('ORIGINAL_RUNTIME_CASE_RECLASSIFIED')
        if original_phase in {'C1', 'C2', 'C3', 'C4', 'C5', 'C6'} and body['implementationSlice'] != original_phase:
            fail('ORIGINAL_IMPLEMENTATION_SLICE_CHANGED')
    elif original is not None:
        fail('ORIGINAL_PHASE_UNKNOWN')
    # Historical scope prose is not the finalized local/live discriminator.
    # Preserve it in originalCase and require an explicit evidenced derivation;
    # already typed original scopes cannot silently change.
    if history.get('scope') in {'local', 'live'} and body['scope'] != history['scope']:
        fail('ORIGINAL_SCOPE_CHANGED')
    derivation = body['scopeDerivation']
    exact(derivation, {'originalValue', 'reason', 'evidenceRefs'}, 'SCOPE_DERIVATION_INVALID')
    if canonical_sha(derivation['originalValue']) != canonical_sha(history.get('scope')):
        fail('SCOPE_HISTORY_CHANGED')
    nonempty(derivation['reason'], 'SCOPE_REASON_MISSING')
    file_refs(derivation['evidenceRefs'], pins, 'SCOPE_EVIDENCE_MISSING')
    for field, kind in [('requirementIds', 'requirement'), ('settingIds', 'setting')]:
        values = body[field]
        if (not isinstance(values, list) or any(not isinstance(v, str) for v in values)
                or len(set(values)) != len(values)
                or any((kind, v) not in catalog for v in values)
                or not set(history.get(field, [])).issubset(values)):
            fail('ORIGINAL_OR_DANGLING_' + field.upper())
    if not body['requirementIds'] or body['scope'] not in {'local', 'live'}:
        fail('SCOPE_OR_REQUIREMENTS_INVALID')
    replacements = body['replacementCaseIds']
    if (not isinstance(replacements, list) or len(set(replacements)) != len(replacements)
            or any(not isinstance(v, str) or ('case', v) not in catalog or v == body['id'] for v in replacements)):
        fail('REPLACEMENT_INVALID')
    if body['applicability'] == 'invariant-substitution':
        if not replacements:
            fail('INVARIANT_OBLIGATIONS_MISSING')
        for identifier in replacements:
            replacement = catalog[('case', identifier)]
            if not set(body['requirementIds']).issubset(replacement.get('requirementIds', [])):
                fail('INVARIANT_REQUIREMENTS_LOST')
            if (original_cases is None or identifier not in original_cases
                    or replacement.get('applicability') != 'applicable'):
                fail('INVARIANT_REPLACEMENT_CONTEXT_MISSING')
            validate_case(replacement, original_cases[identifier], catalog, pins, original_cases)
    elif body['applicability'] != 'applicable' or replacements:
        fail('APPLICABILITY_INVALID')
    spec = body['specification']
    exact(spec, {'productiveCaller', 'inputProfile', 'priorState', 'expectedEffectOrRejectingBoundary',
                 'observerMethod', 'command', 'identities', 'reason', 'definitionSourceRefs'}, 'SPECIFICATION_INVALID')
    for field in ('productiveCaller', 'priorState', 'expectedEffectOrRejectingBoundary', 'observerMethod', 'command', 'reason'):
        nonempty(spec[field], 'SPECIFICATION_' + field.upper())
    if not isinstance(spec['inputProfile'], dict) or not spec['inputProfile']:
        fail('INPUT_PROFILE_INVALID')
    # Concrete profile identities may be pinned files or a complete inline
    # fixture descriptor; proving schema/effect agreement is the setting gate.
    exact(spec['identities'], {'software', 'tools', 'dependencies', 'images', 'config'}, 'IDENTITIES_INVALID')
    for field, values in spec['identities'].items():
        if not isinstance(values, list) or not values:
            fail('IDENTITIES_' + field.upper())
        for value in values:
            exact(value, {'id', 'revision'}, 'IDENTITIES_' + field.upper())
            nonempty(value['id'], 'IDENTITY_ID_INVALID')
            nonempty(value['revision'], 'IDENTITY_REVISION_INVALID')
        if len({value['id'] for value in values}) != len(values):
            fail('IDENTITY_DUPLICATE')
    file_refs(spec['definitionSourceRefs'], pins, 'DEFINITION_SOURCE_MISSING')
    if body['executionPhase'] == 'implementation':
        if body['implementationSlice'] not in {'C1', 'C2', 'C3', 'C4', 'C5', 'C6'}:
            fail('IMPLEMENTATION_SLICE_INVALID')
        if body['result'] != 'not-run' or body['executedEvidence'] is not None:
            fail('UNAPPROVED_RUNTIME_RESULT')
        planned = body['plannedTests']
        if not isinstance(planned, list) or not planned:
            fail('PLANNED_TEST_MISSING')
        ids = []
        for test in planned:
            exact(test, {'id', 'targetTestPath', 'command', 'specificationRef', 'assertionIds',
                         'mutationIds', 'restorationAssertionIds'}, 'PLANNED_TEST_INVALID')
            for field in ('id', 'targetTestPath', 'command'):
                nonempty(test[field], 'PLANNED_TEST_' + field.upper())
            if (test['targetTestPath'].startswith('/') or '..' in test['targetTestPath'].split('/')):
                fail('PLANNED_TEST_PATH_INVALID')
            ids.append(test['id'])
            proposed = strict_json(file_ref(test['specificationRef'], pins))
            # Full proposed test source lives in the proposal, not in a fake
            # executable-test digest for a file which does not exist yet.
            exact(proposed, {'id', 'targetTestPath', 'command', 'proposedSource', 'assertions',
                             'mutations', 'restorationAssertions'}, 'PROPOSED_SOURCE_INVALID')
            nonempty(proposed['proposedSource'], 'PROPOSED_SOURCE_EMPTY')
            if any(proposed[field] != test[field] for field in ('id', 'targetTestPath', 'command')):
                fail('PLANNED_TEST_SOURCE_MISMATCH')
            for field, proposed_field in [('assertionIds', 'assertions'), ('mutationIds', 'mutations'),
                                          ('restorationAssertionIds', 'restorationAssertions')]:
                values = test[field]
                descriptions = proposed[proposed_field]
                if (not isinstance(values, list) or not values or any(not isinstance(v, str) for v in values)
                        or len(set(values)) != len(values) or not isinstance(descriptions, dict)
                        or set(values) != set(descriptions)):
                    fail('PLANNED_OBLIGATIONS_INVALID')
                for description in descriptions.values():
                    nonempty(description, 'PLANNED_OBLIGATION_EMPTY')
        if len(set(ids)) != len(ids):
            fail('PLANNED_TEST_DUPLICATE')
    elif body['executionPhase'] == 'C0-definition':
        if (body['implementationSlice'] is not None or body['plannedTests'] != []
                or body['result'] != 'passed'):
            fail('C0_PHASE_RESULT_INVALID')
        executed = body['executedEvidence']
        exact(executed, {'command', 'exitCode', 'sourceRefs', 'testRefs', 'stdoutRef', 'stderrRef',
                         'toolIdentities', 'observedAssertions'}, 'C0_EXECUTED_EVIDENCE_MISSING')
        if (executed['command'] != spec['command'] or type(executed['exitCode']) is not int
                or executed['exitCode'] != 0):
            fail('C0_EXECUTION_INVALID')
        file_refs(executed['sourceRefs'], pins, 'C0_SOURCE_IDENTITY_MISSING')
        file_refs(executed['testRefs'], pins, 'C0_TEST_IDENTITY_MISSING')
        file_ref(executed['stdoutRef'], pins)
        file_ref(executed['stderrRef'], pins)
        if (not isinstance(executed['toolIdentities'], dict) or not executed['toolIdentities']
                or not isinstance(executed['observedAssertions'], list) or not executed['observedAssertions']
                or any(not isinstance(v, str) or not v.strip() for v in executed['observedAssertions'])):
            fail('C0_OBSERVATION_EMPTY')
        for tool, revision in executed['toolIdentities'].items():
            nonempty(tool, 'C0_TOOL_NAME_INVALID')
            nonempty(revision, 'C0_TOOL_REVISION_INVALID')
    else:
        fail('EXECUTION_PHASE_INVALID')
