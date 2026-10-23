"""Reject incomplete CONFIG acceptance; --structural checks draft integrity only.

No result from this tool can by itself establish semantic consumer acceptance.
The full gate intentionally fails while unresolved candidate/case/review exists.
"""
import hashlib
import json
import pathlib
import sys
import argparse
from observation_references import ObservationReferences
from historical_mapping import load_reviewed as load_historical_mappings
from historical_projection import verify as verify_historical_projection

root = pathlib.Path.cwd()
remediation = root/'docs/review/remediation'
parser = argparse.ArgumentParser()
parser.add_argument('--structural',action='store_true')
parser.add_argument('--inventory',type=pathlib.Path,default=remediation/'config-semantic-inventory.json')
parser.add_argument('--matrix',type=pathlib.Path,default=remediation/'config-acceptance-matrix.json')
args = parser.parse_args()
inventory = json.loads(args.inventory.read_text())
matrix = json.loads(args.matrix.read_text())
structural = args.structural
errors = []
def reject(message):
    errors.append(message)
def ids(items, label):
    result = set()
    for item in items:
        value = item.get('id')
        if not isinstance(value,str) or not value:
            reject(f'{label}: missing stable ID')
        elif value in result:
            reject(f'{label}: duplicate ID {value}')
        result.add(value)
    return result
def identity(path, expected, label):
    p=root/path
    if not p.is_file():
        reject(f'{label}: absent input {path}')
    elif hashlib.sha256(p.read_bytes()).hexdigest()!=expected:
        reject(f'{label}: content drift {path}')

row_ids=ids(inventory['rows'],'setting')
case_ids=ids(matrix['cases'],'case')
requirement_ids=ids(matrix['requirements'],'requirement')
references = ObservationReferences(root)
try:
    references.resolve(matrix['cases'])
except (ValueError,KeyError,TypeError,OSError,json.JSONDecodeError) as error:
    reject(f'observation references: {error}')
for entry in inventory.get('inputFragments',[]):
    identity(entry['path'],entry['sha256'],'fragment')
canonical_question_fragment='docs/review/evidence/config-acceptance/components/checkpoint6606-canonical-questions/canonical-question-fragment.json'
if (root/canonical_question_fragment).is_file():
    expected_fragment=json.loads((root/canonical_question_fragment).read_text())
    if not any(entry['path'] == canonical_question_fragment for entry in inventory.get('inputFragments',[])):
        reject('Core canonical question fragment registration missing')
    if not {row['id'] for row in expected_fragment['rows']}.issubset(row_ids) or not {case['id'] for case in expected_fragment['cases']}.issubset(case_ids):
        reject('Core canonical question field/case projection omitted')
    projected_rows={row['id']:row for row in inventory['rows']}
    projected_cases={case['id']:case for case in matrix['cases']}
    for original in expected_fragment['rows']:
        expected={**original,'fragment':'components',
            'class':original.get('class',original.get('classification')),
            'requirementIds':original.get('requirementIds',original.get('requirements',[])),
            'caseIds':original.get('caseIds',original.get('cases',[])),
            'verifiedSourceEvidence':original.get('verifiedSourceEvidence',original.get('evidence',[])),
            'semanticStatus':original.get('semanticStatus',original.get('status','unresolved')),
            'reviewerConfirmation':None}
        if projected_rows.get(original['id']) != expected:
            reject(f"Core canonical row {original['id']}: normalized source body/requirement conservation drift")
    for original in expected_fragment['cases']:
        projected=projected_cases.get(original['id'],{})
        for key,value in original.items():
            if key not in projected or projected[key] != value:
                reject(f"Core canonical case {original['id']}: source property/requirement conservation drift: {key}")
        for target,source in {'inputProfile':'inputConfigProfile','command':'actualTestCommand',
                              'result':'actualResult','sourceIdentity':'identities',
                              'toolDependencyImageConfigIdentities':'identities'}.items():
            if target not in original and source in original and projected.get(target) != original[source]:
                reject(f"Core canonical case {original['id']}: normalized alias conservation drift: {target}")
        expected_phase=original.get('phase','C0' if '-C0-' in original['id'] else 'implementation-proposal')
        if projected.get('phase') != expected_phase or projected.get('reviewerConfirmation') is not None:
            reject(f"Core canonical case {original['id']}: phase/review promotion drift")
    if not any(package['id'] == 'CORE-ICQ-DEFINITION-CORRECTIONS-20261013' for package in inventory.get('supplementalDefinitionPackages',[])):
        reject('Core canonical question supplemental package omitted')
