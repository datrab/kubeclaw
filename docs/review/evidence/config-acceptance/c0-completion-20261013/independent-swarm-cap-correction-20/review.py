"""Independent, static SWARM19-001 correction review; no author validator calls."""
import copy
import hashlib
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[6]
BASE = Path('docs/review/evidence/config-acceptance/c0-completion-20261013')
OUT = ROOT / BASE / 'independent-swarm-cap-correction-20'
checks = []

def read(path):
    return json.loads((ROOT / path).read_text())

def sha(path):
    return hashlib.sha256((ROOT / path).read_bytes()).hexdigest()

def check(label, result):
    checks.append({'check': label, 'pass': bool(result)})

def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT, text=True)

head, tree = git('rev-parse', 'HEAD').strip(), git('rev-parse', 'HEAD^{tree}').strip()
(OUT / 'status.stdout').write_text(git('status', '--porcelain=v1', '--untracked-files=all'))
(OUT / 'patch.stdout').write_text(git('diff', '--binary', 'HEAD'))
a = read(BASE / 'delivery/batch-27/source-field-definitions.json')
b = read(BASE / 'delivery/batch-28/source-field-definitions.json')
old_identity = read(BASE / 'independent-swarm-clauses-19/input-identities.json')
paths = {str(BASE / 'delivery/batch-27' / p.name) for p in (ROOT / BASE / 'delivery/batch-27').iterdir() if p.is_file()}
paths.update(str(BASE / 'delivery/batch-28' / p.name) for p in (ROOT / BASE / 'delivery/batch-28').iterdir() if p.is_file())
paths.update(str(BASE / 'independent-swarm-clauses-19' / p.name) for p in (ROOT / BASE / 'independent-swarm-clauses-19').iterdir() if p.is_file())
paths.update(['docs/review/remediation/GOAL-START.md', 'docs/review/remediation/OPENCLAW-CONFIG-GOAL.md', 'charts/kubeclaw/templates/_swarm-config.tpl', 'charts/kubeclaw/files/config/swarm-components.schema.json'])
for f in old_identity['files']:
    if f['path'].startswith(str(BASE / 'delivery/batch-27')) or f['path'] in paths:
        paths.add(f['path'])
        check('unchanged since review19: ' + f['path'], sha(f['path']) == f['sha256'])
check('exact twenty row IDs and ordering retained', len(a['rows']) == len(b['rows']) == 20 and [r['candidateId'] for r in a['rows']] == [r['candidateId'] for r in b['rows']])
for old, new in zip(a['rows'], b['rows']):
    check('original body conserved: ' + old['candidateId'], old['originalCandidate'] == new['originalCandidate'])
changed = [new['candidateId'] for old, new in zip(a['rows'], b['rows']) if old != new]
check('exactly one changed row, other nineteen byte-equivalent JSON values', changed == ['SRC-ea5d74692fd5fcdd'])
old = next(r for r in a['rows'] if r['candidateId'] == changed[0])
new = next(r for r in b['rows'] if r['candidateId'] == changed[0])
tpl = 'charts/kubeclaw/templates/_swarm-config.tpl'
lines = (ROOT / tpl).read_text().splitlines()
keys = re.findall(r'"([A-Za-z]+)"', lines[213])
expected = ['maximumRequestBytes', 'maximumArchiveBytes', 'maximumHeaderBytes', 'maximumInputBytes', 'maximumOutputBytes', 'maximumResultBytes']
check('actual line214 enumerates exactly six required members', keys == expected)
check('actual line215 strictly rejects above2147483647', '(float64 2147483647)' in lines[214] and 'if gt (index $b $key)' in lines[214] and 'swarm Buster buffer limit invalid' in lines[214])
refs = [{'path': tpl, 'line': n, 'expression': lines[n-1], 'sha256': sha(tpl)} for n in [214, 215]]
check('aggregate gate members/max/source refs truthful', new['adjacentRendererCap']['members'] == keys and new['adjacentRendererCap']['maximum'] == 2147483647 and new['adjacentRendererCap']['sourceRefs'] == refs)
schema = read('charts/kubeclaw/files/config/swarm-components.schema.json')
check('all26 preparation members retained', len(old['members']) == len(new['members']) == 26)
for om, nm in zip(old['members'], new['members']):
    key = nm['currentAuthor'].rsplit('/', 1)[-1]
    domain = schema
    for part in nm['schemaPointer'][2:].split('/'):
        domain = domain[part]
    check('truthful unchanged schemaDomain: ' + key, nm['schemaDomain'] == om['schemaDomain'] == domain)
    if key in keys:
        check('explicit effective cap with exact source refs: ' + key, nm['effectiveRendererMaximum'] == min(domain['maximum'], 2147483647) and nm['additionalRendererGateRefs'] == refs)
        cleaned = {k: v for k, v in nm.items() if k not in ['effectiveRendererMaximum', 'additionalRendererGateRefs']}
        check('capped member otherwise unchanged: ' + key, cleaned == om)
    else:
        check('non-capped member unchanged: ' + key, nm == om)
cleaned = copy.deepcopy(new)
cleaned.pop('adjacentRendererCap')
cleaned['currentDomainAndRelations'] = old['currentDomainAndRelations']
for m in cleaned['members']:
    m.pop('effectiveRendererMaximum', None)
    m.pop('additionalRendererGateRefs', None)
check('only documented cap/member additions and relation clarification in changed row', cleaned == old)
w = new['adjacentRendererCap']['sourceWitness']
request_domain = schema['$defs']['buster-preparation']['properties']['maximumRequestBytes']
check('2147483648 static scalar witness satisfies schema and exceeds cap', request_domain['minimum'] <= 2147483648 <= request_domain['maximum'] and 2147483648 > 2147483647 and w == {'member': 'maximumRequestBytes', 'value': 2147483648, 'schemaAcceptsScalar': True, 'rendererRejectsScalar': True, 'executedHelmOrNativeResult': False})
check('bounded gates unchanged and runtime not-run', b['globalC0Accepted'] is False and all(r['definitionAccepted'] is False and r['runtimeResult'] == 'not-run' for r in b['rows']))
for f in read(BASE / 'delivery/batch-28/package-manifest.json')['files']:
    check('batch28 manifest identity: ' + f['path'], sha(f['path']) == f['sha256'])
check('superseded batch27 definition hash correct', b['supersedesDefinitionRef']['sha256'] == sha(BASE / 'delivery/batch-27/source-field-definitions.json'))
identity = {'reviewer': '/root/swarm_cap_recheck_20', 'head': head, 'tree': tree, 'scope': 'SWARM19-001 additive correction only', 'files': [{'path': p, 'sha256': sha(p), 'bytes': (ROOT/p).stat().st_size} for p in sorted(paths)]}
(OUT / 'input-identities.json').write_text(json.dumps(identity, indent=2) + '\n')
result = {'checks': checks, 'passed': sum(c['pass'] for c in checks), 'failed': sum(not c['pass'] for c in checks), 'verdict': 'PASS bounded SWARM19-001 correction' if all(c['pass'] for c in checks) else 'NOT ACCEPTED', 'nativeOrHelmExecuted': False, 'globalC0Accepted': False}
(OUT / 'checks.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({k: v for k,v in result.items() if k != 'checks'}, indent=2))
for c in checks:
    if not c['pass']:
        print('FAIL: ' + c['check'])
