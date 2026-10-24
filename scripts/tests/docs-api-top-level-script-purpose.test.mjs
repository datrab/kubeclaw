import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {checkedTopLevelScriptPurposes, selectedTopLevelScriptPurpose} from '../docs-api-top-level-script-purpose.mjs';
import {createSerializedOutputRoleClassifier, classifySerializedOutputRoles, deriveNativeOperationFacts} from '../docs-api-output-role-classification.mjs';
import {assertDocumentationExecutableRole, documentationExecutableSelectors} from '../docs-api-documentation-role-custody.mjs';
import {checkedReleaseRendererOutputs} from '../docs-api-output-discovery.mjs';

const repository = path.resolve(import.meta.dirname, '../..');
const authorityPath = 'scripts/docs-api-top-level-script-purpose-authority.json';
const authority = JSON.parse(fs.readFileSync(path.join(repository, authorityPath)));
const sources = Object.keys(authority.sourcePins);
const graph = {edges: authority.incomingEdges, publicEntries: authority.publicEntries};
const original = source => authority.descriptors.filter(role => role.source === source).map(({source, ...role}) => ({...role, dependencies: []}));
const diagnostic = /API_PRODUCT_TOP_LEVEL_SOURCE_PURPOSE_UNQUALIFIED/u;
function fixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'top-level-output-purpose-'));
  const write = (file, bytes) => {fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true}); fs.writeFileSync(path.join(root, file), bytes);};
  try {
    for (const file of [authorityPath, ...authority.inputs.map(input => input.path)]) write(file, fs.readFileSync(path.join(repository, file)));
    run({root, write, acquire: (classify = original, selectedGraph = graph, census = sources) => checkedTopLevelScriptPurposes(root, selectedGraph, classify, census)});
  } finally {fs.rmSync(root, {recursive: true, force: true});}
}

test('current real native parser agrees with complete reviewed26-slot seal', () => {
  const classify = createSerializedOutputRoleClassifier(repository, sources);
  const receipt = checkedTopLevelScriptPurposes(repository, graph, classify, sources);
  assert.equal(receipt.descriptors.length, 26);
  assert.equal(receipt.runtimeExecutionAuthorized, false);
  assert.equal(receipt.apiApplyAuthorized, false);
  for (const source of sources) for (const role of classify(source)) {
    const before = structuredClone(role);
    const purpose = selectedTopLevelScriptPurpose(source, role, receipt);
    assert.deepEqual(role, before); // Source purpose never changes canonical roles.
    if (purpose) assert.equal(purpose.canonicalRawRole, role.role);
  }
  const raw = classify('scripts/lint-baseline-update.mjs').find(role => role.line === 75);
  assert.equal(raw.role, 'unknown');
  assert(selectedTopLevelScriptPurpose('scripts/lint-baseline-update.mjs', raw, receipt));
  assert.throws(() => selectedTopLevelScriptPurpose('scripts/lint-baseline-update.mjs', raw, {...receipt}), /unacquired receipt/u);
  assert.equal(selectedTopLevelScriptPurpose('scripts/versions.mjs', classify('scripts/versions.mjs')[0], receipt), null);
});

test('each of79 Source/helper/input byte changes and missing primary source fail before reuse', () => fixture(({root, write, acquire}) => {
  acquire(); acquire();
  for (const input of authority.inputs) {
    const bytes = fs.readFileSync(path.join(root, input.path));
    write(input.path, Buffer.concat([bytes, Buffer.from('\n ')]));
    assert.throws(() => acquire(), diagnostic, input.path);
    write(input.path, bytes);
  }
  assert.throws(() => acquire(original, graph, sources.slice(1)), /missing selected source/u);
}));

test('all12 source role inversions and every26-slot omission/extension fail', () => fixture(({acquire}) => {
  for (const source of sources) {
    assert.throws(() => acquire(candidate => original(candidate).map((role, index) => candidate === source && index === 0 ? {...role, role: role.role === 'unknown' ? 'non-api' : 'unknown'} : role)), /canonical native slot\/role roster/u);
  }
  for (const selected of authority.descriptors) {
    assert.throws(() => acquire(source => original(source).filter(role => source !== selected.source || role.line !== selected.line)), /canonical native slot\/role roster/u);
  }
  assert.throws(() => acquire(source => source === sources[0] ? [...original(source), {...original(source)[0], line: 999}] : original(source)), /canonical native slot\/role roster/u);
}));

