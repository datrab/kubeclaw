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

// Raw filenames can carry YAML document delimiters. This witness is a private
// finite inventory bridge, never a public non-API or execution grant.
test('infrastructure historical profile stays private and rejects input, caller and slot drift', async t => {
  const {checkedInfrastructureOutputProfiles: acquire, selectedInfrastructureOutputProfile: selected} = await import('../docs-api-output-discovery.mjs');
  const {createSerializedOutputRoleClassifier} = await import('../docs-api-output-role-classification.mjs');
  const witnessPath = 'scripts/docs-api-infrastructure-output-profile-authority.json';
  const bytes = fs.readFileSync(path.join(repository, witnessPath));
  const authority = JSON.parse(bytes);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'infrastructure-output-profiles-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const write = (file, content) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true});
    fs.writeFileSync(path.join(root, file), content);
  };
  for (const fact of authority.inputs) write(fact.path, fs.readFileSync(path.join(repository, fact.path)));
  write(authority.callerOperation.source, fs.readFileSync(path.join(repository, authority.callerOperation.source)));
  write(witnessPath, bytes);
  const graph = {edges: authority.selectedIncomingEdges, publicEntries: authority.publicEntries};
  const read = () => acquire(root, graph);
  const first = read();
  assert.deepEqual(read(), first);
  assert.equal(first.executionAuthority, false);
  const sources = Object.keys(authority.sourcePins);
  const classify = createSerializedOutputRoleClassifier(root, sources);
  for (const source of sources) {
    const roles = classify(source);
    assert.equal(roles.length, 1);
    const role = roles[0];
    assert.equal(role.role, 'unknown');
    assert.equal(selected(source, role, first), true);
    assert.equal(role.role, 'unknown', 'private check must not modify canonical classification');
    assert.equal(selected('tools/new-source.mjs', role, first), false);
    assert.throws(() => selected(source, {...role, line: role.line + 1}, first), /unexpected sealed-source slot/u);
    assert.throws(() => selected(source, role, null), /unacquired witness/u);
    assert.throws(() => selected(source, {...role, role: 'non-api'}, first), /canonical raw role/u);
    assert.throws(() => selected(source, {...role, expression: role.expression + ' '}, first), /native descriptor/u);
    assert.throws(() => selected(source, role, {...first}), /unacquired witness/u);
    const registryPath = 'scripts/docs-api-producer-adapter-authorities.json';
    const registry = JSON.parse(fs.readFileSync(path.join(repository, registryPath)));
    // The release classifier displays the resolved function declaration; the
    // registry matches the original console argument, not that display text.
    const rawExpression = source === 'scripts/infrastructure-release.mjs'
      ? 'prepareInfrastructureRelease(...process.argv.slice(2))' : role.expression;
    registry.nonApiOutputContracts.push({source, sink: role.sink, expression: rawExpression,
      line: role.line, role: 'non-api', basis: 'synthetic-mutable-contract', operations: []});
    write(registryPath, JSON.stringify(registry));
    const [relabeled] = createSerializedOutputRoleClassifier(root, sources)(source);
    assert.equal(relabeled.role, 'non-api', 'native mutable-contract escalation actually reached');
    assert.throws(() => selected(source, relabeled, read()), /canonical raw role/u);
    fs.unlinkSync(path.join(root, registryPath));
    assert.equal(createSerializedOutputRoleClassifier(root, sources)(source)[0].role, 'unknown');

  }
  for (const fact of authority.inputs) {
    const original = fs.readFileSync(path.join(root, fact.path));
    write(fact.path, Buffer.concat([original, Buffer.from('\n')]));
    assert.throws(read, /changed input/u, fact.path);
    write(fact.path, original);
  }
  for (const file of authority.absentPackageBoundaries) {
    write(file, '{}');
    assert.throws(read, /new package boundary/u, file);
    fs.unlinkSync(path.join(root, file));
  }
  for (const edges of [[...graph.edges, {source: 'tools/new.mjs', target: sources[0], kind: 'import'}], graph.edges.slice(1)]) {
    assert.throws(() => acquire(root, {...graph, edges}), /entry context/u);
  }
  assert.throws(() => acquire(root, {...graph, publicEntries: [...graph.publicEntries,
    {path: 'tools/alias.mjs', canonicalSource: sources[0]}]}), /entry context/u);
  for (const mutate of [
    a => {a.profiles.pop(); a.profileOrder.pop();},
    a => {a.profiles.reverse();},
    a => {a.profiles[0] = a.profiles[3];},
    a => {a.descriptors[0].classifierDescriptorSha256 = a.descriptors[1].classifierDescriptorSha256;},
    a => {a.canonicalRawRole = 'non-api';},
  ]) {
    const changed = JSON.parse(bytes); mutate(changed);
    write(witnessPath, JSON.stringify(changed));
    assert.throws(read, /immutable witness digest/u);
  }
  write(witnessPath, bytes);
  const observer = fs.readFileSync(path.join(root, authority.callerOperation.source), 'utf8');
  write(authority.callerOperation.source, observer.replace('const versionsDigest=hash(versionsBytes);', 'const versionsDigest="stale";'));
  assert.throws(read, /native adapter operation/u);
  write(authority.callerOperation.source, observer);
  assert.deepEqual(read(), first);
});

