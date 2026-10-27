#!/usr/bin/env python3
"""Run the exact published retention query in one private native PG fixture.

Requires explicitly prepared PostgreSQL binaries. No download, TCP listener,
product credentials, target database, backup or recovery workflow is used.
"""
import argparse
import csv
import hashlib
import io
import json
import os
from pathlib import Path
import pwd
import re
import shutil
import subprocess
import tempfile


def sha(value):
    return hashlib.sha256(value).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--postgres-bin-dir', required=True)
    parser.add_argument('--library-path', default='')
    parser.add_argument('--output-json', required=True)
    options = parser.parse_args()
    root = Path(__file__).resolve().parents[3]
    bindir = Path(options.postgres_bin_dir).resolve(strict=True)
    binaries = {name: bindir / name for name in ['postgres', 'initdb', 'pg_ctl', 'psql']}
    assert all(file.is_file() for file in binaries.values())
    source = root / 'docs/site/understand/data-and-state.md'
    bodies = re.findall(r"<<'SQL'\n(.*?)^SQL\s*$", source.read_text(), re.M | re.S)
    assert len(bodies) == 1, 'exact published quoted SQL payload required'
    sql = bodies[0]
    schema_file = root / 'tests/fixtures/litellm-database/schema.sql'
    provenance_file = root / 'tests/fixtures/litellm-database/provenance.json'
    provenance = json.loads(provenance_file.read_text())
    assert sha(schema_file.read_bytes()) == provenance['schemaSqlSha256']
    if os.getuid() == 0:
        status = Path('/proc/self/status').read_text()
        capabilities = int(re.search(r'^CapEff:\s+([0-9a-f]+)$', status, re.M)[1], 16)
        required = sum(1 << bit for bit in [0, 1, 3, 6, 7])
        assert capabilities & required == required, (
            'Native PostgreSQL requires a genuine non-root caller or an owner able to '
            'create/chown its private fixture and legitimately drop child privileges; '
            'no root-check spoofing or unprivileged substitute is supported')
    parent = root / '.tmp'
    parent.mkdir(exist_ok=True)
    assert not parent.is_symlink() and parent.is_dir()
    temporary = Path(tempfile.mkdtemp(prefix='published-retention-sql-', dir=parent))
    owner = pwd.getpwnam('node') if os.getuid() == 0 else pwd.getpwuid(os.getuid())
    assert owner.pw_uid != 0, 'PostgreSQL fixture must run as a genuine non-root owner'
    try:
        os.chown(temporary, owner.pw_uid, owner.pw_gid)
        socket = temporary / 'socket'
        socket.mkdir(mode=0o700)
        os.chown(socket, owner.pw_uid, owner.pw_gid)
    except Exception:
        shutil.rmtree(temporary)
        raise
    data = temporary / 'data'
    environment = {'PATH': f'{bindir}:/usr/bin:/bin', 'HOME': str(temporary),
                   'LANG': 'C.UTF-8', 'TZ': 'UTC', 'PGPASSFILE': '/dev/null'}
    if options.library_path:
        environment['LD_LIBRARY_PATH'] = options.library_path

    def drop_privileges():
        if os.getuid() == 0:
            os.setgroups([])
            os.setgid(owner.pw_gid)
            os.setuid(owner.pw_uid)

    def command(argv, content=None, check=True, timeout=30):
        return subprocess.run([str(value) for value in argv], input=content, text=True,
                              capture_output=True, check=check, timeout=timeout,
                              cwd=temporary, env=environment, preexec_fn=drop_privileges)

    def psql(text, reader=False, check=True):
        return command([binaries['psql'], '--no-psqlrc', '--set=ON_ERROR_STOP=1',
                        '--host', socket, '--port', '25432', '--username',
                        'docs_reader' if reader else owner.pw_name,
                        '--dbname', 'postgres', '--csv'], text, check=check)

    result = {'schemaVersion': 'kubeclaw-native-retention-sql-assertion.v1',
              'sqlSha256': sha(sql.encode()), 'fullSchemaSha256': sha(schema_file.read_bytes()),
              'provenanceSha256': sha(provenance_file.read_bytes()),
              'harnessSha256': sha(Path(__file__).read_bytes()),
              'binaries': {name: {'sha256': sha(file.read_bytes())} for name, file in binaries.items()},
              'cases': [], 'cleanup': {'complete': False}, 'targetDatabaseOrDeploymentUsed': False}
    failure = None
    try:
        command([binaries['initdb'], '-D', data, '--username', owner.pw_name,
                 '--auth-local=peer', '--auth-host=reject', '--encoding=UTF8', '--locale=C.UTF-8'], timeout=60)
        (data / 'pg_hba.conf').write_text('local all docs_reader peer map=docs_reader_map\n'
                                         f'local all {owner.pw_name} peer\n')
        (data / 'pg_ident.conf').write_text(f'docs_reader_map {owner.pw_name} docs_reader\n')
        for file in [data / 'pg_hba.conf', data / 'pg_ident.conf']:
            os.chown(file, owner.pw_uid, owner.pw_gid)
            file.chmod(0o600)
        server_options = (f"-k {socket} -p 25432 -c listen_addresses='' -c unix_socket_permissions=0700 "
                          '-c shared_buffers=16MB -c max_connections=8 -c jit=off')
        command([binaries['pg_ctl'], '-D', data, '-l', temporary / 'postgres.log',
                 '-w', '-t', '15', '-o', server_options, 'start'])
        pid = int((data / 'postmaster.pid').read_text().splitlines()[0])
        assert Path(f'/proc/{pid}').stat().st_uid == owner.pw_uid
        assert str(data).encode() in Path(f'/proc/{pid}/cmdline').read_bytes()
        identity = psql("SELECT current_setting('server_version_num'), current_setting('listen_addresses'), "
                        "inet_server_addr() IS NULL, current_setting('unix_socket_directories');\n").stdout
        values = list(csv.reader(io.StringIO(identity)))[1]
        assert values[0] == '180006' and values[1] == '' and values[2] == 't' and values[3] == str(socket)
        result.update(serverVersionNum=values[0], nonRootUid=owner.pw_uid, tcpListeners=False,
                      localPeerAuthentication=True, fullSchemaLoaded=True)
        psql(schema_file.read_text())
        psql('CREATE ROLE docs_reader LOGIN; GRANT USAGE ON SCHEMA public TO docs_reader; '
             'GRANT SELECT ON TABLE public."LiteLLM_Config" TO docs_reader;\n')
        assert 'docs_reader' in psql('SELECT current_user;\n', reader=True).stdout
        keys = ['maximum_autorouter_session_retention_period', 'maximum_health_check_retention_period',
                'maximum_spend_logs_retention_period']

        def execute_case(name, setting, expected):
            setup = 'TRUNCATE public."LiteLLM_Config";\n'
            if setting != 'ABSENT':
                literal = 'NULL' if setting == 'SQL_NULL' else "'" + json.dumps(setting).replace("'", "''") + "'::jsonb"
                setup += 'INSERT INTO public."LiteLLM_Config" (param_name,param_value) VALUES (\'general_settings\',' + literal + ');\n'
            psql(setup)
            output = psql(sql, reader=True).stdout
            lines = list(csv.reader(io.StringIO(output)))
            assert ['BEGIN'] in lines and ['SET'] in lines and ['ROLLBACK'] in lines
            assert ['transaction_read_only'] in lines and ['on'] in lines
            header = ['key', 'record_has_value', 'record_type', 'key_present', 'value_type', 'retention_value']
            index = lines.index(header)
            actual = lines[index + 1:index + 4]
            assert [row[0] for row in actual] == keys
            assert [row[1:] for row in actual] == expected, (name, actual)
            result['cases'].append({'name': name, 'readOnly': True, 'rows': actual, 'rollbackObserved': True})

        absent = [['f', '', 'f', '', '[absent or withheld]']] * 3
        execute_case('absent-record', 'ABSENT', absent)
        execute_case('sql-null', 'SQL_NULL', absent)
        execute_case('json-null', None, [['t', 'null', 'f', '', '[absent or withheld]']] * 3)
        execute_case('absent-object-keys', {}, [['t', 'object', 'f', '', '[absent or withheld]']] * 3)
        execute_case('valid-integer-duration-and-null', dict(zip(keys, ['7d', None, 123])),
                     [['t', 'object', 't', 'string', '7d'], ['t', 'object', 't', 'null', 'null'],
                      ['t', 'object', 't', 'number', '123']])
        execute_case('unexpected-values-withheld', dict(zip(keys, ['-1d', {'nested': 1}, 1.5])),
                     [['t', 'object', 't', kind, '[absent or withheld]'] for kind in ['string', 'object', 'number']])
        execute_case('non-object-stop-observation', [1], [['t', 'array', 'f', '', '[absent or withheld]']] * 3)
        rejected = psql(sql.replace('param_value::jsonb', 'missing_param_value::jsonb'), reader=True, check=False)
        assert rejected.returncode != 0 and 'missing_param_value' in rejected.stderr and 'does not exist' in rejected.stderr
        result['negative'] = {'nativeUnknownColumnRejected': True, 'exitCode': rejected.returncode}
        execute_case('restored-exact-query', {}, [['t', 'object', 'f', '', '[absent or withheld]']] * 3)
        result['ok'] = True
    except Exception as error:
        failure = error
        result['ok'] = False
        result['failure'] = str(error)
        if isinstance(error, subprocess.CalledProcessError):
            result['nativeFailureOutput'] = {'stdout': error.stdout, 'stderr': error.stderr}
        log = temporary / 'postgres.log'
        if log.exists():
            result['serverFailureLog'] = log.read_text()
    finally:
        try:
            pidfile = data / 'postmaster.pid'
            if pidfile.exists():
                pid = int(pidfile.read_text().splitlines()[0])
                proc = Path(f'/proc/{pid}')
                if proc.exists():
                    assert proc.stat().st_uid == owner.pw_uid
                    assert str(data).encode() in (proc / 'cmdline').read_bytes()
                    command([binaries['pg_ctl'], '-D', data, '-w', '-t', '15', '-m', 'fast', 'stop'])
            assert not pidfile.exists(), 'fixture server stop incomplete'
            shutil.rmtree(temporary)
            result['cleanup'] = {'complete': True, 'onlyOwnedClusterRemoved': True, 'serverStopped': True}
        except Exception as error:
            result['cleanup'] = {'complete': False, 'retainedOwnedPath': str(temporary), 'failure': str(error)}
            result['ok'] = False
            failure = failure or error
        Path(options.output_json).write_text(json.dumps(result, indent=2) + '\n')
    if failure:
        raise failure
    print(json.dumps({'ok': result['ok'], 'serverVersionNum': result['serverVersionNum'],
                      'cases': len(result['cases']), 'nativeNegative': True, 'cleanup': result['cleanup']}))


if __name__ == '__main__':
    main()