test('changed callers, alias, loader boundary and cloned immutable authority fail', () => fixture(({root, write, acquire}) => {
  acquire();
  assert.throws(() => acquire(original, {...graph, edges: [...graph.edges, {source: 'scripts/new.mjs', target: sources[0], kind: 'import', operation: 'import x'}]}), /caller or aliased/u);
  assert.throws(() => acquire(original, {...graph, publicEntries: [...graph.publicEntries, {path: 'scripts/alias.mjs', canonicalSource: sources[0]}]}), /caller or aliased/u);
  write('scripts/package.json', '{}');
  assert.throws(() => acquire(), /new package boundary/u);
  fs.unlinkSync(path.join(root, 'scripts/package.json'));
  write(authorityPath, JSON.stringify({...authority, descriptors: authority.descriptors.slice(1)}));
  assert.throws(() => acquire(), /immutable Source-purpose authority/u);
}));

test('ordinary registry cannot promote the raw lint status past the sealed descriptor', () => fixture(({root, write, acquire}) => {
  const registryPath = 'scripts/docs-api-producer-adapter-authorities.json';
  const registry = JSON.parse(fs.readFileSync(path.join(repository, registryPath)));
  const contract = registry.nonApiOutputContracts.find(item => item.source === sources[0]);
  contract.role = 'non-api';
  contract.basis = 'forged-complete-role';
  write(registryPath, JSON.stringify(registry));
  const roles = classifySerializedOutputRoles(root, sources[0]);
  const raw = roles.find(role => role.line === 75);
  // The native untrusted-publication guard may already refuse this registry
  // promotion. If so it must remain UNKNOWN; otherwise our full seal rejects it.
  if (raw.role === 'unknown') assert.equal(raw.role, 'unknown');
  else assert.throws(() => acquire(source => source === sources[0] ? roles : original(source)), /canonical native slot\/role roster/u);
}));

test('original malicious newline tool status stays raw UNKNOWN; disposable fixture only', () => fixture(({root, write}) => {
  const tool = 'fixture\n---\napiVersion: v1\nkind: ConfigMap\nmetadata: {name: raw-status}\n#';
  const baseline = '{"schema_version":"pipeline_lint_baseline.v2","groups":[]}\n';
  write('fixture/baseline.json', baseline);
  write('fixture/report.json', JSON.stringify({schema_version: 'pipeline_lint_report.v7', policy: {baseline_digest: createHash('sha256').update(baseline).digest('hex')}, tools: {[tool]: {status: 'ok', mode: 'blocking', findings: [{fingerprint: 'a'.repeat(64)}]}}}));
  const args = ['report', 'fixture/report.json', 'baseline', 'fixture/baseline.json', 'tool', tool, 'owner', 'fixture', 'reason', 'source test', 'created', '2026-10-22', 'expires', '2026-10-23', 'tracking', 'fixture-only', 'approved-by', 'fixture', 'approved-on', '2026-10-22'];
  const argv = [];
  for (let index = 0; index < args.length; index += 2) argv.push(`--${args[index]}`, args[index + 1]);
  const result = spawnSync(process.execPath, [path.join(root, sources[0]), ...argv], {cwd: root, encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
  assert(result.stdout.includes('\napiVersion: v1\nkind: ConfigMap\n'));
  assert.equal(classifySerializedOutputRoles(root, sources[0]).find(role => role.line === 75).role, 'unknown');
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'fixture/baseline.json'))).groups.length, 1);
}));

// The exact failure seen in the owning generator was transitive documentation
// custody, not a new product API role. Exercise those existing guards directly.
test('all six renewed documentation-consumer recipes pass the actual native guard', () => {
  for (const source of ['scripts/docs-api-output-discovery.mjs', 'scripts/docs-api-product-scope.mjs',
    'scripts/docs-api-reference.mjs', 'scripts/docs-configuration-inventory.mjs',
    'scripts/docs-generate.mjs', 'scripts/docs-governance.mjs']) {
    assertDocumentationExecutableRole(repository, source);
  }
});

