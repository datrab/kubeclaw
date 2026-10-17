"""Check complete native specification and requirement conservation, not acceptance."""
import hashlib
import json
from pathlib import Path
root = Path.cwd()
source = root/'docs/review/evidence/config-acceptance/runtime/case-proposals.json'
matrix_path = root/'docs/review/remediation/config-acceptance-matrix.json'
matrix = virtual_matrix
inventory = virtual_inventory
native = json.loads(source.read_text())
package = matrix['nativeCasePackages'][0]
advertisements={item['id']:item for item in inventory['nativeCasePackageReferences']}
assert {p['id'] for p in matrix['nativeCasePackages']} == set(advertisements)
advertised=advertisements[package['id']]
assert advertised['sourcePath'] == package['sourcePath'] and advertised['sourceSha256'] == package['sourceSha256']
assert advertised['nativeCaseCount'] == len(package['caseSpecifications'])
assert package['caseSpecifications'] == native
assert package['sourceSha256'] == hashlib.sha256(source.read_bytes()).hexdigest()
by_id = {case['id']:case for case in native}
assert len(by_id) == len(native)
links = package['canonicalCaseMapping']
assert len(links) == len(native) and {link['nativeCaseId'] for link in links} == set(by_id)
canonical = {case['id']:case for case in matrix['cases']}
for link in links:
    original = by_id[link['nativeCaseId']]
    assert link['requirementIds'] == original.get('requirements',[])
    if link['canonicalCaseId'] is not None:
        assert set(link['requirementIds']).issubset(canonical[link['canonicalCaseId']]['requirementIds'])
        refs=canonical[link['canonicalCaseId']].get('nativeSpecificationReferences',[])
        assert len([ref for ref in refs if ref['packageId']==package['id'] and ref['nativeCaseId']==link['nativeCaseId'] and ref['sourcePath']==package['sourcePath'] and ref['sourceSha256']==package['sourceSha256']]) == 1
    assert link['mappingReview'] is None
assert package['reviewerConfirmation'] is None
assert advertised['unlinkedNativeCaseCount'] == sum(link['canonicalCaseId'] is None for link in links)
mapping={(link['nativeCaseId'],link['canonicalCaseId']) for link in links}
for cid, case in canonical.items():
    for ref in case.get('nativeSpecificationReferences',[]):
        assert ref['packageId']==package['id'] and ref['sourcePath']==package['sourcePath'] and ref['sourceSha256']==package['sourceSha256']
        assert (ref['nativeCaseId'],cid) in mapping
assert matrix['immutableObservationReferences']['referenceOccurrencesValidated'] == package['observationReferenceIntegrity']['referenceOccurrencesValidated']
print(json.dumps({'scope':'exact native ID/requirements/specification projection only',
    'scriptSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
    'matrixSha256':hashlib.sha256(matrix_path.read_bytes()).hexdigest(),
    'nativeSha256':package['sourceSha256'],'nativeCasesPreserved':len(native),
    'canonicalLinks':sum(link['canonicalCaseId'] is not None for link in links),
    'unlinkedNativeObligations':sum(link['canonicalCaseId'] is None for link in links),
    'observationReferencesValidated':matrix['immutableObservationReferences']['referenceOccurrencesValidated'],
    'independentCanonicalAcceptance':False,'globalC0Accepted':False},indent=2))
