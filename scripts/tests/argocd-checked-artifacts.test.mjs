import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { checkedArgocdArtifactOutputs, assertCheckedArtifactEntryContext } from '../docs-api-output-discovery.mjs';

const repository = path.resolve(import.meta.dirname, '../..');
const source = 'scripts/argocd-self-management.mjs';
const authorityPath = 'scripts/docs-api-argocd-checked-artifact-authority.json';
const authorityBytes = fs.readFileSync(path.join(repository, authorityPath));
const authority = JSON.parse(authorityBytes);

test('original checked-artifact witness retains API objects and rejects changed authority or inputs', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'argocd-checked-artifacts-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (file, bytes) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), bytes);
  };
  for (const fact of authority.observation.inputsAndCheckedOutputs) {
    write(fact.path, fs.readFileSync(path.join(repository, fact.path)));
  }
  write(authorityPath, authorityBytes);
  const original = fs.readFileSync(path.join(root, source), 'utf8');
  const read = () => checkedArgocdArtifactOutputs(root, source, fs.readFileSync(path.join(root, source), 'utf8'));
  const result = read();
  assert.equal(result.outputs.length, 21);
  assert.equal(result.outputs.filter(output => output.value.kind === 'AppProject').length, 5);
  assert.equal(result.outputs.filter(output => output.value.kind === 'Application').length, 16);
  assert(result.outputs.every(output => output.value.apiVersion === 'argoproj.io/v1alpha1'));
  assert(result.outputs.every(output => output.context.producer === 'node-original-checked-artifact'));

  for (const file of ['versions.json', 'scripts/platform-services.mjs',
    'gitops/platform/bootstrap/argocd.yaml', 'node_modules/js-yaml/dist/js-yaml.mjs']) {
    const bytes = fs.readFileSync(path.join(root, file));
    write(file, Buffer.concat([bytes, Buffer.from('\n')]));
    assert.throws(read, /CHECKED_ARTIFACT_UNQUALIFIED.*changed input or checked artifact/u, file);
    write(file, bytes);
  }
  for (const file of authority.absentPackageBoundaries) {
    write(file, '{}');
    assert.throws(read, /CHECKED_ARTIFACT_UNQUALIFIED.*new package boundary/u, file);
    fs.unlinkSync(path.join(root, file));
  }
  write(authorityPath, Buffer.concat([authorityBytes, Buffer.from('\n')]));
  assert.throws(read, /immutable witness digest/u);
  write(authorityPath, authorityBytes);
  const versions = path.join(root, 'versions.json');
  fs.unlinkSync(versions);
  fs.symlinkSync(path.join(repository, 'versions.json'), versions);
  assert.throws(read, /physical input versions\.json/u);
  fs.unlinkSync(versions);
  write('versions.json', fs.readFileSync(path.join(repository, 'versions.json')));

  write(source, original + '\n');
  assert.equal(read(), null, 'changed Source must not inherit the frozen descriptor or API adapter');
  write(source, original);
  assert.equal(checkedArgocdArtifactOutputs(root, 'tools/unrelated.mjs', original), null);
  assert.equal(read().outputs.length, 21);
});

test('checked producer observation does not qualify imported or aliased entry contexts', () => {
  const entry = { path: source, canonicalSource: source };
  assert.doesNotThrow(() => assertCheckedArtifactEntryContext({ edges: [], publicEntries: [entry] }, source));
  for (const kind of ['import', 're-export', 'dynamic-import', 'require']) {
    assert.throws(() => assertCheckedArtifactEntryContext({
      edges: [{ source: 'tools/wrapper.mjs', target: source, kind }], publicEntries: [entry],
    }, source), /CALLER_UNQUALIFIED/u);
  }
  assert.throws(() => assertCheckedArtifactEntryContext({ edges: [],
    publicEntries: [entry, { path: 'tools/alias.mjs', canonicalSource: source }],
  }, source), /CALLER_UNQUALIFIED/u);
  assert.throws(() => assertCheckedArtifactEntryContext(null, source), /CALLER_UNQUALIFIED/u);
});
