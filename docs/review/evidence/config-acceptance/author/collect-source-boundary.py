"""Record source identity and discovery obligations, never semantic acceptance.

Run from repository root. Uses the whole tracked tree, including dot directories,
without importing/evaluating application configuration or reading host secrets.
"""
import hashlib
import json
import pathlib
import re
import subprocess

root = pathlib.Path.cwd()
out = root / 'docs/review/evidence/config-acceptance/author'
paths = subprocess.check_output(['git', 'ls-files', '-z']).decode().split('\0')
production_roots = {'skills', 'charts', 'my-values', 'scripts', 'gitops', 'docker',
                    'ops', 'tools', 'examples', 'contracts', '.github', 'cmd',
                    'packaging', 'plugins', '.agents', 'spikes'}
sources, boundaries, candidates = [], [], []
for name in sorted(filter(None, paths)):
    p = root / name
    if not p.is_file():
        boundaries.append({'path': name, 'disposition': 'non-file tracked object',
                           'linkTarget': str(p.readlink()) if p.is_symlink() else None})
        continue
    data = p.read_bytes()
    identity = {'path': name, 'sha256': hashlib.sha256(data).hexdigest(),
                'gitObject': subprocess.check_output(['git', 'hash-object', name], text=True).strip()}
    if p.is_symlink():
        identity['linkTarget'] = str(p.readlink())
    parts = pathlib.PurePosixPath(name).parts
    if parts[0] == 'releases':
        disposition = 'release snapshot; delivery-selection reference review required'
    elif parts[0] == 'docs':
        disposition = 'documentation/evidence; not current productive author, examples remain doc obligations'
    elif any(x in {'tests', 'test', 'integration', '__fixtures__', 'fixtures'} for x in parts) or name.endswith('_test.go'):
        disposition = 'test/fixture input; test identity not operator author; productive packaging imports must be checked'
    elif parts[0] in production_roots or len(parts) == 1:
        disposition = 'productive candidate; semantic disposition required'
    else:
        disposition = 'unclassified root; manual disposition required'
    boundaries.append({**identity, 'disposition': disposition})
    if disposition.startswith(('productive', 'unclassified')):
        sources.append(identity)
        text = data.decode('utf-8', errors='replace')
        for line, value in enumerate(text.splitlines(), 1):
            kinds = []
            if re.search(r'process\.env|\benv\[|\benvironment[.\[]|os\.environ|os\.Getenv|os\.LookupEnv|\$\{[A-Z]|\$[A-Z][A-Z_]+', value):
                kinds.append('environment')
            if re.search(r'\?\?|\|\||\bDEFAULT_|\|\s*default\b|useDefaults|default=', value):
                kinds.append('fallback-or-expression')
            if re.search(r'\.Values\b|\bARG\s|\bENV\s|--[a-z].*(?:timeout|limit|config|profile)|\b(?:timeout|maximum|maxConcurrency|quota|model|prompt|retention|budget)\b', value, re.I):
                kinds.append('policy-or-input')
            if kinds:
                candidates.append({'id': 'SRC-' + hashlib.sha256(f'{name}:{line}'.encode()).hexdigest()[:16],
                                   'source': name, 'line': line, 'kinds': kinds,
                                   'sourceSha256': identity['sha256'],
                                   'disposition': 'unresolved', 'settingIds': [], 'reason': None})
manifest = {'sourceCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
            'sourceTree': subprocess.check_output(['git', 'rev-parse', 'HEAD^{tree}'], text=True).strip(),
            'method': 'whole tracked tree; source boundary is not semantic closure',
            'sources': sources, 'boundaries': boundaries}
out.mkdir(parents=True, exist_ok=True)
(out / 'source-boundary.json').write_text(json.dumps(manifest, indent=2) + '\n')
(out / 'candidate-ledger.json').write_text(json.dumps({'status': 'discovery-not-acceptance', 'candidates': candidates}, indent=2) + '\n')
print(json.dumps({'trackedFiles': len(boundaries), 'productiveCandidates': len(sources),
                  'candidateLocations': len(candidates), 'semanticClosure': False}))
