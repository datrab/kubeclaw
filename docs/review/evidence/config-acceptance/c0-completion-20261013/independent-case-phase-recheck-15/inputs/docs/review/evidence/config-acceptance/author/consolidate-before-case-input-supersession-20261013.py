"""Consolidate author fragments without promoting discovery into acceptance.

This is a documentation/evidence tool, not a production configuration loader.
Run from repo root after author fragments are stable. The strict checker is a
separate step; writing a matrix is not executing its implementation cases.
"""
import hashlib
import json
import pathlib
import subprocess
from observation_references import ObservationReferences

root = pathlib.Path.cwd()
base = root / 'docs/review/evidence/config-acceptance'
remediation = root / 'docs/review/remediation'
def digest(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()
def load(p):
    return json.loads(p.read_text())

definitions = {
    'A1': 'Original complete expected scope, no author scope reduction',
    'A2': 'Exact source/test/tool/config/dirty stand and post-change invalidation',
    'A3': 'Real positive and intended-boundary negative effect',
    'A4': 'No mocks/lexical evidence substituting for productive behavior',
    'A5': 'No skipped/timeout/unknown/empty results promoted to passed',
    'A6': 'Contract-grounded bounds; no increased limits or weakened obligations',
    'A7': 'Fresh independent non-author reviewer and decisive independent proof',
    'A8': 'Implementation/local/live/documentation acceptance separate',
    'D17': 'Single component authors; no configurable production defaults',
    'D18': 'Future Kubernetes execution deferred until after test standard',
    'D19': 'CONFIG then approved tests then workers then historical findings',
    'D20': 'Module-start tuning, stable run policy, fixed Eval generation',
    'D21': 'pipeline.config.json system entry, pipeline.json workflow graph',
    'D22': 'Independent review, full cases, structural code quality',
    'F1': 'Every production setting classified with current and target consumers',
    'F2': 'Historical singleton replaced by F2a, no duplicate authority',
    'F2a': 'One authoritative component file per setting and shared owner',
    'F3': 'Reject invalid fields/units/authorities/budget incompatibility',
    'F3a': 'Explicit required values; no schema/code/ENV/CLI/Chart fallback',
    'F4': 'Actual productive behavior and declarative rendering for all settings',
    'F4a': 'Full profiles and real changed/missing/competing/fallback cases',
    'F5': 'Drift, alternate profiles, explain origin without secret bytes',
    'F5a': 'Consumer-effective single owner and hidden test default prevention',
    'F6': 'Measured tasks/resources/parallelism and honest migration/docs',
    'F-DOC': 'Current user/developer/operator instructions, runnable checked links',
    'F-DOCa': 'Component file/units/errors/activation/secrets/version/migration docs',
    'C0-A': 'Independently enumerated sources and semantic candidate dispositions',
    'C0-B': 'Every current default/priority/reader and exactly one target author',
    'C0-C': 'Field-level activation/validation/classification/migration/case',
    'C0-D': 'Actual module units and durable pre-dispatch recovery/Eval contract',
    'C0-E': 'Fresh complete review, corrections and exact bounded C1 proposal',
    'F-AUTH': 'Single author; missing/old equal-valued inputs rejected',
    'F-VAL': 'Same-boundary positive/negative structural and semantic validation',
    'F-EFFECT': 'Two full materially different profiles at each real consumer',
    'F-DELIVERY': 'Real author/materializer/CI/buildcontext/package/image closure',
    'F-BIND': 'Atomic publish, crash/retry/parallel/module/Eval stability',
    'F-MUT': 'Isolated semantic mutants killed at intended real boundary',
    'F-CODE': 'Coherent owner/dependency map, loaders/business/bindings separated',
    'IC0-001': 'Independent finding: omitted productive literal/template policies',
    'IC0-002': 'Independent finding: shared lease protocol authority and aliases',
    'IC0-003': 'Independent finding: actual run-lived adapter activation',
    'IC0-004': 'Independent finding: exact complete field-case specification',
    'IC0-005': 'Independent finding: final identity/integrity freeze and recheck',
    'IC0-006': 'Independent finding: actual suite and execution prerequisites',
    'ICD-001': 'Independent Core finding: const-only operator fields do not close requested tunability',
    'ICD-002': 'Independent Core finding: active/historical case semantics and exact executable proposals',
    'ICD-003': 'Independent Core finding: 55 productive-path registration/health/progress/log and 20 public-contract-only trust/cancellation coordinates',
    'ICD-004': 'Independent Core finding: all six actual retention caller and phase/projection links'
}
identity = {
    'sourceCommit': subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),
    'sourceTree': subprocess.check_output(['git','rev-parse','HEAD^{tree}'],text=True).strip(),
    'method': 'fragment consolidation; no semantic approval inferred'
}
rows, gaps, sources, inputs, cases = [], [], {}, [], {}
fragments = [('components','semantic-fragment.json'),('components','residual-fragment.json'),('runtime','inventory-fragment.json'),('delivery','inventory-fragment.json'),('author','main-fragment.json')]
for group, name in fragments:
    p = base/group/name
    if not p.exists():
        gaps.append({'id':f'GAP-FRAGMENT-{group}', 'reason':'fragment not yet available'})
        continue
    fragment = load(p)
    inputs.append({'path':str(p.relative_to(root)), 'sha256':digest(p)})
    for item in fragment.get('sources',[]):
        if isinstance(item, dict) and 'path' in item:
            sources[item['path']] = item
    for gap in fragment.get('gaps',[]):
        gaps.append({'fragment':group,'detail':gap})
    for raw in fragment.get('rows',[]):
        row = dict(raw)
        row['fragment'] = group
        row['class'] = raw.get('class',raw.get('classification'))
        row['requirementIds'] = raw.get('requirementIds',raw.get('requirements',[]))
        row['caseIds'] = raw.get('caseIds',raw.get('cases',[]))
        row['verifiedSourceEvidence'] = raw.get('verifiedSourceEvidence',raw.get('evidence',[]))
        row['semanticStatus'] = raw.get('semanticStatus',raw.get('status','unresolved'))
        # A claimed source trace remains an author claim until independently reviewed.
        row['reviewerConfirmation'] = None
        rows.append(row)
        for case_id in row['caseIds']:
            if case_id not in cases:
                cases[case_id] = {'id':case_id,'settingIds':[], 'requirementIds':[],
                    'scope':'local','phase':'C0' if '-C0-' in case_id else 'implementation-proposal',
                    'productiveCaller':None,'inputProfile':None,'priorState':None,
                    'expectedEffectOrRejectingBoundary':None,'observerMethod':None,
                    'command':None,'sourceIdentity':identity,'testDigests':[],
                    'toolDependencyImageConfigIdentities':None,'rawEvidencePath':None,
                    'result':'not-run','reason':'exact executable specification pending author closure',
                    'reviewerConfirmation':None,'specificationStatus':'incomplete'}
            case = cases[case_id]
            case['settingIds'].append(row['id'])
            case['requirementIds'] = sorted(set(case['requirementIds']+row['requirementIds']))
    for case in fragment.get('cases',[]):
        existing = cases.get(case['id'],{})
        merged = {**existing,**case}
        # Preserve fragment vocabulary but normalize the mandatory root contract.
        # Author "pending" is not an independent reviewer confirmation.
        aliases = {'inputProfile':'inputConfigProfile','command':'actualTestCommand',
                   'result':'actualResult','sourceIdentity':'identities',
                   'toolDependencyImageConfigIdentities':'identities'}
        for target, original in aliases.items():
            if target not in case and original in case:
                merged[target] = case[original]
        if case.get('sourceDigests') and not case.get('sourceIdentity'):
            merged['sourceIdentity'] = {**identity, 'sources':[
                {'path':name,'sha256':sha} for name,sha in case['sourceDigests'].items()]}
        merged['phase'] = case.get('phase','C0' if '-C0-' in case['id'] else 'implementation-proposal')
        merged['reviewerConfirmation'] = None
        cases[case['id']] = merged
    # Refined witnesses supersede generic EFFECT wording without overwriting the
    # historical fragment. Their missing real harness/domain stays explicit.
    for refinement in fragment.get('caseRefinements',[]):
        cid = refinement.get('replacementForCaseId')
        if cid not in cases:
            gaps.append({'fragment':group,'detail':{'id':'GAP-CASE-REFINEMENT', 'caseId':cid}})
            continue
        case = cases[cid]
        # One canonical current specification. Keep the former generic fields
        # historical rather than leaving a conflicting oracle active beside the
        # refined observer. Original requirements and caller chains are retained.
        case['historicalCanonicalSpecification'] = dict(case)
        case['sourceBoundaryRefinement'] = refinement
        case['inputProfile'] = refinement.get('completeProfiles')
        case['inputConfigProfile'] = case['inputProfile']
        case['priorState'] = refinement.get('priorState',case.get('priorState'))
        observer = refinement.get('observer',{})
        case['observerMethod'] = observer
        case['action'] = observer.get('action')
        case['expectedEffectOrRejectingBoundary'] = observer.get('boundary')
        case['exactProductiveBoundary'] = refinement.get('exactProductiveBoundary')
        case['lifecycle'] = refinement.get('lifecycle')
        case['proposedInvocation'] = refinement.get('proposedInvocation')
        case['command'] = refinement.get('proposedTestCommand')
        # These generic aliases are archived above, not competing current inputs
        # or claims that the future command has already executed.
        case.pop('actualTestCommand',None)
        case.pop('proposedTest',None)
        case['specificationStatus'] = 'canonical-refined-proposed-specification-review-open'

