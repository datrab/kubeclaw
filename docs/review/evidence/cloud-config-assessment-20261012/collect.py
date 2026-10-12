"""Read-only source index. Run from repo root; writes only assessment evidence.

No runtime values or credentials are read. Lexical matches are navigation aids,
not proof of field consumption. Existing AST discovery is retained separately.
"""
import hashlib
import json
import pathlib
import re
import subprocess

ROOT = pathlib.Path.cwd()
OUT = ROOT / 'docs/review/evidence/cloud-config-assessment-20261012'
tracked = subprocess.check_output(['git', 'ls-files'], text=True).splitlines()
prefixes = ('skills/', 'charts/', 'my-values/', 'scripts/', 'gitops/', 'docker/', 'ops/', 'tools/', 'examples/', 'contracts/', '.github/', 'cmd/', 'packaging/', 'plugins/', 'releases/', '.agents/')
excluded = re.compile(r'(^|/)(tests?|integration|dist|generated|node_modules)(/|\.)')
files = [p for p in tracked if (p.startswith(prefixes) or '/' not in p) and not excluded.search(p)
         and not re.search(r'_test\.go$', p)
         and not p.startswith('scripts/config/tests/') and (ROOT / p).is_file()]
texts = {}
sources = []
for name in files:
    data = (ROOT / name).read_bytes()
    sources.append({'path': name, 'sha256': hashlib.sha256(data).hexdigest()})
    if pathlib.Path(name).suffix in ('.ts', '.mts', '.mjs', '.js', '.py', '.sh', '.go', '.yaml', '.yml', '.json', '.toml', '.tpl', '.dockerignore') or pathlib.Path(name).name.startswith('Dockerfile') or pathlib.Path(name).name == '.dockerignore':
        texts[name] = data.decode('utf-8', errors='replace').splitlines()

def fields(value, pointer='', seen=None):
    if not isinstance(value, dict):
        return []
    result = []
    for key, child in value.get('properties', {}).items():
        if not isinstance(child, dict):
            result.append({'pointer': pointer + '/' + key, 'booleanSchema': child})
            continue
        field = {'pointer': pointer + '/' + key, 'name': key,
                 'requiredAtParent': key in value.get('required', []),
                 'contract': {k: v for k, v in child.items() if k in
                              ('type', 'enum', 'const', 'minimum', 'maximum', 'minLength', 'maxLength', '$ref')},
                 'hasDefaultAnnotation': 'default' in child}
        result.append(field)
        result.extend(fields(child, field['pointer'], seen))
    for key in ('items', 'additionalProperties'):
        if isinstance(value.get(key), dict):
            result.extend(fields(value[key], pointer + '/*', seen))
    for key in ('allOf', 'oneOf', 'anyOf'):
        for i, child in enumerate(value.get(key, [])):
            result.extend(fields(child, pointer + '/' + key + '/' + str(i), seen))
    if '$ref' in value:
        result.append({'pointer': pointer, 'reference': value['$ref'],
                       'status': 'resolve through production registry; reference is not an inline field'})
    return result

plugins = []
for name in files:
    if not (name.endswith('/plugin.json') or name.endswith('/openclaw.plugin.json')):
        continue
    if '/plugin-runtime/' in name:
        continue
    manifest = json.loads((ROOT / name).read_text())
    package = str(pathlib.Path(name).parent)
    registrations = []
    for kind in ('stages', 'adapters', 'observers', 'testProviders', 'reportAdapters'):
        raw = manifest.get(kind, [])
        if isinstance(raw, dict):
            raw = list(raw.values())
        for entry in raw:
            schemas = []
            for key in ('configSchema', 'runtimeConfigSchema'):
                if isinstance(entry.get(key), str):
                    schema = str(pathlib.Path(package) / entry[key])
                    parsed = json.loads((ROOT / schema).read_text())
                    ff = fields(parsed)
                    for field in ff:
                        if 'name' not in field:
                            continue
                        token = re.compile(r'\b' + re.escape(field['name']) + r'\b')
                        field['lexicalSourceLocations'] = [
                            {'path': p, 'lines': [i + 1 for i, line in enumerate(lines) if token.search(line)]}
                            for p, lines in texts.items() if p.startswith(package + '/src/')
                            and any(token.search(line) for line in lines)]
                    schemas.append({'role': key, 'path': schema, 'fields': ff,
                                    'definitions': list(parsed.get('$defs', {}))})
            registrations.append({'kind': kind, 'id': entry.get('id'), 'type': entry.get('type'),
                                  'module': str(pathlib.Path(package) / entry['module']) if entry.get('module') else None,
                                  'schemas': schemas, 'requiredCapabilities': entry.get('requiredCapabilities', [])})
    plugins.append({'id': manifest.get('id', manifest.get('name')), 'manifest': name,
                    'family': 'codex-ops-plugin' if name.startswith('plugins/') else 'openclaw-extension' if name.endswith('/openclaw.plugin.json') else package.split('/')[1],
                    'inlineConfigFields': fields(manifest.get('configSchema', {})),
                    'registrations': registrations})

markers = []
for name, lines in texts.items():
    for i, line in enumerate(lines):
        kinds = []
        if re.search(r'process\.env|environment\[|environment\.|os\.environ|os\.Getenv|\$\{[A-Z]', line): kinds.append('environment')
        if re.search(r'\?\?|DEFAULT_|\|\||\| default ', line): kinds.append('fallback-or-expression')
        if re.search(r'\b(timeout|maximum|maxConcurrency|limits|model|prompt|retention|quota)', line, re.I): kinds.append('policy-or-input')
        if kinds: markers.append({'path': name, 'line': i + 1, 'kinds': kinds})

helm = []
for name, lines in texts.items():
    if '/templates/' not in name:
        continue
    for i, line in enumerate(lines):
        for value in sorted(set(re.findall(r'\.Values(?:\.[A-Za-z0-9_]+)+', line))):
            helm.append({'source': value, 'consumer': name, 'line': i + 1})

history = []
for name in ('docs/review/remediation/config-scope-inventory-20261012.json',):
    old = json.loads((ROOT / name).read_text())
    for item in old['sourceIdentities']:
        p = item['path']; actual = hashlib.sha256((ROOT / p).read_bytes()).hexdigest() if (ROOT / p).is_file() else None
        history.append({'path': p, 'matchesHistoricalHash': actual == item['sha256'], 'currentSha256': actual})

index = {'sourceCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
         'status': 'current source navigation and declarations; semantic groups in cloud-config-assessment-20261012.md; not F1 acceptance',
         'scopeRoots': prefixes, 'exclusions': ['test/integration, generated/dist, node_modules', 'historical evidence source copies', 'external installed plugins and external service implementation'],
         'limits': ['lexical field locations are not proven consumers', 'dynamic keys, shell positional arguments and transitive $ref require production resolver and semantic analysis', 'no deployed profile or live environment inferred'],
         'sources': sources, 'plugins': plugins, 'markers': markers, 'helmValueConsumers': helm, 'historicalIdentityComparison': history}
OUT.mkdir(parents=True, exist_ok=True)
(OUT / 'source-index.json').write_text(json.dumps(index, indent=2, ensure_ascii=False) + '\n')
print(json.dumps({'sources': len(sources), 'plugins': len(plugins), 'markers': len(markers), 'helmValueConsumers': len(helm), 'historicalIdentityMatches': sum(x['matchesHistoricalHash'] for x in history)}, indent=2))
