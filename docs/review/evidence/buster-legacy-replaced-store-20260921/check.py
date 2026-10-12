"""Unprivileged source/closure checks; never invokes guest cases or syscalls."""
import ast
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace

ROOT = Path.cwd()
EVIDENCE = ROOT / 'docs/review/evidence/buster-legacy-replaced-store-20260921'
DRIVER = ROOT / 'tests/fixtures/test-gate/legacy-seal-guest.py'
before = ast.parse((EVIDENCE / 'driver-before.py.snapshot').read_text())
after = ast.parse(DRIVER.read_text())
normalized = copy.deepcopy(after)
normalized.body = [node for node in normalized.body if not isinstance(node, ast.FunctionDef)
                   or node.name not in ('association_sources', 'association_comparator', 'replaced_store_case')]
for node in normalized.body:
    if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'CASES' for t in node.targets):
        assert node.value.elts[-1].value == 'replaced-store'
        node.value.elts.pop()
    if not isinstance(node, ast.FunctionDef):
        continue
    if node.name == 'bound_sources':
        assert ast.unparse(node.body[-1]) == 'association_sources(args)'
        node.body.pop()
    if node.name in ('own_command', 'main'):
        loop = next(n for n in node.body if isinstance(n, ast.For))
        assert [x.value for x in loop.iter.elts[-2:]] in [
            ['association_manifest', 'association_manifest_sha256'],
            ['association-manifest', 'association-manifest-sha256']]
        del loop.iter.elts[-2:]
    if node.name == 'run_case':
        for i, statement in enumerate(node.body):
            if isinstance(statement, ast.If) and ast.unparse(statement.test) == "case == 'replaced-store'":
                assert ast.unparse(statement.body[0]) == 'replaced_store_case(args, tree)'
                assert len(statement.orelse) == 1
                node.body[i] = statement.orelse[0]
assert ast.dump(before, include_attributes=False) == ast.dump(normalized, include_attributes=False)

spec = importlib.util.spec_from_file_location('driver_review', DRIVER)
driver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(driver)
assert len(driver.CASES) == 30 and driver.MAX_CASES == 32
names = ('buster_legacy_stop_policy', 'buster_legacy_stop_files',
         'buster_legacy_stop_runtime', 'buster_legacy_stop_transaction')
rows = {name: {'path': str(ROOT / 'scripts' / (name + '.py')),
              'sha256': hashlib.sha256((ROOT / 'scripts' / (name + '.py')).read_bytes()).hexdigest()}
        for name in names}
with tempfile.TemporaryDirectory() as directory:
    manifest = Path(directory) / 'closure.json'
    def arguments(value):
        data = json.dumps(value).encode()
        manifest.write_bytes(data)
        return SimpleNamespace(association_manifest=str(manifest),
                               association_manifest_sha256=hashlib.sha256(data).hexdigest())
    args = arguments(rows)
    same_seal = driver.association_comparator(args)
    observation = {'filesystemUuid': 'baff0000-0000-4000-8000-000000000001', 'inode': 10,
                   'device': 12, 'mountId': 30, 'store': {'inode': 11, 'digest': 'sha256:abc', 'device': 12}}
    assert same_seal(observation, observation)
    other_namespace = copy.deepcopy(observation)
    other_namespace.update(device=100, mountId=90)
    other_namespace['store']['device'] = 100
    assert same_seal(other_namespace, observation)
    replacement = copy.deepcopy(observation)
    replacement['store']['inode'] = 15
    assert not same_seal(replacement, observation)
    failures = []
    for label, changed, expected in [
        ('missing-module', {k: v for k, v in rows.items() if k != names[0]}, 'ASSOCIATION_CLOSURE'),
        ('wrong-file-hash', {**rows, names[0]: {**rows[names[0]], 'sha256': '0' * 64}},
         'ASSOCIATION_SOURCE_HASH:' + names[0]),
    ]:
        try:
            driver.association_sources(arguments(changed))
        except RuntimeError as error:
            assert str(error) == expected
            failures.append(label)
        else:
            raise AssertionError(label)
    args = arguments(rows)
    args.association_manifest_sha256 = '0' * 64
    try:
        driver.association_sources(args)
    except RuntimeError as error:
        assert str(error) == 'ASSOCIATION_MANIFEST_HASH'
        failures.append('wrong-manifest-hash')
    else:
        raise AssertionError('wrong-manifest-hash')
result = {'original29AstPreserved': True, 'caseCount': 30, 'limitsUnchanged': True,
          'actualComparatorModeledObservations': ['same-original', 'different-namespace', 'different-store-inode'],
          'rejectedManifestControls': failures, 'kernelExecuted': False,
          'sources': [{'path': str(DRIVER.relative_to(ROOT)), 'sha256': hashlib.sha256(DRIVER.read_bytes()).hexdigest()}]
                     + [{'path': str(Path(row['path']).relative_to(ROOT)), 'sha256': row['sha256']}
                        for row in rows.values()]}
(EVIDENCE / 'result.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
