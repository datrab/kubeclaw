from pathlib import Path
import subprocess, uuid, json
root = Path.cwd()
suffix = uuid.uuid4().hex
config = root / f'skills/prism/server/worker-config-mutant-{suffix}.ts'
test = root / f'skills/prism/tests/swarm-input-limit-mutant-{suffix}.test.mts'
evidence = root / 'docs/review/evidence/config-input-limit-20260921'
try:
    original = (root / 'skills/prism/server/worker-config.ts').read_text()
    needle = 'maximumInputBytes: settings.maximumInputBytes'
    assert original.count(needle) == 1
    config.write_text(original.replace(needle, 'maximumInputBytes: 16777216'))
    tests = (root / 'skills/prism/tests/swarm-input-limit.test.mts').read_text()
    test.write_text(tests.replace("'../server/worker-config.ts'", f"'../server/{config.name}'"))
    result = subprocess.run(['node', '--test', str(test)], cwd=root, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=60)
    (evidence / 'mutation.txt').write_text(result.stdout)
    (evidence / 'mutation-result.json').write_text(json.dumps({'mutation':'restore former input default in production ingress resolver', 'exitCode':result.returncode, 'scope':'temporary resolver copy and unchanged input-limit tests except resolver import'},indent=2)+'\n')
    assert result.returncode != 0
    assert 'within budget reaches real authentication' not in result.stdout or 'AssertionError' in result.stdout
    assert 'ERR_MODULE_NOT_FOUND' not in result.stdout
finally:
    config.unlink(missing_ok=True)
    test.unlink(missing_ok=True)
