"""Actual historical checker final-root controls in a private checkout.

Only the two authority-selection files are changed, after processing and just
before the real final root reread. Shared hardlinks are never written: mutable
root paths are detached first. No production/canonical original is modified.
"""
import contextlib
import hashlib
import io
import json
import os
from pathlib import Path
import runpy
import shutil
import sys
import tempfile

original_root = Path.cwd()
output = Path(__file__).resolve().parent/'root-end-controls-04'
output.mkdir(exist_ok=True)
checker_path = 'docs/review/evidence/config-acceptance/author/check-matrix.py'
root_paths = {'inventory': 'docs/review/remediation/config-semantic-inventory.json',
              'matrix': 'docs/review/remediation/config-acceptance-matrix.json'}
original_shas = {p: hashlib.sha256((original_root/p).read_bytes()).hexdigest() for p in root_paths.values()}
results = []
with tempfile.TemporaryDirectory(prefix='c0-root-end-', dir=original_root.parent) as directory:
    private = Path(directory)/'checkout'
    shutil.copytree(original_root, private, copy_function=os.link, symlinks=True,
                    ignore=shutil.ignore_patterns('.git', 'node_modules', '__pycache__'))
    for path in root_paths.values():
        file = private/path
        data = file.read_bytes()
        file.unlink()
        file.write_bytes(data)
    sys.path.insert(0, str(private/Path(checker_path).parent))
    os.chdir(private)
    from definition_generation import DefinitionRoots
    real_end = DefinitionRoots.assert_no_drift
    for selection in ('canonical', 'explicit'):
        selected = dict(root_paths)
        if selection == 'explicit':
            for label, path in root_paths.items():
                selected[label] = 'private-'+label+'.json'
                shutil.copyfile(private/path, private/selected[label])
        for label, selected_path in selected.items():
            target = private/selected_path
            raw = target.read_bytes()
            for change in ('byte-change', 'same-byte-target-change'):
                called = []
                def final_end(self):
                    if not called:
                        called.append(True)
                        if change == 'byte-change':
                            target.write_bytes(raw+b' ')
                        else:
                            sibling = target.with_suffix('.retained')
                            target.rename(sibling)
                            target.symlink_to(sibling.name)
                    return real_end(self)
                DefinitionRoots.assert_no_drift = final_end
                sys.argv = [checker_path, '--structural']
                if selection == 'explicit':
                    sys.argv += ['--inventory', selected['inventory'], '--matrix', selected['matrix']]
                stdout, stderr = io.StringIO(), io.StringIO()
                try:
                    with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                        try:
                            runpy.run_path(str(private/checker_path), run_name='__main__')
                        except SystemExit as error:
                            exit_code = error.code
                    report = json.loads(stdout.getvalue())
                    expected = 'REVIEW_INPUT_CHANGED:'+selected_path
                    assert called and exit_code == 1 and expected in report['errors'], report
                    name = selection+'-'+label+'-'+change
                    (output/(name+'.stdout')).write_text(stdout.getvalue())
                    (output/(name+'.stderr')).write_text(stderr.getvalue())
                    results.append({'id': name, 'result': 'passed', 'exitCode': exit_code, 'boundary': expected})
                finally:
                    DefinitionRoots.assert_no_drift = real_end
                    if target.is_symlink():
                        target.unlink()
                        target.with_suffix('.retained').rename(target)
                    target.write_bytes(raw)
        sys.argv = [checker_path, '--structural']
        if selection == 'explicit':
            sys.argv += ['--inventory', selected['inventory'], '--matrix', selected['matrix']]
        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            try:
                runpy.run_path(str(private/checker_path), run_name='__main__')
            except SystemExit as error:
                assert error.code == 0
        report = json.loads(stdout.getvalue())
        assert report['errorCount'] == 0 and report['settings'] == 2409 and report['cases'] == 6845
        (output/(selection+'-restored.stdout')).write_text(stdout.getvalue())
        results.append({'id': selection+'-restored', 'result': 'passed', 'exitCode': 0})
    os.chdir(original_root)
for path, digest in original_shas.items():
    assert hashlib.sha256((original_root/path).read_bytes()).hexdigest() == digest
print(json.dumps({'controls': results, 'passed': len(results), 'failed': 0,
                  'originalRootsUnchanged': original_shas, 'globalC0Accepted': False,
                  'qualification': 'actual historical checker final-root rejection and restored controls only'}, indent=2))
