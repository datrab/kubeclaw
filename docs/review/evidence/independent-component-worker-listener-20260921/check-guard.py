"""Explicit review-slot execution only; all test effects are private temporary files."""
import json, os, pathlib, subprocess, tempfile
harness = pathlib.Path(__file__).resolve().parent
results = []
for enabled in [True, False]:
    with tempfile.TemporaryDirectory(prefix='component-review-guard-') as folder:
        root = pathlib.Path(folder)
        source = root / 'original'; source.write_text('original')
        (root / 'alias').symlink_to(source)
        os.link(source, root / 'hardlink')
        info = source.stat()
        manifest = root / 'protected.json'
        manifest.write_text(json.dumps([{'path': str(source), 'dev': str(info.st_dev), 'ino': str(info.st_ino)}]))
        environment = dict(os.environ, REVIEW_GUARD_FIXTURE=str(root), COMPONENT_REVIEW_PROTECTED_SOURCES=str(manifest), COMPONENT_REVIEW_WRITE_VIOLATIONS=str(root / 'violations.jsonl'))
        environment.pop('NODE_OPTIONS', None)
        command = ['node'] + (['--import', str(harness / 'source-write-guard.mjs')] if enabled else []) + [str(harness / 'guard-probe-child.mjs')]
        result = subprocess.run(command, env=environment, capture_output=True, text=True)
        expected = 0 if enabled else 1
        if result.returncode != expected or (not enabled and 'Missing expected exception' not in result.stderr):
            raise RuntimeError(f'REVIEW_GUARD_ORACLE_FAILED:{enabled}:{result.stdout}:{result.stderr}')
        rows = (root / 'violations.jsonl').read_text().splitlines() if (root / 'violations.jsonl').exists() else []
        if enabled and len(rows) != 2:
            raise RuntimeError('REVIEW_GUARD_EXPECTED_TWO_ALIAS_VIOLATIONS')
        results.append({'guardEnabled':enabled, 'exitCode':result.returncode, 'stdout':result.stdout, 'stderr':result.stderr, 'violations':rows})
print(json.dumps(results, indent=2))
