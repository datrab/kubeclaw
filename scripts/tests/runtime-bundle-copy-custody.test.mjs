import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runtimeBundleCopyCustody, runtimeBundleCopyRole } from '../docs-runtime-bundle-copy-custody.mjs';

const repository = path.resolve(import.meta.dirname, '../..');
const builder = 'scripts/build-runtime-role-bundle.mjs';
const bytes = fs.readFileSync(path.join(repository, builder));
const authorityFiles = [builder, 'scripts/check-runtime-role-manifests.mjs', 'scripts/package-agent-skill-bundle.sh',
  'skills/common/plugins/openclaw-agent-observer/scripts/sync-contract.mjs',
  'packaging/runtime/package-ownership.json', 'packaging/runtime/external-capabilities.json',
  ...['nova', 'buster', 'prism'].map(role => `packaging/runtime/roles/${role}.json`)];
function fixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-copy-custody-'));
  const write = (file, content) => { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), content); };
  try {
    for (const file of authorityFiles) write(file, fs.readFileSync(path.join(repository, file)));
    const ownership = JSON.parse(fs.readFileSync(path.join(root, 'packaging/runtime/package-ownership.json')));
    for (const entry of ownership.packages) {
      if (entry.bundle.kind === 'node-package') {
        const manifest = JSON.parse(fs.readFileSync(path.join(repository, entry.source, 'package.json')));
        write(entry.source + '/package.json', JSON.stringify({ name: manifest.name, dependencies: {} }));
      }
      write(entry.source + '/passive.mjs', "throw new Error('copied code must not execute');\n");
    }
    for (const role of ['nova', 'buster', 'prism']) {
      const manifest = JSON.parse(fs.readFileSync(path.join(root, `packaging/runtime/roles/${role}.json`)));
      const owner = ownership.packages.find(entry => entry.id === manifest.entrypoint.package);
      write(owner.source + '/' + manifest.entrypoint.path, '// digest-only replaced entrypoint\n');
    }
    for (const base of ['skills/common/plugins', 'skills/nova/plugins', 'skills/buster/plugins', 'skills/prism/plugins']) {
      if (!fs.existsSync(path.join(repository, base))) continue;
      for (const entry of fs.readdirSync(path.join(repository, base), { withFileTypes: true })) {
        const directory = `${base}/${entry.name}`, file = `${directory}/plugin.json`;
        if (!entry.isDirectory() || !fs.existsSync(path.join(repository, file))) continue;
        write(file, fs.readFileSync(path.join(repository, file)));
        const node = path.join(repository, directory, 'package.json');
        if (fs.existsSync(node)) {
          const manifest = JSON.parse(fs.readFileSync(node));
          write(directory + '/package.json', JSON.stringify({ name: manifest.name, dependencies: {} }));
        }
        write(directory + '/passive.mjs', "throw new Error('plugin module must not execute');\n");
      }
    }
    write('skills/common/plugins/openclaw-agent-observer/package.json', '{"name":"fixture-observer"}');
    write('contracts/agent-observability/v1/src/index.ts', "throw new Error('canonical code must not execute');\n");
    const launcher='skills/common/plugin-runtime/foundation/isolation/plugin-sandbox';
    write(launcher, 'not an executed launcher'); fs.chmodSync(path.join(root, launcher), 0o755);
    run({ root, write, acquire: () => runtimeBundleCopyCustody(root, builder, fs.readFileSync(path.join(root, builder))) });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

test('actual complete four-domain bundle inventory is inert and never grants module or apply authority', () => {
  const result = runtimeBundleCopyCustody(repository, builder, bytes);
  assert.equal(result.role, 'non-api');
  assert.deepEqual(result.origins, ['package', 'plugin', 'extension', 'dependency']);
  assert(result.selectedFiles > 19000 && result.structuredFiles > 1000);
  assert.equal(result.runtimeImportsAuthorized, false);
  assert.equal(result.runtimeExecutionAuthorized, false);
  assert.equal(result.apiApplyAuthorized, false);
});

test('only the exact copy slot receives custody; incomplete or changed builders remain unknown', () => fixture(({ root, acquire }) => {
  const result = acquire(), role = { role: 'unknown', line: 91, sink: 'native-file-writer-call', expression: 'fs.readFileSync(source)', dependencies: [] };
  assert.equal(runtimeBundleCopyRole(role, result).role, 'non-api');
  assert.equal(runtimeBundleCopyRole(role, { ...result }), role, 'copied metadata is not acquisition authority');
  for (const changed of [{ ...role, line: 92 }, { ...role, expression: 'fs.readFileSync(process.argv[2])' }, { ...role, sink: 'console.log' }]) assert.equal(runtimeBundleCopyRole(changed, result), changed);
  assert.equal(runtimeBundleCopyCustody(root, 'tools/foreign.mjs', bytes), null);
  assert.equal(runtimeBundleCopyCustody(root, builder, Buffer.concat([bytes, Buffer.from('\n// changed')])), null);
  fs.rmSync(path.join(root, 'packaging/runtime/package-ownership.json'));
  assert.equal(acquire(), null);
}));

test('new members and changed copied code change the acquisition key, including fixtures; code stays inert', () => fixture(({ root, write, acquire }) => {
  const initial = acquire();
  write('skills/common/plugin-runtime/sdk/fixtures/passive.json', '{"value":1}');
  const added = acquire(); assert.notEqual(added.inputDigest, initial.inputDigest);
  write('skills/common/plugin-runtime/sdk/fixtures/passive.json', '{"value":2}');
  assert.notEqual(acquire().inputDigest, added.inputDigest);
  fs.rmSync(path.join(root, 'skills/common/plugin-runtime/sdk/fixtures'), { recursive: true });
  assert.equal(acquire().inputDigest, initial.inputDigest);
  write('skills/common/plugin-runtime/sdk/passive.mjs', "process.exit(92);\n");
  assert.notEqual(acquire().inputDigest, initial.inputDigest);
}));

test('resource-shaped root assets and arrays stop with original source and target; passive neighbors remain inert', () => fixture(({ write, acquire }) => {
  write('skills/common/plugin-runtime/sdk/tests/ignored.json', '{"apiVersion":"v1","kind":"Secret"}');
  write('skills/common/plugin-runtime/sdk/fixtures/schema.json', '{"properties":{"example":{"apiVersion":"v1","kind":"Secret"}}}');
  const before = acquire(); assert(before);
  const file = 'skills/common/plugin-runtime/sdk/fixtures/resource.json';
  for (const content of ['{"apiVersion":"v1","kind":"Secret"}', '[{"apiVersion":"v1","kind":"ConfigMap"}]']) {
    write(file, content);
    assert.throws(acquire, /sdk\/fixtures\/resource\.json -> skills\/packages\/plugin-sdk\/fixtures\/resource\.json.*no receiving contract/);
  }
}));

test('recursive required and newly present optional dependency bytes are reacquired and resource mutations fail', () => fixture(({ root, write, acquire }) => {
  const manifest = 'skills/common/plugin-runtime/sdk/package.json';
  const value = JSON.parse(fs.readFileSync(path.join(root, manifest)));
  write(manifest, JSON.stringify({ ...value, dependencies: { 'fixture-required': '1' }, optionalDependencies: { 'fixture-optional': '1' } }));
  assert.throws(acquire, /node_modules\/fixture-required\/package.json.*missing required package manifest/);
  write('node_modules/fixture-required/package.json', '{"name":"fixture-required","dependencies":{"fixture-child":"1"}}');
  write('node_modules/fixture-child/package.json', '{"name":"fixture-child"}');
  const baseline = acquire();
  write('node_modules/fixture-optional/package.json', '{"name":"fixture-optional"}');
  const added = acquire(); assert.notEqual(added.inputDigest, baseline.inputDigest);
  write('node_modules/fixture-child/fixture.yaml', 'apiVersion: v1\nkind: Secret\n');
  assert.throws(acquire, /fixture-child\/fixture.yaml -> skills\/node_modules\/fixture-child\/fixture.yaml.*no receiving contract/);
  fs.rmSync(path.join(root, 'node_modules/fixture-child/fixture.yaml'));
  fs.rmSync(path.join(root, 'node_modules/fixture-optional'), { recursive: true });
  assert.equal(acquire().inputDigest, baseline.inputDigest);
}));

test('changed manifest, validator, sync child and aliases cannot inherit inert-copy custody', () => {
  for (const file of ['packaging/runtime/roles/nova.json', 'scripts/check-runtime-role-manifests.mjs', 'skills/common/plugins/openclaw-agent-observer/scripts/sync-contract.mjs']) fixture(({ root, write, acquire }) => {
    acquire(); write(file, fs.readFileSync(path.join(root, file), 'utf8') + '\n');
    assert.throws(acquire, /reviewed producer\/caller\/selection authority changed/);
  });
  fixture(({ root, write, acquire }) => {
    acquire(); write('skills/common/plugin-runtime/sdk/fixture.json', '{}');
    fs.symlinkSync('fixture.json', path.join(root, 'skills/common/plugin-runtime/sdk/redirect.json'));
    assert.throws(acquire, /copied symlink|aliased source/);
  });
});

test('JSONC config is parsed, not a malformed-data waiver; unknown resource text remains blocked', () => fixture(({ write, acquire }) => {
  write('skills/common/plugin-runtime/sdk/tsconfig.json', '// inert config\n{"compilerOptions":{},}'); assert(acquire());
  write('skills/common/plugin-runtime/sdk/tsconfig.json', '// changed JSONC resource\n{"apiVersion":"v1","kind":"Secret",}');
  assert.throws(acquire, /tsconfig.json.*no receiving contract/);
  write('skills/common/plugin-runtime/sdk/tsconfig.json', '{}');
  for (const text of ['apiVersion: v1\nkind: Secret\n', 'kind: Secret\napiVersion: v1\n', '# resource\napiVersion: v1\nkind: Secret\n', '# resource\nmetadata: {}\nkind: Secret\napiVersion: v1\n', '- apiVersion: v1\n  kind: Secret\n', '---\n# resource array\n- kind: Secret\n  apiVersion: v1\n', 'ordinary scalar document\n---\nkind: Secret\napiVersion: v1\n']) {
    write('skills/common/plugin-runtime/sdk/payload.txt', text);
    assert.throws(acquire, /payload.txt.*no receiving contract/);
  }
}));
