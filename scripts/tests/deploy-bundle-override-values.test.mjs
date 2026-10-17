import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import yaml from 'js-yaml';

const repository = path.resolve(import.meta.dirname, '../..');
const source = fs.readFileSync(path.join(repository, 'scripts/deploy.sh'), 'utf8');
const append = source.match(/append_code_bundle_override_file\(\) \{[\s\S]*?\n\}/u)[0];
const helper = path.join(repository, 'scripts/bundle-override-values.mjs');
for (const [name, value] of [['quote', 'a"b'], ['backslash', 'a\\b'], ['multiline', 'a\nb'], ['document-like', 'a"\n---\napiVersion: v1\nkind: ConfigMap\n#']]) {
  test(`actual append preserves ${name} strings without changing YAML document structure`, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-override-'));
    const output = path.join(root, 'values.yaml');
    try {
      fs.writeFileSync(output, 'image:\n  repository: retained/image\n');
      const result = spawnSync('bash', ['-c', `set -euo pipefail; REPO_DIR="$1"; ${append}; append_code_bundle_override_file "$2" "$3" "$4" "$5" "$6" "$7"`, 'bundle-test', repository, output, value, value, value, value, value], {encoding: 'utf8'});
      assert.equal(result.status, 0, result.stderr);
      const documents = yaml.loadAll(fs.readFileSync(output, 'utf8'));
      assert.equal(documents.length, 1);
      assert.deepEqual(documents[0], {image: {repository: 'retained/image'}, codeBundle: {enabled: true, archiveUrl: value, expectedCommit: value, contractVersion: value, auth: {existingSecret: value, existingSecretKey: value}}});
    } finally {fs.rmSync(root, {recursive: true, force: true});}
  });
}
test('actual serializer omits absent auth and preserves default key', () => {
  const absent = spawnSync(process.execPath, [helper, 'url', 'commit', 'v2'], {encoding: 'utf8'});
  assert.equal(absent.status, 0, absent.stderr);
  assert.deepEqual(yaml.load(absent.stdout), {codeBundle: {enabled: true, archiveUrl: 'url', expectedCommit: 'commit', contractVersion: 'v2'}});
  const present = spawnSync(process.execPath, [helper, 'url', 'commit', 'v2', 'secret'], {encoding: 'utf8'});
  assert.equal(present.status, 0, present.stderr);
  assert.equal(yaml.load(present.stdout).codeBundle.auth.existingSecretKey, 'token');
});
test('actual serializer fails without partial stdout when mandatory arguments are missing', () => {
  const result = spawnSync(process.execPath, [helper, 'url'], {encoding: 'utf8'});
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /Bundle archive URL, expected commit and contract version required/);
});