for package in inventory.get('supplementalDefinitionPackages',[]):
    identity(package['receipt'],package['receiptSha256'],'supplemental receipt')
    for path, expected in package['inputIdentities'].items():
        identity(path,expected,'supplemental definition input')
    questions=ids(package['questions'],'supplemental question')
    link_source=package.get('canonicalFieldCaseLinkSource')
    if package['id'] == 'CORE-ICQ-DEFINITION-CORRECTIONS-20261013' and (root/canonical_question_fragment).is_file():
        if not link_source or link_source.get('path') != 'docs/review/evidence/config-acceptance/components/checkpoint6606-canonical-questions/question-canonical-field-case-links.json':
            reject('Core canonical question required link source omitted/wrong')
    if link_source:
        identity(link_source['path'],link_source['sha256'],'Core canonical question links')
        original_links=json.loads((root/link_source['path']).read_text())['canonicalFieldCaseLinks']
        if package.get('canonicalFieldCaseLinks') != original_links or set(original_links) != questions:
            reject('Core canonical question link/alias conservation drift')
    ids(package['caseSpecifications'],'supplemental case')
    baseline=package.get('caseRequirementBaseline')
    if not baseline:
        reject(f"supplemental {package['id']}: missing case requirement baseline")
    else:
        identity(baseline['path'],baseline['sha256'],'supplemental case baseline')
        actual_baseline=json.loads((root/baseline['path']).read_text())
        expected={case['id']:case['requirements'] for case in actual_baseline['activeCases']}
        if expected != baseline['requirementsByCaseId']:
            reject(f"supplemental {package['id']}: baseline requirement metadata drift")
        active_by_id={case['id']:case for case in package['caseSpecifications']}
        for cid, required in expected.items():
            if cid not in active_by_id or not set(required).issubset(active_by_id[cid].get('requirements',[])):
                reject(f"supplemental {cid}: baseline case/requirement loss")
    for case in package['caseSpecifications']:
        if case.get('questionId') not in questions:
            reject(f"supplemental {case['id']}: missing question definition")
        if case.get('lifecycle',{}).get('status') != 'active-superseding-proposed-not-run':
            reject(f"supplemental {case['id']}: unexpected acceptance/runtime lifecycle")
    if not structural:
        if not package.get('reviewerConfirmation'):
            reject(f"supplemental {package['id']}: independent complete field/consumer/case closure required")
        # A native question/specification is not a substitute for canonical
        # field/case coverage. Require explicit independently checked links;
        # neither a package count nor a bounded correction review supplies them.
        for question in package['questions']:
            links=package.get('canonicalFieldCaseLinks',{}).get(question['id'],{})
            if links.get('unresolvedAliases'):
                reject(f"supplemental {question['id']}: unresolved cross-owner aliases ({len(links['unresolvedAliases'])})")
            if not links.get('settingIds') or not links.get('caseIds'):
                reject(f"supplemental {question['id']}: canonical field/case links incomplete")
            for setting in links.get('settingIds',[]):
                if setting not in row_ids:
                    reject(f"supplemental {question['id']}: dangling canonical field {setting}")
            for case_id in links.get('caseIds',[]):
                if case_id not in case_ids:
                    reject(f"supplemental {question['id']}: dangling canonical case {case_id}")
