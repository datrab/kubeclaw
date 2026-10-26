// Exact documented shell control, tested with the real pinned validator and toy
// schemas. Fixture rendering is not KubeClaw rendering or deployment approval.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const guide = fs.readFileSync(path.join(root, 'docs/site/use/install.md'), 'utf8');
const marker = guide.indexOf('schema_expected_version=');
assert(marker > 0, 'the documented strict schema step must exist');
const start = guide.lastIndexOf('```bash\n', marker) + '```bash\n'.length;
const end = guide.indexOf('\n```', marker);
const block = guide.slice(start, end);
assert(block.startsWith('(\n') && block.endsWith(')'), 'test the complete documented subshell');
const quote = value => `'${value.replaceAll("'", "'\"'\"'")}'`;
function executable(name) {
  const result = spawnSync('bash', ['-c', `command -v ${name}`], { encoding: 'utf8' });
  assert.equal(result.status, 0, `${name} is a declared prerequisite, not an optional skipped test`);
  return result.stdout.trim();
}
const validator = executable('kubeconform');
const mktemp = executable('mktemp');
const toySchema = {
  $schema: 'http://json-schema.org/draft-04/schema#', type: 'object',
  additionalProperties: false, required: ['apiVersion', 'kind', 'metadata'],
  properties: {
    apiVersion: { enum: ['v1'] }, kind: { enum: ['ConfigMap'] },
    metadata: { type: 'object', required: ['name'], additionalProperties: false,
      properties: { name: { type: 'string' } } },
    data: { type: 'object', additionalProperties: { type: 'string' } },
  },
};
const manifest = 'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: schema-fixture-__ROLE__\ndata:\n  example: value\n';
const renderer = `bound_deploy() {
  test "$1" = render || return 36
  printf '%s\\n' "$2" >> "$SCHEMA_TEST_TRACE/roles"
  if [[ $SCHEMA_TEST_MODE == render-failure && $2 == buster ]]; then return 37; fi
  if [[ $SCHEMA_TEST_MODE == zero-resource ]]; then printf '# no resources\\n'; return; fi
  if [[ $SCHEMA_TEST_MODE == invalid && $2 == buster ]]; then
    sed "s/__ROLE__/$2/g" "$SCHEMA_TEST_FIXTURES/invalid.yaml"
  else
    sed "s/__ROLE__/$2/g" "$SCHEMA_TEST_FIXTURES/valid.yaml"
  fi
}
`;

await test('documented strict schema step: finite local CLI/control fixtures', async t => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-schema-step-test-'));
  const owned = [];
  try {
    fs.writeFileSync(path.join(temporary, 'schema.json'), JSON.stringify(toySchema));
    fs.writeFileSync(path.join(temporary, 'valid.yaml'), manifest);
    fs.writeFileSync(path.join(temporary, 'invalid.yaml'), manifest.replace(
      '  name: schema-fixture-__ROLE__', '  name: first-name\n  name: schema-fixture-__ROLE__'));
    const cases = [
      ['two selected roles', 'valid', 'false', true],
      ['three selected roles', 'valid', 'true', true],
      ['duplicate resource keys fail strict validation', 'invalid', 'false', false],
      ['zero resources fail', 'zero-resource', 'false', false],
      ['missing schema fails', 'missing-schema', 'false', false],
      ['render failure stops', 'render-failure', 'false', false],
      ['wrong validator version stops before rendering', 'wrong-version', 'false', false],
      ['missing schema selection stops before rendering', 'missing-input', 'false', false],
      ['missing validator stops before rendering', 'missing-validator', 'false', false],
    ];
    for (const [name, mode, prism, success] of cases) {
      await t.test(name, () => {
        const directory = path.join(temporary, mode === 'valid' ? `valid-${prism}` : mode);
        const bin = path.join(directory, 'bin');
        const trace = path.join(directory, 'trace');
        fs.mkdirSync(bin, { recursive: true });
        fs.mkdirSync(trace);
        const logCreation = `const fs=require('node:fs');const p=process.argv[1];fs.appendFileSync(process.env.SCHEMA_TEST_TRACE+'/created',JSON.stringify({path:p,mode:fs.statSync(p).mode&0o777})+'\\n');`;
        fs.writeFileSync(path.join(bin, 'mktemp'), `#!/bin/bash\nset -eu\np="$(${quote(mktemp)} "$@")"\n${quote(process.execPath)} -e ${quote(logCreation)} "$p"\nprintf '%s\\n' "$p"\n`, { mode: 0o755 });
        if (mode !== 'missing-validator') {
          fs.writeFileSync(path.join(bin, 'kubeconform'), `#!/bin/bash\nif [[ $SCHEMA_TEST_MODE == wrong-version && \${1:-} == -v ]]; then printf 'v0.0.0\\n'; exit; fi\nexec ${quote(validator)} "$@"\n`, { mode: 0o755 });
        }
        const env = { ...process.env, SCHEMA_TEST_MODE: mode, SCHEMA_TEST_TRACE: trace,
          SCHEMA_TEST_FIXTURES: temporary, KUBECLAW_DEPLOY_PRISM: prism,
          TARGET_KUBERNETES_VERSION: '1.30.0',
          APPROVED_SCHEMA_LOCATION: path.join(temporary, mode === 'missing-schema' ? 'absent-schema.json' : 'schema.json'),
          PATH: `${bin}:${mode === 'missing-validator' ? '/usr/bin:/bin' : process.env.PATH}`,
        };
        if (mode === 'missing-input') delete env.APPROVED_SCHEMA_LOCATION;
        const result = spawnSync('bash', ['-c', `${renderer}\n${block}`], {
          cwd: root, env, encoding: 'utf8', timeout: 30000, detached: true,
        });
        if (result.error && result.pid) {
          try { process.kill(-result.pid, 'SIGKILL'); } catch (error) {
            if (error.code !== 'ESRCH') throw error;
          }
        }
        const createdPath = path.join(trace, 'created');
        const created = fs.existsSync(createdPath)
          ? fs.readFileSync(createdPath, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
        owned.push(...created.map(row => row.path));
        assert.ifError(result.error);
        assert.equal(result.status === 0, success, `${result.stdout}\n${result.stderr}`);
        for (const row of created) {
          assert.equal(row.mode, 0o700, 'group/world must have no access; inherited setgid is not an access bit');
          assert.equal(fs.existsSync(row.path), false, 'the exact owned render/report directory must be cleaned');
        }
        const rolesPath = path.join(trace, 'roles');
        const roles = fs.existsSync(rolesPath) ? fs.readFileSync(rolesPath, 'utf8').trim().split('\n') : [];
        if (success) assert.deepEqual(roles, prism === 'true' ? ['nova', 'buster', 'prism'] : ['nova', 'buster']);
        if (['wrong-version', 'missing-input', 'missing-validator'].includes(mode)) {
          assert.deepEqual(roles, []);
          assert.deepEqual(created, []);
        }
      });
    }
  } finally {
    for (const directory of owned) {
      assert.equal(path.dirname(directory), '/tmp');
      assert(path.basename(directory).startsWith('kubeclaw-schema-check.'));
      fs.rmSync(directory, { recursive: true, force: true });
    }
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
