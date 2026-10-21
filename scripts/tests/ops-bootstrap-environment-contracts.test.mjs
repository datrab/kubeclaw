import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runtimeConsumerContract, assertRuntimeConsumerContract, maintainedEnvironmentBindings } from '../docs-runtime-consumer-contracts.mjs';

const source = 'ops/pod/bootstrap.py';
const bootstrap = fileURLToPath(new URL('../../ops/pod/bootstrap.py', import.meta.url));
const names = ['OPS_GITHUB_TOKEN_FILE', 'OPS_TAILSCALE_AUTHKEY_FILE'];
// Executes the unchanged Python functions. Only the subprocess boundary is
// replaced: no kubectl/cluster writes occur. Files contain synthetic fixtures;
// output records names, keys and comparisons, never submitted credential data.
const harness = String.raw`
import contextlib, io, json, os, runpy, subprocess, sys, tempfile
from pathlib import Path
from types import SimpleNamespace
spec = json.loads(sys.argv[2])
os.environ.clear()
os.environ.update(KUBE_CONTEXT='unit-context', OPS_NAMESPACE='unit-ops')
module = runpy.run_path(sys.argv[1])
applied = []
def run(args, input=None, **kwargs):
    assert args[:4] == ['kubectl', '--context', 'unit-context', '--request-timeout=20s']
    if args[4] == 'get':
        assert args[5] == 'secret'
        exists = spec.get('existing', True) or args[-2:] == ['-n', 'kubeclaw']
        return SimpleNamespace(returncode=0, stdout=json.dumps({'type':'Opaque','data':{}}) if exists else '', stderr='')
    assert args[4:] == ['apply', '-f', '-']
    data = json.loads(input)
    assert data['apiVersion'] == 'v1' and data['kind'] == 'Secret' and data['type'] == 'Opaque'
    assert data['metadata']['namespace'] == 'unit-ops'
    values = data.get('stringData', {})
    applied.append({'name':data['metadata']['name'], 'keys':list(values),
                    'contentMatches':all(v == 'synthetic credential\ninside' for v in values.values())})
    failed = data['metadata']['name'] == spec.get('failApply')
    return SimpleNamespace(returncode=1 if failed else 0, stdout='', stderr='confidential-stderr-sentinel')
subprocess.run = run
with tempfile.TemporaryDirectory() as directory:
    os.chdir(directory)
    original_read_text = Path.read_text
    unreadable = set()
    def read_text(path, *args, **kwargs):
        if str(path) in unreadable: raise PermissionError('synthetic permission denial')
        return original_read_text(path, *args, **kwargs)
    Path.read_text = read_text
    for index, setting in enumerate(spec.get('files', [])):
        variable = ['OPS_GITHUB_TOKEN_FILE','OPS_TAILSCALE_AUTHKEY_FILE'][index]
        if setting == 'absent': continue
        if setting == 'empty-env': os.environ[variable] = ''; continue
        path = Path(' credential-%d ' % index)
        if setting == 'whitespace-path': path = Path('   ')
        if setting == 'directory': path.mkdir()
        elif setting == 'bad-encoding': path.write_bytes(bytes([255]))
        elif setting != 'missing': path.write_text(' \t\n' if setting == 'empty-file' else '\t synthetic credential\ninside \n')
        if setting == 'unreadable': unreadable.add(str(path))
        os.environ[variable] = str(path)
    error = None
    output = io.StringIO()
    try:
        with contextlib.redirect_stdout(output): module['setup_secrets']()
    except (Exception, SystemExit) as caught:
        error = {'type': type(caught).__name__, 'emptyCredential': 'contains an empty credential' in str(caught),
                 'genericKubectl': str(caught) == 'kubectl failed during Ops Pod setup; check context, permissions and named resource availability',
                 'stderrLeaked': 'confidential-stderr-sentinel' in str(caught)}
    print(json.dumps({'applied':applied,'error':error,'completed': 'Ops credentials prepared' in output.getvalue()}))
`;
function execute(spec) {
  const result = spawnSync('python3', ['-I', '-c', harness, bootstrap, JSON.stringify(spec)], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('credential contracts bind only the exact owning bootstrap source', () => {
  for (const name of names) {
    const contract = runtimeConsumerContract(name, source);
    assertRuntimeConsumerContract(contract, `${name}:${source}`);
    assert.equal(contract.owner, source);
    assert.match(contract.required, /optional.*required when.*non-empty/);
    assert.match(contract.acceptedForm, /relative paths use the current working directory/);
    assert.match(contract.impact, /confidential Secret payload/);
    assert.match(contract.failure, /not rolled back/);
    assert.equal(runtimeConsumerContract(name, 'ops/pod/new-bootstrap.py'), null);
    assert.equal(maintainedEnvironmentBindings.has(`${name}:ops/pod/new-bootstrap.py`), false);
    assert.throws(() => assertRuntimeConsumerContract(null, `${name}:ops/pod/new-bootstrap.py`), /missing consumer contract/);
  }
  assert.equal(runtimeConsumerContract('OPS_NEW_CREDENTIAL_FILE', source), null);
});

test('every other actual bootstrap environment reader already has an exact binding', () => {
  for (const name of ['OPS_NAMESPACE', 'OPS_READ_NAMESPACES', 'OPS_COPY_PULL_SECRET', 'OPS_PULL_SECRET_SOURCE_NAMESPACE']) {
    assertRuntimeConsumerContract(runtimeConsumerContract(name, source), `${name}:${source}`);
  }
  assert.equal(maintainedEnvironmentBindings.has(`KUBE_CONTEXT:${source}`), true);
});

test('absent and empty environment selectors skip credential applies', () => {
  for (const files of [['absent', 'absent'], ['empty-env', 'empty-env']]) {
    assert.deepEqual(execute({ files }), { applied: [], error: null, completed: true });
  }
});

test('actual finite bindings apply stripped content with internal whitespace retained', () => {
  const result = execute({ files: ['valid', 'valid'] });
  assert.deepEqual(result.applied, [
    { name: 'codex-ops-github', keys: ['token'], contentMatches: true },
    { name: 'codex-ops-tailscale', keys: ['authkey'], contentMatches: true },
  ]);
  assert.equal(result.error, null);
  assert.equal(result.completed, true);
});

test('a whitespace path is read unchanged instead of treated as an omitted selector', () => {
  assert.deepEqual(execute({ files: ['whitespace-path', 'absent'] }).applied,
    [{ name: 'codex-ops-github', keys: ['token'], contentMatches: true }]);
});

test('whitespace-only content stops each credential branch without a credential apply', () => {
  for (const files of [['empty-file', 'absent'], ['absent', 'empty-file']]) {
    const result = execute({ files });
    assert.deepEqual(result.applied, []);
    assert.equal(result.error.type, 'SystemExit');
    assert.equal(result.error.emptyCredential, true);
    assert.equal(result.completed, false);
  }
});

test('file errors stop reading; permission denial is injected at read_text for a deterministic fixture', () => {
  for (const [setting, type] of [['missing', 'FileNotFoundError'], ['directory', 'IsADirectoryError'], ['bad-encoding', 'UnicodeDecodeError'], ['unreadable', 'PermissionError']]) {
    const result = execute({ files: [setting, 'absent'] });
    assert.deepEqual(result.applied, []);
    assert.equal(result.error.type, type);
    assert.equal(result.completed, false);
  }
});

test('late file failures preserve evidence of earlier bearer, pull and GitHub operations', () => {
  const result = execute({ existing: false, files: ['valid', 'empty-file'] });
  assert.deepEqual(result.applied.map(item => item.name), ['codex-ops-bearer', 'ghcr-secret', 'codex-ops-github']);
  assert.equal(result.error.emptyCredential, true);
  assert.equal(result.completed, false);
});

test('actual kubectl failure suppresses submitted-object stderr and stops the later branch', () => {
  const result = execute({ files: ['valid', 'valid'], failApply: 'codex-ops-github' });
  assert.deepEqual(result.applied.map(item => item.name), ['codex-ops-github']);
  assert.equal(result.error.genericKubectl, true);
  assert.equal(result.error.stderrLeaked, false);
  assert.equal(result.completed, false);
});
