"""Audit every current refinement against its independent-reviewable active spec.

Documentation integrity only, not consumer behavior or C0 semantic acceptance.
"""
import argparse
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--matrix', type=Path, default=Path('docs/review/remediation/config-acceptance-matrix.json'))
args = parser.parse_args()
base = Path('docs/review/evidence/config-acceptance')
fragment_path = base/'components/residual-fragment.json'
spec_path = base/'components/active-case-specifications.json'
fragment = json.loads(fragment_path.read_text())
specs = {c['caseId']:c for c in json.loads(spec_path.read_text())['cases']}
matrix = json.loads(args.matrix.read_text())
cases = {c['id']:c for c in matrix['cases']}
errors = []
records = []
seen = set()
for refinement in fragment['caseRefinements']:
    cid = refinement['replacementForCaseId']
    if cid in seen:
        errors.append({'caseId':cid,'field':'duplicate-refinement'})
    seen.add(cid)
    case, spec = cases.get(cid), specs.get(cid)
    if case is None or spec is None:
        errors.append({'caseId':cid,'field':'missing-current-spec-or-root-case'})
        continue
    expected = {
        'inputProfile':spec['input']['completeProfiles'],
        'inputConfigProfile':spec['input']['completeProfiles'],
        'priorState':spec['priorState'], 'action':spec['action'],
        'expectedEffectOrRejectingBoundary':spec['oracles']['expected'],
        'exactProductiveBoundary':spec['boundary'],
        'lifecycle':spec['lifecycle'], 'proposedInvocation':spec['invocation'],
        'command':spec['exactCommand'],
    }
    for field, value in expected.items():
        if case.get(field) != value:
            errors.append({'caseId':cid,'field':field,'reason':'canonical root differs from active authoritative specification'})
    if case.get('observerMethod',{}).get('boundary') != expected['expectedEffectOrRejectingBoundary']:
        errors.append({'caseId':cid,'field':'observer-boundary','reason':'nested oracle contradicts canonical root'})
    previous = case.get('historicalCanonicalSpecification')
    if not previous or not set(previous['requirementIds']).issubset(case['requirementIds']):
        errors.append({'caseId':cid,'field':'historical-requirements','reason':'missing historical text or original obligation lost'})
    if set(case['settingIds']) != set(spec['settingIds']):
        errors.append({'caseId':cid,'field':'settingIds'})
    if not set(spec['requirementIds']).issubset(case['requirementIds']):
        errors.append({'caseId':cid,'field':'active-requirements'})
    if case.get('result') != 'not-run' or case.get('actualResult') != 'not-run':
        errors.append({'caseId':cid,'field':'future-result','reason':'proposed command is not execution'})
    if 'actualTestCommand' in case or 'proposedTest' in case:
        errors.append({'caseId':cid,'field':'obsolete-active-alias'})
    records.append({'caseId':cid,'canonicalFieldsChecked':list(expected),'historicalRequirementsPreserved':previous.get('requirementIds') if previous else None})
report = {'scope':'all current component refinement canonical specifications; documentation integrity only',
    'checked':len(records),'errors':errors,'errorCount':len(errors),'acceptedC0':False,
    'inputIdentities':[{'path':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in [Path(__file__),args.matrix,fragment_path,spec_path]],
    'records':records}
print(json.dumps(report,indent=2))
raise SystemExit(1 if errors else 0)