review_report = remediation/'independent-config-c0-core-final-recheck-40cf24e7.md'
review_sha = '7ee9787b76d948892fdd088b5aa1e3099075c7cad9ff375b7bbae4a7bf67de3b'
bounded_review = {
    'report':str(review_report.relative_to(root)), 'sha256':review_sha,
    'scope':'ICD-001–004 definition corrections and RCORE-001/002 canonical-case/gap integrity; NOT global C0 or runtime acceptance',
    'status':'independently-verified-corrected', 'globalC0Accepted':False,
    'rowOrRuntimeAcceptanceInferred':False,
}
if not review_report.is_file() or digest(review_report) != review_sha:
    raise ValueError('Bounded review report identity drift; do not infer corrective acceptance')
# The raw component fragment keeps its historical review-pending receipt.
# Only the exact reviewed corrective gap is resolved in the current projection;
# every unrelated semantic/candidate/implementation gap remains open.
resolved_correction_gaps = []
remaining_gaps = []
for gap in gaps:
    if gap.get('detail',{}).get('id') == 'CMP-ICD-MATERIAL-RECHECK':
        resolved_correction_gaps.append({'previous':gap,'reviewDisposition':bounded_review})
    else:
        remaining_gaps.append(gap)
gaps = remaining_gaps
resolved_correction_gaps.append({
    'previousGapId':'GAP-INDEPENDENT-CORE-RECHECK',
    'findingIds':['ICD-001','ICD-002','ICD-003','ICD-004','RCORE-001','RCORE-002'],
    'reviewDisposition':bounded_review})
