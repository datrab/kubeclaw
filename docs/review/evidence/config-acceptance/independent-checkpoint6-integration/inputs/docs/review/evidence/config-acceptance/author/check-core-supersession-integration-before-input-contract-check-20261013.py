"""Actual bounded consolidator block controls; never writes the root matrix."""
import hashlib
import json
from pathlib import Path

root = Path.cwd()
base = root/'docs/review/evidence/config-acceptance'
source_path = base/'author/consolidate.py'
source = source_path.read_text()
block = source[source.index('supplemental_packages = []'):source.index('\ninventory = {')]
real_digest = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
load = lambda p: json.loads(p.read_text())
def collect(corrupt=None):
    scope = {'root':root, 'base':base, 'load':load,
             'digest':lambda p: '0'*64 if corrupt == p else real_digest(p)}
    exec(compile(block, str(source_path), 'exec'), scope)
    return scope['supplemental_packages'][0]

observations = []
package = collect()
old = base/'components/icq-corrections-20261013/stable-material-correction-receipt.json'
new = base/'components/icq-r06-boundaries-20261013/stable-material-correction-receipt.json'
assert package['receipt'] == str(new.relative_to(root))
assert len(package['questions']) == 14 and len(package['caseSpecifications']) == 22
assert package['activeFiles']['cases'] == load(new)['caseEntry']
assert package['supersessionHistory'][0]['receipt'] == str(old.relative_to(root))
assert package['reviewerConfirmation'] is None
assert all(c['lifecycle']['status'] == 'active-superseding-proposed-not-run' for c in package['caseSpecifications'])
observations.append({'id':'ACTIVE-SUPERSESSION-WITH-HISTORY', 'result':'passed'})
for label, path in [
    ('REJECT-OLD-CORRECTION-DRIFT', root/next(iter(load(old)['freeze']))),
    ('REJECT-PRESERVED-INDEPENDENT-REPORT-DRIFT', base/'independent-core-icq-material-recheck-20261013/independent-material-review.json'),
    ('REJECT-NEW-BOUNDARY-INPUT-DRIFT', root/load(new)['definitionEntry']),
]:
    try:
        collect(path)
    except ValueError as error:
        assert 'INPUT_DRIFT:' in str(error), error
        observations.append({'id':label, 'result':'passed', 'intendedRejection':str(error)})
    else:
        raise AssertionError(f'{label}: corrupt identity accepted')
assert collect() == package
observations.append({'id':'RESTORED-PACKAGE-BASELINE', 'result':'passed'})
print(json.dumps({'scope':'documentation consolidator supersession identity controls only',
    'consolidatorSha256':real_digest(source_path), 'scriptSha256':real_digest(Path(__file__)),
    'activeReceipt':package['receipt'], 'activeReceiptSha256':package['receiptSha256'],
    'preservedReceiptSha256':real_digest(old), 'inputIdentityCount':len(package['inputIdentities']),
    'observations':observations, 'globalC0':'not-accepted',
    'limitations':['no root matrix generation while other authors mutate',
      'injected digest disagreement checks the documentation guard, not a production semantic mutant',
      'no independent reviewer confirmation or canonical field-case coverage manufactured']}, indent=2))