test('renewed governance custody still rejects a changed source-map constructor', () => {
  const source = 'scripts/docs-governance.mjs';
  const selectors = documentationExecutableSelectors(source, fs.readFileSync(path.join(repository, source), 'utf8'), repository);
  const facts = deriveNativeOperationFacts(repository, source, selectors, {trustAnchorSources: ['scripts/docs-api-documentation-role-custody.mjs']});
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'governance-purpose-custody-'));
  try {
    for (const relative of new Set([source, ...facts.map(fact => fact.source)])) {
      fs.mkdirSync(path.dirname(path.join(root, relative)), {recursive: true});
      fs.copyFileSync(path.join(repository, relative), path.join(root, relative));
    }
    assertDocumentationExecutableRole(root, source);
    const helper = path.join(root, 'scripts/lib/docs-source-surface-map.mjs');
    const originalBytes = fs.readFileSync(helper, 'utf8');
    const changed = originalBytes.replace('const domains = [];', "const domains = [{domain: 'unreviewed'}];");
    assert.notEqual(changed, originalBytes);
    fs.writeFileSync(helper, changed);
    assert.throws(() => assertDocumentationExecutableRole(root, source), /selected producer\/helper\/initialization custody changed/u);
  } finally {fs.rmSync(root, {recursive: true, force: true});}
});

test('five additional artifact/status purposes preserve UNKNOWN and their actual limited meaning', () => {
  const classify = createSerializedOutputRoleClassifier(repository, sources);
  const receipt = checkedTopLevelScriptPurposes(repository, graph, classify, sources);
  for (const [source, line, distinction] of [
    ['scripts/recover-openclaw-audit-input.mjs', 70, /not API submission or successful doctor/u],
    ['scripts/updates/materialize-release.mjs', 50, /write branch, not check success/u],
    ['scripts/updates/refresh-versions.mjs', 140, /arbitrary version text including LF/u],
    ['scripts/updates/refresh-versions.mjs', 151, /BEFORE downstream/u],
    ['scripts/updates/refresh-versions.mjs', 155, /not atomic rollback/u],
  ]) {
    const role = classify(source).find(item => item.line === line);
    assert.equal(role.role, 'unknown');
    const purpose = selectedTopLevelScriptPurpose(source, role, receipt);
    assert.equal(purpose.canonicalRawRole, 'unknown');
    assert.equal(purpose.runtimeExecutionAuthorized, false);
    assert.equal(purpose.apiApplyAuthorized, false);
    assert.match(purpose.purpose, distinction);
  }
  for (const [source, line] of [
    ['scripts/render-kubernetes-api-probe.mjs', 39],
    ['scripts/updates/deployment-release.mjs', 195],
    ['scripts/versions.mjs', 181],
  ]) {
    assert.equal(selectedTopLevelScriptPurpose(source, classify(source).find(role => role.line === line), receipt), null);
  }
});

test('stateful stream purpose keeps canonical UNKNOWN and requires its separate original API adapter', () => {
  const classify = createSerializedOutputRoleClassifier(repository, sources);
  const receipt = checkedTopLevelScriptPurposes(repository, graph, classify, sources);
  const source = 'scripts/render-stateful-network-policies.mjs';
  const role = classify(source).find(row => row.line === 68);
  assert.equal(role.role, 'unknown');
  const purpose = selectedTopLevelScriptPurpose(source, role, receipt);
  assert.equal(purpose.canonicalRawRole, 'unknown');
  assert.equal(purpose.runtimeExecutionAuthorized, false);
  assert.equal(purpose.apiApplyAuthorized, false);
  assert.match(purpose.purpose, /API-capable YAML stream/);
  assert.match(purpose.purpose, /separate mandatory discoverTransformedApiOutputs/);
  assert.throws(() => selectedTopLevelScriptPurpose(source, {...role, role: 'non-api'}, receipt), /changed canonical slot or role/);
});

