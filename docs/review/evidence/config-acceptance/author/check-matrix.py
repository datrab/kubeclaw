"""Reject incomplete CONFIG acceptance; --structural checks draft integrity only.

No result from this tool can by itself establish semantic consumer acceptance.
The full gate intentionally fails while unresolved candidate/case/review exists.
"""
import hashlib
import json
import pathlib
import sys
import argparse

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
for entry in inventory.get('inputFragments',[]):
    identity(entry['path'],entry['sha256'],'fragment')
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