native_packages=matrix.get('nativeCasePackages',[])
definition_packages=matrix.get('definitionObservationPackages',[])
definition_ids=ids(definition_packages,'pure definition observation package')
delivery_definition_source='docs/review/evidence/config-acceptance/delivery/c0-controller-material-correction-cases-6606-20261013.json'
if (root/delivery_definition_source).is_file() and 'DELIVERY-CONTROLLER-MATERIAL-PURE-OBSERVATIONS-6606' not in definition_ids:
    reject('required Delivery pure definition observation package missing')
for package in definition_packages:
    if package['id'] == 'DELIVERY-CONTROLLER-MATERIAL-PURE-OBSERVATIONS-6606' and package.get('sourcePath') != delivery_definition_source:
        reject('Delivery pure definition observation source wrong')
    identity(package['sourcePath'],package['sourceSha256'],'pure definition observation source')
    original=json.loads((root/package['sourcePath']).read_text())
    if original != package['observations']:
        reject('pure definition observation body/scope/requirement conservation drift')
    ids(package['observations'],'pure definition observation')
    for observation in package['observations']:
        if not set(observation.get('settingIds',[])).issubset(row_ids) or not set(observation.get('requirementIds',[])).issubset(requirement_ids):
            reject('pure definition observation dangling setting/requirement')
        for key in ['sourceDigests','specDigests','testDigests']:
            for path,expected in observation.get(key,{}).items():
                identity(path,expected,'pure definition '+key)
    if not structural and not package.get('reviewerConfirmation'):
        reject('pure definition observation package: independent bounded material review pending; no native/whole C0 acceptance')
native_advertisements=inventory.get('nativeCasePackageReferences',[])
if ids(native_packages,'native package') != ids(native_advertisements,'native package advertisement'):
    reject('native package presence differs between inventory and matrix')
advertisements={item['id']:item for item in native_advertisements}
native_by_id={item['id']:item for item in native_packages}
runtime_native_source='docs/review/evidence/config-acceptance/runtime/case-proposals.json'
if (root/runtime_native_source).is_file():
    required_runtime=native_by_id.get('RUNTIME-NATIVE-CASE-SPECIFICATIONS')
    if required_runtime is None or required_runtime.get('sourcePath') != runtime_native_source:
        reject('required productive Runtime native specification package missing/wrong source')
