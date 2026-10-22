"""Passive receiving review. No browser/product process is launched."""
from pathlib import Path
import hashlib
import json
from collections import Counter

B = Path('/home/node/.openclaw/workspace/tmp/pr13-finish-20261021')
O = B / 'reader-resume-final-20261022'
O.mkdir(exist_ok=True)
bindings = {}
def read(p):
    p = Path(p)
    data = p.read_bytes()
    bindings[str(p)] = {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
    return json.loads(data)
def check_run(directory, report_path, author):
    directory = B / directory
    receipt = read(directory / 'result.json')
    invocation = read(directory / 'invocation.json')
    assert all(receipt[k] == v for k, v in invocation.items())
    assert receipt['exitCode'] == 0 and receipt['end'] > receipt['start']
    for name, expected in receipt['streams'].items():
        p = directory / name
        data = p.read_bytes()
        actual = {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
        assert actual == expected
        bindings[str(p)] = actual
    report = read(B / report_path)
    for name, key in [(author, 'scriptSha256'), (str(Path(author).parent / 'preparation.json'), 'preparationSha256')]:
        p = B / name
        digest = hashlib.sha256(p.read_bytes()).hexdigest()
        assert digest == report[key]
        bindings[str(p)] = {'bytes': p.stat().st_size, 'sha256': digest}
    assert receipt['scriptSha256'] == report['scriptSha256']
    assert report['fatal'] is None and not report['findings'] and not report['network']
    return report

r = check_run('a910-scroll137-retake-root-review/execution', 'a910-scroll137-retake-result/report.json', 'a910-scroll137-retake-author/retake-scroll.mjs')
p = read(B / 'a910-scroll137-retake-author/preparation.json')
original = read(p['originalReport'])
assert bindings[p['originalReport']]['sha256'] == r['originalReportSha256']
key = lambda x: (x['page'], x['width'], x.get('tableIndex', x.get('index')))
bad = {key(x): x for x in original['tableObservations'] if not x['ok']}
assert len(bad) == len(r['results']) == 137
assert set(bad) == {key(x) for x in r['results']}
cells = 0
for x in r['results']:
    assert x['actualCellMatrixUnchanged'] and x['keyboardPassed'] and x['contained']
    old = bad[key(x)]
    assert not old['nativeScroll'] and old['exactCells'] and old['cellsUnclipped']
    assert x['originalKeyObservation'] == old['key']
    assert x['originalWheelEnd'] == old['right']['scrollLeft']
    for name in ['returnToLeft', 'toRight', 'backToLeft']:
        m = x[name]
        f = m['final']
        assert m['reachedEndpoint'] and f['focused']
        assert (f['scrollLeft'] <= 1 if name != 'toRight' else f['scrollLeft'] >= f['scrollWidth'] - f['clientWidth'] - 1)
        for step in m['steps']:
            q = step['observation']
            assert q['settled'] and q['final']['focused']
            assert q['final']['pageWidth'] <= x['width'] + 1
    for cell in x['cellRangeObservations']:
        assert cell['scrollMediatedReachable']
        assert all(any(a-2 <= rect['left'] and rect['right'] <= b+2 for a,b in x['coverageIntervals']) for rect in cell['ranges'])
        cells += 1

s = check_run('reader-error-search-supplement-root-review/browser', 'reader-error-search-supplement-result-browser/report.json', 'reader-error-search-supplement-author/supplement.mjs')
assert s['revision'] == r['revision']
assert len(s['pages']) == 3 and len(s['tables']) == 57 and len(s['searches']) == 3
assert {x['width'] for x in s['pages']} == {320,768,1440}
assert len({(x['width'],x['index']) for x in s['tables']}) == 57
for x in s['tables']:
    assert x['exactMatrix'] and x['contained']
    for c in x['ranges']:
        assert c['scrollWidth'] <= c['clientWidth'] + 2
        assert all(any(a-2 <= rect['left'] and rect['right'] <= b+2 for a,b in x['coverageIntervals']) for rect in c['ranges'])
    for m in x['motion']:
        f = m['final']
        assert f['focused']
        assert (f['scrollLeft'] <= 1 if m['direction'] == 'left' else f['scrollLeft'] >= f['scrollWidth'] - f['clientWidth'] - 1)
for x in s['searches']:
    assert x['nativeFocusAndEnter'] and x['actual'].endswith('/' + x['expected'])
    assert any(y['href'] == x['expected'] for y in x['results'])
    assert all(y.startswith('file:///') for y in x['loaded'])
result = {
    'status': 'PASS_BOUNDED_TERMINAL_RECEIVING_REVIEW_ONLY',
    'revision': r['revision'],
    'retake': {'exactOriginalFailedCases':137, 'keyboardEndpointPasses':137, 'cellRangeObservations': cells, 'widthCounts':dict(Counter(x['width'] for x in r['results'])), 'wheelReachedEnd':sum(x['wheel']['reachedEnd'] for x in r['results']), 'original137FailuresPreserved':True},
    'supplement': {'pages':3, 'tableWidthObservations':57, 'offlineNativeSearchActivations':3},
    'limits':['No historical failure rewritten; keyboard scroll-mediated reachability is not simultaneous visibility or a wheel waiver.', 'Passive receiving evidence review, not a fresh browser run, full corpus semantic review, screenreader/persona acceptance, or product runtime qualification.', 'No gate, requirement, completion record, register, Main, or delivered archive modified. Final integration and exact94 preservation disposition remain separate.'],
    'bindings':bindings
}
(O / 'review.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k != 'bindings'},indent=2))