# Source/question packages are explicit supplemental definitions, not silently
# dropped because their vocabulary differs from legacy row fragments. Keep
# their exact native specifications; do not manufacture a runtime result or
# flatten a multi-caller question into an unjustified single setting row.
supplemental_packages = []
core_receipt_path = base/'components/icq-corrections-20261013/stable-material-correction-receipt.json'
if core_receipt_path.exists():
    core_receipt = load(core_receipt_path)
    for name, expected in core_receipt['freeze'].items():
        if digest(root/name) != expected:
            raise ValueError(f'CORE_SUPPLEMENTAL_INPUT_DRIFT:{name}')
    active_receipt_path = core_receipt_path
    active_files = dict(core_receipt['activeFiles'])
    input_identities = dict(core_receipt['freeze'])
    supersession_history = []
    boundary_receipt_path = base/'components/icq-r06-boundaries-20261013/stable-material-correction-receipt.json'
    if boundary_receipt_path.exists():
        boundary_receipt = load(boundary_receipt_path)
        preserved = load(boundary_receipt_path.parent/'preserved-input-identities.json')['inputs']
        for identities in [preserved, boundary_receipt['freeze']]:
            for name, expected in identities.items():
                if digest(root/name) != expected:
                    raise ValueError(f'CORE_BOUNDARY_SUPERSESSION_INPUT_DRIFT:{name}')
                if name in input_identities and input_identities[name] != expected:
                    raise ValueError(f'CORE_BOUNDARY_SUPERSESSION_IDENTITY_CONFLICT:{name}')
                input_identities[name] = expected
        input_identities[str(core_receipt_path.relative_to(root))] = digest(core_receipt_path)
        supersession_history.append({
            'receipt':str(core_receipt_path.relative_to(root)),
            'receiptSha256':digest(core_receipt_path),
            'activeFilesAtThatCheckpoint':core_receipt['activeFiles'],
            'disposition':'Historical ICQ01–05 material definitions retained; ICQ06 byte/boundary specifications superseded, not overwritten.',
            'independentFindingIds':['ICQ-R06-01','ICQ-R06-02']})
        active_receipt_path = boundary_receipt_path
        active_files['cases'] = boundary_receipt['caseEntry']
        active_files['boundaryDefinitions'] = boundary_receipt['definitionEntry']
        active_files['boundaryCaseInputs'] = str((boundary_receipt_path.parent/'case-input-contracts.json').relative_to(root))
    supplemental_packages.append({
        'id':'CORE-ICQ-DEFINITION-CORRECTIONS-20261013',
        'receipt':str(active_receipt_path.relative_to(root)),
        'receiptSha256':digest(active_receipt_path),
        'inputIdentities':input_identities,
        'activeFiles':active_files,
        'supersessionHistory':supersession_history,
        'questions':load(root/core_receipt['activeFiles']['definitions'])['questions'],
        'caseSpecifications':load(root/active_files['cases'])['activeCases'],
        'independentReview':'pending exact corrected material recheck; no author acceptance',
        'reviewerConfirmation':None,
        'limits':'Supplemental native definitions are not root field/consumer closure; real per-field links and whole C0 review remain required.'})
