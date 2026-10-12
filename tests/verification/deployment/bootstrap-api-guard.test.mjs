import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

// These CLI fixtures exercise the original shell entry point, not a real API.
function setupScenario(lookupStatus, lookupOutput, createStatus = 0) {
  const directory = mkdtempSync(join(tmpdir(), 'bootstrap-api-'));
  const calls = join(directory, 'calls');
  writeFileSync(calls, '');
  for (const command of ['kubectl', 'helm']) {
    writeFileSync(join(directory, command), `#!/bin/sh
printf '%s %s\\n' '${command}' "$*" >> "$CALLS"
if [ '${command}' = helm ]; then exit 0; fi
case "$1 $2" in
  'get namespaces')
    if [ "$LOOKUP_STATUS" = 0 ]; then printf '%s' "$LOOKUP_OUTPUT";
    else printf '%s' "$LOOKUP_OUTPUT" >&2; fi
    exit "$LOOKUP_STATUS" ;;
  'create namespace') exit "$CREATE_STATUS" ;;
  *) exit 92 ;;
esac
`, { mode: 0o755 });
  }
  try {
    const result = spawnSync('bash', [resolve('scripts/deploy.sh'), 'setup'], {
      encoding: 'utf8', timeout: 10000,
      env: { ...process.env, PATH: `${directory}:${process.env.PATH}`,
        NAMESPACE: 'guard-test', KUBECLAW_WORKSPACE_PROMPT: 'false',
        KUBECLAW_RUN_SECRET_SETUP: 'false', CALLS: calls,
        LOOKUP_STATUS: String(lookupStatus), LOOKUP_OUTPUT: lookupOutput,
        CREATE_STATUS: String(createStatus) },
    });
    assert.equal(result.error, undefined);
    return { ...result, calls: readFileSync(calls, 'utf8').trim().split('\n') };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const lookup = 'kubectl get namespaces --field-selector metadata.name=guard-test -o json';
const absent = JSON.stringify({ apiVersion: 'v1', kind: 'NamespaceList', items: [] });
const present = JSON.stringify({ apiVersion: 'v1', kind: 'NamespaceList',
  items: [{ kind: 'Namespace', metadata: { name: 'guard-test' } }] });
test('existing namespace continues without create', () => {
  const result = setupScenario(0, present);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.calls[0], lookup);
  assert.ok(result.calls.slice(1).every((call) => call.startsWith('helm repo ')));
  assert.equal(result.calls.length, 4);
});
test('kubectl generic List output is accepted', () => {
  const result = setupScenario(0, absent.replace('NamespaceList', 'List'));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.calls[1], 'kubectl create namespace guard-test');
});
test('successful empty lookup creates namespace before Helm', () => {
  const result = setupScenario(0, absent);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls.slice(0, 2), [lookup, 'kubectl create namespace guard-test']);
  assert.equal(result.calls.length, 5);
});
for (const diagnostic of [
  'exec: executable credential-helper not found',
  'Error from server (Forbidden): namespaces is forbidden',
  'The connection to the server was refused',
  'Error from server (NotFound): the server could not find the requested resource',
]) {
  test(`lookup failure stops all mutation: ${diagnostic}`, () => {
    const result = setupScenario(1, diagnostic);
    assert.equal(result.status, 1);
    assert.deepEqual(result.calls, [lookup]);
    assert.ok(result.stderr.includes(diagnostic));
  });
}
test('create failure stops before Helm without a fallback', () => {
  const result = setupScenario(0, absent, 1);
  assert.equal(result.status, 1);
  assert.deepEqual(result.calls, [lookup, 'kubectl create namespace guard-test']);
});

for (const invalid of ['', 'not json', '{}', '{"kind":"Status","code":404}',
  JSON.stringify({ apiVersion: 'v1', kind: 'NamespaceList', items: [{ metadata: { name: 'other' } }] }),
  JSON.stringify({ apiVersion: 'v1', kind: 'NamespaceList', items: [null] }),
  ...['next-page', false, 0, null].map(continuation => JSON.stringify({
    apiVersion: 'v1', kind: 'List', items: [], metadata: { continue: continuation },
  })),
]) {
  test(`invalid successful response refuses mutation: ${invalid}`, () => {
    const result = setupScenario(0, invalid);
    assert.equal(result.status, 1);
    assert.deepEqual(result.calls, [lookup]);
    assert.match(result.stderr, /Invalid namespace lookup response/);
  });
}
