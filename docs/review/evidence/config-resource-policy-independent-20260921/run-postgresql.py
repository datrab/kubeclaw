"""Disposable original PostgreSQL + original operation journal test, no live host."""
from pathlib import Path
import hashlib
import json
import os
import socket
import subprocess
import tempfile
import tarfile

repository = Path.cwd().resolve()
evidence = repository / 'docs/review/evidence/config-resource-policy-independent-20260921/postgresql'
evidence.mkdir(parents=True, exist_ok=True)
tools = repository / 'node_modules/.cache/prism-postgresql-20260921/root'
native = repository / 'node_modules/.cache/native-host-tools/root'
binary = tools / 'usr/libexec/postgresql18'
environment = dict(os.environ)
environment.update({
    'PATH': str(binary) + ':' + environment['PATH'],
    'LD_LIBRARY_PATH': ':'.join(str(p) for p in [tools / 'usr/lib', tools / 'lib', native / 'usr/lib', native / 'lib']),
    'ICU_DATA': str(tools / 'usr/share/icu/78.1'),
    'SWARM_CONFIG': str(repository / 'charts/kubeclaw/files/config/swarm.config.json'),
})
with socket.socket() as reservation:
    reservation.bind(('127.0.0.1', 0))
    port = reservation.getsockname()[1]
environment.pop('PGOPTIONS', None)
environment['PRISM_NATIVE_OPERATION_TEST_ADMIN_URL'] = f'postgresql://node@127.0.0.1:{port}/postgres'
workspace = Path(tempfile.mkdtemp(prefix='prism-operation-postgresql-'))
data = workspace / 'data'
source_roots = ['skills', 'contracts', 'tests/fixtures', 'tests/verification/reliability', 'tests/verification/deployment', 'charts/kubeclaw/files/config', 'charts/prism', 'package.json', 'package-lock.json', 'tsconfig.base.json']
def source_hashes():
    names = subprocess.check_output(['git', 'ls-files', '-co', '--exclude-standard', '--', *source_roots], text=True).splitlines()
    return {name: hashlib.sha256((repository / name).read_bytes()).hexdigest() for name in sorted(set(names)) if (repository / name).is_file()}
before = source_hashes()
with tarfile.open(evidence / 'tested-source.tar.gz', 'w:gz') as archive:
    for name in before:
        archive.add(repository / name, arcname=name, recursive=False)
started = False
result = None
try:
    with (evidence / 'server-setup.txt').open('w') as output:
        subprocess.run([str(binary / 'postgres'), '--version'], env=environment, stdout=output, stderr=subprocess.STDOUT, check=True)
        subprocess.run([str(binary / 'initdb'), '-D', str(data), '--auth=trust', '--no-locale', '--encoding=UTF8',
                        '-L', str(tools / 'usr/share/postgresql18')], env=environment, stdout=output, stderr=subprocess.STDOUT, check=True)
        options = f'-h 127.0.0.1 -p {port} -k {workspace} -c dynamic_library_path={tools}/usr/lib/postgresql18 -c extension_control_path={tools}/usr/share/postgresql18'
        subprocess.run([str(binary / 'pg_ctl'), '-D', str(data), '-l', str(evidence / 'server.txt'),
                        '-o', options, '-w', 'start'], env=environment, stdout=output, stderr=subprocess.STDOUT, check=True)
        started = True
    test = 'skills/prism/tests/native/operation-journal.mts'
    command = [str(native / 'usr/bin/proot'), '-b', str(native / 'usr/bin/flock') + ':/usr/bin/flock!',
               '/usr/local/bin/node', '--test', test]
    with (evidence / 'operation-journal.txt').open('w') as output:
        result = subprocess.run(command, env=environment, stdout=output, stderr=subprocess.STDOUT, timeout=360)
    after = source_hashes()
    (evidence / 'run.json').write_text(json.dumps({'command': command, 'port': port, 'dataDirectory': str(data),
        'returnCode': result.returncode, 'sourceSha256Before': before, 'sourceSha256After': after, 'sourceUnchanged': before == after, 'uid': os.getuid(),
        'boundary': 'Actual PostgreSQL, original SQL/journal code; no native worker or cgroup proof'}, indent=2) + '\n')
finally:
    if started:
        with (evidence / 'server-stop.txt').open('w') as output:
            subprocess.run([str(binary / 'pg_ctl'), '-D', str(data), '-m', 'fast', '-w', 'stop'],
                           env=environment, stdout=output, stderr=subprocess.STDOUT, check=True)
if result is not None:
    raise SystemExit(result.returncode if before == after else 99)
