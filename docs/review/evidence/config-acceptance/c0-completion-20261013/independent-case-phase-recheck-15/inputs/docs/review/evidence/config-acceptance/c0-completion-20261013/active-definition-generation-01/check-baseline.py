"""Actual registered original-baseline controls in private copied artifacts.

No active definition, independent review or runtime acceptance is fabricated.
"""
from pathlib import Path
import json
import shutil
import sys
import tempfile

root = Path.cwd()
base = Path(__file__).resolve().parent
sys.path.insert(0,str(root/'docs/review/evidence/config-acceptance/author'))
from definition_baseline import DefinitionBaseline, REGISTERED_BASELINES, strict_json
from review_receipts import canonical_sha

results = []
def rejects(name, function, expected):
    try:
        function()
    except ValueError as error:
        assert expected in str(error),str(error)
        results.append({'id':name,'result':'passed','boundary':expected})
    else:
        raise AssertionError('missing rejection:'+name)
reference = {key:REGISTERED_BASELINES[0][key] for key in ('path','sha256')}
rejects('author-selected replacement manifest hash is not a registered baseline',
        lambda:DefinitionBaseline(root,{**reference,'sha256':'0'*64}),
        'DEFINITION_BASELINE_NOT_REGISTERED')
rejects('alternate baseline path is not an authority',
        lambda:DefinitionBaseline(root,{**reference,'path':'alternate.json'}),
        'DEFINITION_BASELINE_NOT_REGISTERED')
rejects('extra baseline reference field is not accepted',
        lambda:DefinitionBaseline(root,{**reference,'approved':True}),
        'DEFINITION_BASELINE_REF_INVALID')
rejects('duplicate JSON keys are rejected rather than last-key-wins',
        lambda:strict_json('{"id":"original","id":"replacement"}'),
        'DEFINITION_JSON_DUPLICATE_KEY')
rejects('nonfinite JSON value rejected',lambda:strict_json('{"value":NaN}'),
        'DEFINITION_JSON_NONFINITE')
rejects('overflowed JSON exponent rejected',lambda:strict_json('{"value":1e309}'),
        'DEFINITION_JSON_NONFINITE')
assert strict_json('{"value":1e3}') == {'value': 1000.0}
results.append({'id': 'finite JSON exponent remains supported', 'result': 'passed'})

with tempfile.TemporaryDirectory(prefix='c0-immutable-baseline-') as directory:
    private = Path(directory)
    relative = base.relative_to(root)/'baseline'
    shutil.copytree(base/'baseline', private/relative)
    verified = DefinitionBaseline(private, reference)
    verified.assert_no_drift()
    assert len(verified.records)==50617
    key = ('setting','RT-COMPILER-DEFINITION-MAXCONCURRENCY')
    assert verified.bodies[key]['class']=='operator-setting', 'historical classification must remain original'
    assert verified.bodies[key]['domain']['targetCurrentCompatibleDomain']==[1]
    assert canonical_sha(verified.bodies[key])==verified.records[key]['bodySha256']
    results.append({'id':'actual original typed catalog/occurrences and historical compiler body preserved',
                    'result':'passed','records':len(verified.records)})
    catalog = private/verified.manifest['catalogRef']['path']
    original = catalog.read_bytes()
    catalog.write_bytes(original+b' ')
    rejects('original catalog byte drift at mandatory end check',verified.assert_no_drift,
            'REVIEW_INPUT_CHANGED')
    catalog.write_bytes(original)
    catalog.rename(catalog.with_suffix('.original'))
    catalog.symlink_to(catalog.with_suffix('.original').name)
    rejects('original catalog same-byte target identity changed at end',verified.assert_no_drift,
            'REVIEW_INPUT_CHANGED')
    catalog.unlink(); catalog.with_suffix('.original').rename(catalog)
    verified.assert_no_drift()
    results.append({'id':'restored original reference passes unchanged end check','result':'passed'})

print(json.dumps({'controls':results,'passed':len(results),'failed':0,
                  'qualification':'original baseline preservation only; active validator/root integration pending',
                  'globalC0Accepted':False},indent=2))