for package in native_packages:
    advertised=advertisements.get(package['id'])
    if advertised is not None:
        if advertised.get('matrixLocation') != 'nativeCasePackages':
            reject(f"native {package['id']}: advertised matrix location drift")
        for key in ['sourcePath','sourceSha256']:
            if advertised.get(key) != package.get(key):
                reject(f"native {package['id']}: advertised {key} drift")
        if advertised.get('nativeCaseCount') != len(package['caseSpecifications']) or advertised.get('unlinkedNativeCaseCount') != sum(link.get('canonicalCaseId') is None for link in package['canonicalCaseMapping']):
            reject(f"native {package['id']}: advertised case counts drift")
    identity(package['sourcePath'],package['sourceSha256'],'native case source')
    original=json.loads((root/package['sourcePath']).read_text())
    if original != package['caseSpecifications']:
        reject(f"native {package['id']}: original specification/requirement loss")
    native_ids=ids(package['caseSpecifications'],'native case')
    try:
        references.resolve(package['caseSpecifications'])
    except (ValueError,KeyError,TypeError,OSError,json.JSONDecodeError) as error:
        reject(f'native observation references: {error}')
    links=package['canonicalCaseMapping']
    if {item['nativeCaseId'] for item in links} != native_ids or len(links) != len(native_ids):
        reject(f"native {package['id']}: missing/duplicate native mapping")
    originals={case['id']:case for case in original}
    canonicals={case['id']:case for case in matrix['cases']}
    if package['id'] == 'RUNTIME-NATIVE-CASE-SPECIFICATIONS':
        try:
            histories=load_historical_mappings(root, original,
                json.loads((root/'docs/review/evidence/config-acceptance/runtime/inventory-fragment.json').read_text())['rows'],
                json.loads((root/'docs/review/evidence/config-acceptance/runtime/runtime-case-dispositions.json').read_text())['cases'],
                set(canonicals))
            verify_historical_projection(package,matrix['cases'],histories,advertised or {})
        except (ValueError,KeyError,TypeError,OSError,json.JSONDecodeError) as error:
            reject(f'native historical projection: {error}')
    for link in links:
        cid=link['nativeCaseId']
        required=originals[cid].get('requirements',[])
        if link['requirementIds'] != required:
            reject(f'native {cid}: mapping requirement loss')
        canonical=link.get('canonicalCaseId')
        if canonical is not None:
            if canonical not in canonicals or not set(required).issubset(canonicals[canonical].get('requirementIds',[])):
                reject(f'native {cid}: canonical requirement loss/dangling link')
            elif len([ref for ref in canonicals[canonical].get('nativeSpecificationReferences',[]) if ref.get('packageId') == package['id'] and ref.get('nativeCaseId') == cid and ref.get('sourcePath') == package['sourcePath'] and ref.get('sourceSha256') == package['sourceSha256']]) != 1:
                reject(f'native {cid}: missing/duplicate/exact canonical specification reference')
        if not structural:
            if canonical is None and 'historicalMapping' not in link:
                reject(f'native {cid}: canonical field/case mapping unresolved')
            if not link.get('mappingReview'):
                reject(f'native {cid}: no independent mapping/specification review')
    if not structural and not package.get('reviewerConfirmation'):
        reject(f"native {package['id']}: no whole field/consumer/case acceptance")
for canonical in matrix['cases']:
    for ref in canonical.get('nativeSpecificationReferences',[]):
        package=native_by_id.get(ref.get('packageId'))
        if package is None:
            reject(f"case {canonical['id']}: native reference package missing")
        elif ref.get('sourcePath') != package['sourcePath'] or ref.get('sourceSha256') != package['sourceSha256'] or not any(link['nativeCaseId'] == ref.get('nativeCaseId') and link.get('canonicalCaseId') == canonical['id'] for link in package['canonicalCaseMapping']):
            reject(f"case {canonical['id']}: native reference identity/case binding drift")
for ledger_path in inventory.get('coordinateCandidateLedgers',[]):
    ledger=json.loads((root/ledger_path).read_text())
    ids(ledger['coordinateCandidates'],'coordinate candidate')
    for source in ledger['records']:
        identity(source['path'],source['sha256'],'coordinate source')
    for candidate in ledger['coordinateCandidates']:
        identity(candidate['source'],candidate['sourceSha256'],candidate['id'])
        for setting in candidate.get('settingIds',[]):
            if setting not in row_ids:
                reject(f"coordinate {candidate['id']}: dangling setting {setting}")
        if not structural:
            if candidate.get('disposition') not in ['setting','duplicate','non-setting']:
                reject(f"coordinate {candidate['id']}: unresolved field disposition")
            elif candidate.get('disposition') in ['setting','duplicate'] and not candidate.get('settingIds'):
                reject(f"coordinate {candidate['id']}: absent semantic setting link")
            elif candidate.get('disposition')=='non-setting' and not candidate.get('reason'):
                reject(f"coordinate {candidate['id']}: absent non-setting reason")
            if not candidate.get('reviewerConfirmation'):
                reject(f"coordinate {candidate['id']}: no independent semantic review")
