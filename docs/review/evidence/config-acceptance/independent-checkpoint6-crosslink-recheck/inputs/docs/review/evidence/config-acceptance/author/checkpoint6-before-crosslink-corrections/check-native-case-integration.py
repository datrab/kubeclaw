"""Check complete native specification and requirement conservation, not acceptance."""
import hashlib
import json
from pathlib import Path
root = Path.cwd()
source = root/'docs/review/evidence/config-acceptance/runtime/case-proposals.json'
matrix_path = root/'docs/review/remediation/config-acceptance-matrix.json'
matrix = json.loads(matrix_path.read_text())
native = json.loads(source.read_text())
package = matrix['nativeCasePackages'][0]
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
    assert link['mappingReview'] is None
assert package['reviewerConfirmation'] is None
assert matrix['immutableObservationReferences']['referenceOccurrencesValidated'] == package['observationReferenceIntegrity']['referenceOccurrencesValidated']
print(json.dumps({'scope':'exact native ID/requirements/specification projection only',
    'scriptSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
    'matrixSha256':hashlib.sha256(matrix_path.read_bytes()).hexdigest(),
    'nativeSha256':package['sourceSha256'],'nativeCasesPreserved':len(native),
    'canonicalLinks':sum(link['canonicalCaseId'] is not None for link in links),
    'unlinkedNativeObligations':sum(link['canonicalCaseId'] is None for link in links),
    'observationReferencesValidated':matrix['immutableObservationReferences']['referenceOccurrencesValidated'],
    'independentCanonicalAcceptance':False,'globalC0Accepted':False},indent=2))
