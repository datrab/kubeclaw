import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { checkedArgocdArtifactOutputs, assertCheckedArtifactEntryContext, checkedGitOpsOutputProfiles, gitOpsOutputProfileRole } from '../docs-api-output-discovery.mjs';

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

// These checks exercise the finite snapshot boundary, not product execution.
// In particular, a warm snapshot is not evidence of current Git ancestry,
// original planner success, live Argo admission or effectful rollback.
test('finite original GitOps snapshots retain API roots and closed mixed members; physical and mutable-record drift stops', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gitops-output-profiles-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const witnessPath = 'scripts/docs-api-gitops-output-profile-authority.json';
  const bytes = fs.readFileSync(path.join(repository, witnessPath));
  const authority = JSON.parse(bytes);
  const write = (file, content) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true});
    fs.writeFileSync(path.join(root, file), content);
  };
  for (const fact of authority.inputs) write(fact.path, fs.readFileSync(path.join(repository, fact.path)));
  write(witnessPath, bytes);
  const graph = {edges: authority.incomingEdges, publicEntries: authority.publicEntries};
  const read = () => checkedGitOpsOutputProfiles(root, graph);
  const first = read();
  assert.deepEqual(read(), first);
  assert.equal(first.outputs.length, 14);
  // Match the actual docs-api-product-scope receiver, which does not include
  // publicOutput in identity. Multiple streams must not reset document=0.
  const receiverKey = output => JSON.stringify([output.context.path, output.context.profile,
    output.context.document, output.value.apiVersion, output.value.kind]);
  assert.equal(new Set(first.outputs.map(receiverKey)).size, 14);
  for (const output of first.outputs) {
    const received = first.outputs.find(candidate => receiverKey(candidate) === receiverKey(output));
    assert.deepEqual(received.value, output.value);
    assert.equal(received.context.publicOutput, output.context.publicOutput);
  }

  assert.equal(first.outputMembers.length, 13);
  assert(first.outputs.every(output => output.context.observationRevision === '557bab463b9ca9a897ea094a86640eacb05090c7'));
  const bootstrap = first.outputs.filter(output => output.context.profile === 'original-bootstrap-cli-default-naming');
  assert.equal(bootstrap.length, 2);
  assert.equal(bootstrap.find(output => output.value.kind === 'Application').value.spec.source.helm.valuesObject.groups.length, 3);
  const rollback = first.outputMembers.filter(member => member.source === 'scripts/gitops-rollback.mjs');
  assert.deepEqual(rollback.map(member => member.role).sort(),
    ['api', 'api', 'helm-values', 'helm-values', 'helm-values', 'helm-values',
      'runtime-code-receipt', 'runtime-image-receipt', 'selection-metadata'].sort());
  for (const file of ['gitops/production/config.json', 'releases/runtime-images.json',
    'releases/runtime-code.json', 'releases/values/buster.yaml', 'scripts/gitops.mjs',
    'scripts/gitops-continuous.mjs', 'scripts/gitops-rollback.mjs', 'scripts/gitops-owner.mjs',
    'scripts/install/register-runtime-argo.mjs', 'node_modules/js-yaml/dist/js-yaml.mjs',
    'releases/gitops/runtime-38542596018-1/buster/resources.yaml']) {
    const original = fs.readFileSync(path.join(root, file));
    for (const content of [Buffer.concat([original, Buffer.from('\n')]),
      Buffer.from('apiVersion: v1\nkind: ConfigMap\nmetadata: {name: foreign}\n')]) {
      write(file, content);
      assert.throws(read, /GITOPS_OUTPUT_PROFILE_UNQUALIFIED.*changed input/u, file);
      assert.throws(read, /GITOPS_OUTPUT_PROFILE_UNQUALIFIED.*changed input/u, 'repeat ' + file);
      write(file, original);
      assert.equal(read().outputs.length, 14);
    }
  }
  for (const file of ['charts/gitops/templates/new-api.yaml',
    'releases/gitops/runtime-38542596018-1/unowned.yaml']) {
    write(file, 'apiVersion: v1\nkind: ConfigMap\n');
    assert.throws(read, /member roster/u);
    fs.unlinkSync(path.join(root, file));
  }
  for (const file of authority.absentPackageBoundaries) {
    write(file, '{}');
    assert.throws(read, /new package boundary/u, file);
    fs.unlinkSync(path.join(root, file));
  }
  const selected = 'releases/values/buster.yaml';
  fs.unlinkSync(path.join(root, selected));
  fs.symlinkSync(path.join(repository, selected), path.join(root, selected));
  assert.throws(read, /physical input/u);
  fs.unlinkSync(path.join(root, selected));
  write(selected, fs.readFileSync(path.join(repository, selected)));
  for (const mutate of [
    value => value.profiles[2].streams.pop(),
    value => value.profiles[2].streams.push(value.profiles[2].streams[0]),
    value => { value.profiles[2].streams[0].role = 'api'; },
    value => { value.inputs[0].sha256 = 'a'.repeat(64); },
  ]) {
    const changed = JSON.parse(bytes); mutate(changed);
    write(witnessPath, JSON.stringify(changed));
    assert.throws(read, /immutable witness digest/u);
    write(witnessPath, bytes);
  }
  assert.equal(read().outputs.length, 14);
  assert.throws(() => { first.descriptors[0].role = 'non-api'; }, TypeError);
  const role = {line: 103, sink: 'kubectl-request', role: 'unknown', expression: 'dump(result.documents)', dependencies: []};
  const qualified = gitOpsOutputProfileRole('scripts/gitops-continuous.mjs', role, first);
  assert.equal(qualified.role, 'api-adapted');
  assert.equal(qualified.executionAuthority, false);
  assert.throws(() => gitOpsOutputProfileRole('scripts/gitops-continuous.mjs', {...role, expression: 'foreign'}, first), /native descriptor/u);
  assert.throws(() => gitOpsOutputProfileRole('scripts/gitops-continuous.mjs', role, {...first}), /unacquired witness/u);
  assert.equal(gitOpsOutputProfileRole('scripts/gitops-continuous.mjs', {...role, role: 'api'}, first).role, 'api');
  for (const kind of ['import', 're-export', 'dynamic-import', 'require']) {
    assert.throws(() => checkedGitOpsOutputProfiles(root, {edges: [...graph.edges,
      {source: 'tools/new-wrapper.mjs', target: 'scripts/gitops-continuous.mjs', kind}],
      publicEntries: graph.publicEntries}), /entry context/u);
  }
  assert.throws(() => checkedGitOpsOutputProfiles(root, {edges: graph.edges,
    publicEntries: [...graph.publicEntries, {path: 'tools/alias.mjs', canonicalSource: 'scripts/gitops-continuous.mjs'}]}), /entry context/u);
  fs.unlinkSync(path.join(root, witnessPath));
  assert.throws(read, /physical input/u, 'deleting authority must not grant the real original producer');
});