for row in inventory['rows']:
    label=row.get('id')
    source=row.get('source',{})
    if not all(source.get(k) is not None for k in ['path','field','sha256']):
        reject(f'{label}: incomplete source field/content identity')
    else:
        identity(source['path'],source['sha256'],label)
    for requirement in row.get('requirementIds',[]):
        if requirement not in requirement_ids: reject(f'{label}: dangling requirement {requirement}')
    for case in row.get('caseIds',[]):
        if case not in case_ids: reject(f'{label}: dangling case {case}')
    for evidence in row.get('verifiedSourceEvidence',[]):
        path=evidence if isinstance(evidence,str) else evidence.get('path')
        if not path or not (root/path).is_file(): reject(f'{label}: absent raw source evidence {path}')
    if not structural:
        if row.get('semanticStatus') not in ['source-traced','resolved','verified']:
            reject(f'{label}: unresolved semantic inventory')
        if not row.get('reviewerConfirmation'): reject(f'{label}: no independent required review')
        if not row.get('caseIds'): reject(f'{label}: no required cases')
for case in matrix['cases']:
    label=case['id']
    for setting in case.get('settingIds',[]):
        if setting not in row_ids: reject(f'{label}: dangling setting {setting}')
    for requirement in case.get('requirementIds',[]):
        if requirement not in requirement_ids: reject(f'{label}: dangling requirement {requirement}')
    if case.get('result') not in ['passed','failed','blocked','not-run']:
        reject(f'{label}: unknown/skip/timeout/empty is not a valid result')
    if case.get('result') in ['passed','failed']:
        raw=case.get('rawEvidencePath')
        if not raw or not (root/raw).is_file(): reject(f'{label}: absent actual-result raw log')
        if not case.get('sourceIdentity') or not case.get('testDigests'):
            reject(f'{label}: actual result lacks exact source AND test identity')
    if not structural:
        for field in ['productiveCaller','inputProfile','priorState','expectedEffectOrRejectingBoundary',
                      'observerMethod','command','sourceIdentity','testDigests',
                      'toolDependencyImageConfigIdentities','reason','reviewerConfirmation']:
            if not case.get(field): reject(f'{label}: incomplete exact case {field}')
        if case.get('phase')=='C0' and case.get('result')!='passed':
            reject(f'{label}: required current C0 check not passed')
        if case.get('phase')!='C0' and case.get('result')!='not-run' and not matrix.get('implementationAuthorization'):
            reject(f'{label}: unapproved runtime case result cannot close current C0')
if not structural:
    if inventory.get('gaps'): reject('inventory: unresolved recorded gaps')
    boundary=json.loads((root/inventory['sourceBoundary']).read_text())
    for source in boundary['boundaries']:
        if not source.get('semanticDisposition') or not source.get('reviewerConfirmation'):
            reject(f"source {source['path']}: no independently checked source disposition")
    for source in boundary['sources']:
        identity(source['path'],source['sha256'],'source boundary')
    ledger=json.loads((root/inventory['candidateLedger']).read_text())
    for candidate in ledger['candidates']:
        disposition=candidate.get('disposition')
        if disposition not in ['setting','duplicate','non-setting']:
            reject(f"candidate {candidate['id']}: unexplained discovery input")
        elif disposition in ['setting','duplicate'] and not candidate.get('settingIds'):
            reject(f"candidate {candidate['id']}: missing semantic row link")
        elif disposition=='non-setting' and not candidate.get('reason'):
            reject(f"candidate {candidate['id']}: no independently checked non-setting reason")
        for setting in candidate.get('settingIds',[]):
            if setting not in row_ids: reject(f"candidate {candidate['id']}: dangling setting {setting}")
    linked={r for c in matrix['cases'] for r in c.get('requirementIds',[])}
    for requirement in sorted(requirement_ids-linked): reject(f'requirement {requirement}: no explicit case coverage')
report={'mode':'draft-structural' if structural else 'strict-C0-completion',
        'scope':'integrity only; independent semantic review remains mandatory',
        'settings':len(row_ids),'cases':len(case_ids),'errorCount':len(errors),'errors':errors}
print(json.dumps(report,indent=2))
sys.exit(1 if errors else 0)