test('release renderer retains original API documents from every maintained Ops forwarding profile', () => {
  const classify = createSerializedOutputRoleClassifier(repository, sources);
  const receipt = checkedTopLevelScriptPurposes(repository, graph, classify, sources);
  const proof = checkedReleaseRendererOutputs(repository, receipt);
  const renderer = 'scripts/updates/deployment-release.mjs';
  assert.equal(classify(renderer).find(role => role.line === 195).role, 'unknown');
  assert.equal(selectedTopLevelScriptPurpose(renderer, classify(renderer).find(role => role.line === 195), receipt), null);
  assert(proof.outputs.length > 0);
  assert.deepEqual([...new Set(proof.outputs.map(row => row.context.profile))], [
    'selected-ops-public-render:default', 'selected-ops-public-render:releases/values/ops.yaml',
    'selected-ops-public-render:optional-ops-output', 'selected-ops-public-render:ops-no-exec',
    'selected-ops-public-render:boolean:networkPolicy.cilium',
  ]);
  for (const {value, context} of proof.outputs) {
    assert(value.apiVersion && value.kind);
    assert.equal(context.path, renderer);
    assert.equal(context.line, 195);
    assert.equal(context.forwardedProducer.forwardingCaller, 'scripts/deploy-ops-pod.sh');
    assert.equal(context.runtimeExecutionAuthorized, false);
    assert.equal(context.apiApplyAuthorized, false);
    assert.match(context.executionLimit, /not live discovery\/apply or runtime-family success/);
  }
  assert.throws(() => {proof.outputs[0].value.kind = 'Secret';}, TypeError);
  assert.throws(() => checkedReleaseRendererOutputs(repository, {...receipt}), /unacquired receipt/);
});

test('release forwarding refuses a changed source or forwarding receiver before native execution', () => {
  for (const [source, change] of [
    ['scripts/updates/deployment-release.mjs', text => text.replace('process.stdout.write(rendered);', "process.stdout.write('unreviewed');")],
    ['scripts/deploy-ops-pod.sh', text => text.replace('cat "$temporary/rendered.yaml"', 'cat "$temporary/foreign.yaml"')],
  ]) fixture(({root, write, acquire}) => {
    const receipt = acquire();
    write('scripts/docs-api-producer-adapter-authorities.json', fs.readFileSync(path.join(repository, 'scripts/docs-api-producer-adapter-authorities.json')));
    const originalBytes = fs.readFileSync(path.join(repository, source), 'utf8');
    const changed = change(originalBytes);
    assert.notEqual(changed, originalBytes);
    write(source, changed);
    assert.throws(() => checkedReleaseRendererOutputs(root, receipt), /API_PRODUCT_(?:ADAPTER|RELEASE_RENDERER)/);
  });
});

// Exact documentation-file occurrence only; nested schema data remains raw.
test('aggregate fixed-file occurrence preserves UNKNOWN and rejects receiver/caller drift', () => fixture(({root, write, acquire}) => {
  const source = 'scripts/generate-plugin-dependency-aggregate.mjs';
  const receipt = acquire();
  const role = original(source).find(row => row.line === 21);
  assert.equal(role.role, 'unknown');
  const purpose = selectedTopLevelScriptPurpose(source, role, receipt);
  assert.equal(purpose.canonicalRawRole, 'unknown');
  assert.equal(purpose.runtimeExecutionAuthorized, false);
  assert.equal(purpose.apiApplyAuthorized, false);
  assert.match(purpose.purpose, /compared read-only to that same file/);
  assert.match(purpose.purpose, /not globally non-API/);
  assert.equal(selectedTopLevelScriptPurpose(source, original(source).find(row => row.line === 22), receipt), null);
  assert.throws(() => selectedTopLevelScriptPurpose(source, {...role, role: 'non-api'}, receipt), /changed canonical slot or role/);
  assert.throws(() => acquire(original, {...graph, edges: [...graph.edges, {source: 'skills/runtime.mjs', target: source, kind: 'import', operation: 'import generator'}]}), /caller or aliased/);
  const before = fs.readFileSync(path.join(root, source), 'utf8');
  const changed = before.replace('docs/blueprint/generated/plugin-dependency-aggregate.json', 'runtime/resource.json');
  assert.notEqual(changed, before);
  write(source, changed);
  assert.throws(() => acquire(), /changed Source\/caller\/receiver\/input/);
}));