inventory = {'schemaVersion':1,'status':'in-progress-not-C0-accepted','identity':identity,
             'inputFragments':inputs,'rows':rows,'sources':list(sources.values()),'gaps':gaps,
             'boundedReviewDispositions':[bounded_review],
             'resolvedCorrectionGaps':resolved_correction_gaps,
             'supplementalDefinitionPackages':supplemental_packages,
             'candidateLedger':'docs/review/evidence/config-acceptance/author/candidate-ledger.json',
             'coordinateCandidateLedgers':['docs/review/evidence/config-acceptance/author/infra-coordinate-extension-20261013.json'],
             'sourceBoundary':'docs/review/evidence/config-acceptance/author/source-boundary.json'}
matrix = {'schemaVersion':1,'status':'in-progress-not-approval-ready','identity':identity,
          'requirements':[{'id':k,'description':v,'source':'docs/review/remediation/independent-config-c0-core-domain-a07de567.md' if k.startswith('ICD-') else 'docs/review/remediation/independent-config-c0-9452d355.md' if k.startswith('IC0-') else 'docs/review/remediation/OPENCLAW-CONFIG-GOAL.md' if k.startswith(('C0-','F-')) else 'docs/review/remediation/acceptance-20260920.md' if k.startswith(('A','F')) else 'docs/review/remediation/decisions.md'} for k,v in definitions.items()],
          'cases':list(cases.values()),'acceptance':{k:'not-run' for k in ['C0-A','C0-B','C0-C','C0-D','C0-E']},
          'implementationAuthorization':None,
          'historicalEvidence':'docs/review/evidence/cloud-config-assessment-20261012/verification.json',
          'limits':['Generated case placeholders do not satisfy exact per-consumer specifications.',
                    'No source-traced author row is independent acceptance.',
                    'Implementation runtime cases remain not-run before approval.']}
references = ObservationReferences(root)
# Validate immutable nested observations but keep references in the published
# matrix. Expanding repeated data would undo the reversible normalization.
references.resolve(matrix['cases'])
matrix['immutableObservationReferences'] = references.summary()
for p, data in [(remediation/'config-semantic-inventory.json',inventory),(remediation/'config-acceptance-matrix.json',matrix)]:
    p.write_text(json.dumps(data,indent=2)+'\n')
print(json.dumps({'rows':len(rows),'caseIds':len(cases),'gaps':len(gaps),'accepted':False}))