test('native infrastructure cache binds image settings and complete versions bytes before warm reuse', async t => {
  const {discoverInfrastructureApiOutputs} = await import('../docs-api-output-discovery.mjs');
  const {spawnSync} = await import('node:child_process');
  const {pathToFileURL} = await import('node:url');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'infrastructure-native-cache-'));
  const previousTmpdir = process.env.TMPDIR;
  t.after(() => {
    if (previousTmpdir === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = previousTmpdir;
    fs.rmSync(root, {recursive: true, force: true});
  });
  for (const directory of ['scripts', 'my-values/infra']) {
    fs.cpSync(path.join(repository, directory), path.join(root, directory), {recursive: true});
  }
  for (const file of ['package.json', 'package-lock.json', 'versions.json']) fs.copyFileSync(path.join(repository, file), path.join(root, file));
  fs.symlinkSync(path.join(repository, 'node_modules'), path.join(root, 'node_modules'));
  const temporary = path.join(root, 'tmp');
  const cache = path.join(temporary, `kubeclaw-infrastructure-charts-${process.getuid()}`);
  fs.mkdirSync(cache, {recursive: true, mode: 0o700});
  process.env.TMPDIR = temporary;
  const versionFile = path.join(root, 'versions.json'), original = fs.readFileSync(versionFile);
  const versions = JSON.parse(original);
  for (const lock of Object.values(versions.infrastructureCharts)) {
    fs.copyFileSync(path.join(repository, 'scripts/vendor/external-helm-charts', `${lock.sha256}.tgz`),
      path.join(cache, `${lock.name}-${lock.version}-${lock.sha256}.tgz`));
  }
  const first = discoverInfrastructureApiOutputs(root);
  assert.equal(first.length, 66);
  assert.equal(new Set(first.map(item => item.context.profile)).size, 6);
  const changed = structuredClone(versions);
  changed.infrastructure.redis = changed.infrastructure.redis.replace(/@sha256:[a-f0-9]{64}$/u, '@sha256:' + 'f'.repeat(64));
  assert.notEqual(changed.infrastructure.redis, versions.infrastructure.redis);
  fs.writeFileSync(versionFile, JSON.stringify(changed));
  assert.throws(() => discoverInfrastructureApiOutputs(root), /INFRASTRUCTURE_DATABASE_IMAGE_OVERRIDE/u);
  const uri = pathToFileURL(path.join(repository, 'scripts/docs-api-output-discovery.mjs')).href;
  const cold = spawnSync(process.execPath, ['--input-type=module', '-e',
    `import {discoverInfrastructureApiOutputs} from ${JSON.stringify(uri)}; discoverInfrastructureApiOutputs(${JSON.stringify(root)});`],
  {encoding: 'utf8', env: process.env, maxBuffer: 32 * 1024 * 1024});
  assert.notEqual(cold.status, 0);
  assert.match(cold.stderr, /INFRASTRUCTURE_DATABASE_IMAGE_OVERRIDE/u);
  fs.writeFileSync(versionFile, Buffer.concat([original, Buffer.from('\n')]));
  const rawChanged = discoverInfrastructureApiOutputs(root);
  assert.deepEqual(rawChanged.map(item => item.value), first.map(item => item.value));
  assert(rawChanged.every((item, index) => item.context.inputDigest !== first[index].context.inputDigest));
  fs.writeFileSync(versionFile, original);
  assert.deepEqual(discoverInfrastructureApiOutputs(root), first);
});
