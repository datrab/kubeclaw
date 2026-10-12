import json
import os
from pathlib import Path
import subprocess

root = Path.cwd()
ev = root / 'docs/review/evidence/native-source-cleanup-reconciliation-20260921'
env = os.environ.copy()
env['LD_LIBRARY_PATH'] = str(root / 'node_modules/.cache/native-host-tools/root/usr/lib') + ':' + str(root / 'node_modules/.cache/native-host-tools/root/lib')
node = [str(root / 'node_modules/.cache/native-host-tools/root/usr/bin/proot'), '-b', str(root / 'node_modules/.cache/native-host-tools/root/usr/bin/flock') + ':/usr/bin/flock!', '/usr/local/bin/node']
files = ['skills/worker/core/worker/native-cleanup-reconciliation.ts', 'skills/worker/core/worker/native-attempt-recovery.ts', 'tests/verification/reliability/native-cleanup-fixture.mts', 'tests/verification/reliability/worker-native-cleanup.test.mts']
commands = [
    ('core-tests-final', node + ['--test', '--test-concurrency=1', 'tests/verification/reliability/worker-native-journal.test.mts', files[-1]], 0),
    ('core-types-final', ['node', 'node_modules/typescript/bin/tsc', '--noEmit', '-p', 'tests/verification/reliability/tsconfig.native-scope.json'], 0),
    ('core-lint-final', ['node', 'node_modules/eslint/bin/eslint.js', '--config', 'charts/kubeclaw/files/config/eslint.config.mjs', *files], 0),
    ('core-mutant-final', node + ['--import', str(ev / 'omit-archive-check.mjs'), '--test', '--test-name-pattern=bad-output|different-accounting', files[-1]], 1),
]
results = []
for name, command, expected in commands:
    with (ev / (name + '.txt')).open('w') as log:
        result = subprocess.run(command, env=env, stdout=log, stderr=subprocess.STDOUT, timeout=120)
    results.append({'name': name, 'command': command, 'exitCode': result.returncode, 'expectedExitCode': expected, 'LD_LIBRARY_PATH': env['LD_LIBRARY_PATH']})
    (ev / 'core-commands.json').write_text(json.dumps(results, indent=2) + '\n')
    if result.returncode != expected:
        raise SystemExit(f'{name}: unexpected exit {result.returncode}')
