import ts from 'typescript';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
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
// The JSON witness remains historical on disk. This consistency fixture applies
// the separately reviewed exact current companion only to its synthetic data.
const receiverSource = fs.readFileSync(path.join(repository, 'scripts/docs-api-top-level-script-purpose.mjs'), 'utf8');
const receiverTree = ts.createSourceFile('receiver', receiverSource, ts.ScriptTarget.Latest, true);
const companionNode = receiverTree.statements.flatMap(n => ts.isVariableStatement(n) ? [...n.declarationList.declarations] : [])
  .find(n => n.name.getText(receiverTree) === 'currentTopLevelProducerBinding20261101');
const companion = JSON.parse(companionNode.initializer.arguments[0].getText(receiverTree));
assert.equal(authority.sourcePins[companion.path], companion.historicalSha256);
assert.deepEqual(authority.descriptors.filter(r => r.source === companion.path), companion.historicalDescriptors);
const oldStandalone = authority.standaloneVerificationContext;
assert.deepEqual(oldStandalone.slots.filter(r => r.source === companion.path), companion.historicalSlots);
assert.deepEqual(oldStandalone.outgoingEdges.filter(r => r.source === companion.path), companion.historicalOutgoingEdges);
const firstCompanionEdge = oldStandalone.outgoingEdges.findIndex(r => r.source === companion.path);
authority.sourcePins[companion.path] = companion.sha256;
authority.descriptors = authority.descriptors.map(r => r.source === companion.path
  ? companion.descriptors[companion.historicalDescriptors.findIndex(old => JSON.stringify(old) === JSON.stringify(r))] : r);
oldStandalone.slots = oldStandalone.slots.map(r => r.source === companion.path
  ? companion.slots[companion.historicalSlots.findIndex(old => JSON.stringify(old) === JSON.stringify(r))] : r);
oldStandalone.outgoingEdges = oldStandalone.outgoingEdges.flatMap((r,i) => r.source !== companion.path ? [r]
  : i === firstCompanionEdge ? companion.outgoingEdges : []);

const sources = Object.keys(authority.sourcePins);
// Synthetic guard context reconstructed from the sealed current Source; this
// unit fixture is not a fresh selected native graph or execution observation.
const editorial = authority.retainedEditorialContext;
const standalone = authority.standaloneVerificationContext;
const documentary = authority.documentaryFormatterContext;
const realPipeline = authority.realPipelineReceivingContext;
const declarationServer = authority.declarationAndServerReceivingContext;
const classifierUniverse = [...new Set([...sources, ...standalone.contextSources, ...documentary.contextSources, ...realPipeline.contextSources, ...declarationServer.contextSources, ...editorial.ancestors])];
const operationText = row => {
  const text = fs.readFileSync(path.join(repository, row.source), 'utf8');
  const tree = ts.createSourceFile(row.source, text, ts.ScriptTarget.Latest, true);
  let found;
  function visit(node) { const value = node.getText(tree); if (createHash('sha256').update(value).digest('hex') === row.operationSha256) found = value; if (!found) ts.forEachChild(node, visit); }
  visit(tree); assert.notEqual(found, undefined, 'current operation syntax must reconstruct exactly'); return found;
};
// Merge sealed ordered projections without inventing a lexical traversal order.
// This is a synthetic consistency fixture, never actual native graph evidence.
function orderedProjectionUnion(groups) {
  const values = new Map(), next = new Map(), incoming = new Map();
  for (const rows of groups) {
    let previous;
    for (const row of rows) {
      const key = JSON.stringify(row);
      if (!values.has(key)) {values.set(key, row); next.set(key, new Set()); incoming.set(key, 0);}
      if (previous !== undefined && previous !== key && !next.get(previous).has(key)) {
        next.get(previous).add(key); incoming.set(key, incoming.get(key) + 1);
      }
      previous = key;
    }
  }
  const result = [], ready = [...values.keys()].filter(key => incoming.get(key) === 0);
  for (let index = 0; index < ready.length; index++) {
    const key = ready[index]; result.push(values.get(key));
    for (const target of next.get(key)) {incoming.set(target, incoming.get(target) - 1); if (!incoming.get(target)) ready.push(target);}
  }
  assert.equal(result.length, values.size, 'sealed native graph projections must have consistent order');
  return result;
}
const graph = {
  edges: orderedProjectionUnion([authority.incomingEdges, editorial.incomingEdges, standalone.incomingEdges, standalone.outgoingEdges, documentary.incomingEdges, documentary.outgoingEdges, realPipeline.incomingEdges, realPipeline.outgoingEdges, declarationServer.incomingEdges, declarationServer.outgoingEdges]),
  publicEntries: orderedProjectionUnion([authority.publicEntries, editorial.publicEntries, standalone.publicEntries, documentary.publicEntries, realPipeline.publicEntries, declarationServer.publicEntries]),
  aliases: editorial.aliases,
  dynamicOperations: editorial.unresolvedModuleOperations.map(({operationSha256, ...row}) => ({...row, operation: operationText({...row, operationSha256})})),
};
// Existing owner parser supplies these in real discovery; this fixture is data.
const nativePackageEntries = orderedProjectionUnion([editorial.packageEntries, standalone.packageEntries, documentary.packageEntries, realPipeline.packageEntries, declarationServer.packageEntries]);
const original = source => authority.descriptors.filter(role => role.source === source).map(({source, ...role}) => ({...role, dependencies: []}));
const diagnostic = /API_PRODUCT_TOP_LEVEL_SOURCE_PURPOSE_UNQUALIFIED/u;
function fixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'top-level-output-purpose-'));
  const write = (file, bytes) => {fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true}); fs.writeFileSync(path.join(root, file), bytes);};
  try {
    for (const file of [...new Set([authorityPath, 'package.json', ...authority.inputs.map(input => input.path)])]) write(file, fs.readFileSync(path.join(repository, file)));
    run({root, write, acquire: (classify = original, selectedGraph = graph, census = sources, entries = nativePackageEntries) => checkedTopLevelScriptPurposes(root, selectedGraph, classify, census, entries)});
  } finally {fs.rmSync(root, {recursive: true, force: true});}
}

test('current real native parser agrees with complete reviewed494-slot seal', () => {
  const classify = createSerializedOutputRoleClassifier(repository, classifierUniverse);
  const receipt = checkedTopLevelScriptPurposes(repository, graph, classify, sources, nativePackageEntries);
  assert.equal(receipt.descriptors.length, 494);
  assert.equal(receipt.runtimeExecutionAuthorized, false);
  assert.equal(receipt.apiApplyAuthorized, false);
  assert.match(receipt.currentPurposeInputBindingDigest, /^[a-f0-9]{64}$/u);
  assert.equal(receipt.witnessDigest, createHash('sha256').update(fs.readFileSync(path.join(repository, authorityPath))).digest('hex'));
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

test('each sealed Source/helper/input byte change and missing primary source fail before reuse', () => fixture(({root, write, acquire}) => {
  acquire(); acquire();
  for (const input of authority.inputs) {
    const bytes = fs.readFileSync(path.join(root, input.path));
    write(input.path, Buffer.concat([bytes, Buffer.from('\n ')]));
    assert.throws(() => acquire(), diagnostic, input.path);
    write(input.path, bytes);
  }
  assert.throws(() => acquire(original, graph, sources.slice(1)), /missing selected source/u);
}));

test('all95 source role inversions and every494-slot omission/extension fail', () => fixture(({acquire}) => {
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
  const classify = createSerializedOutputRoleClassifier(repository, classifierUniverse);
  const receipt = checkedTopLevelScriptPurposes(repository, graph, classify, sources, nativePackageEntries);
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
    ['scripts/updates/deployment-release.mjs', 196],
    ['scripts/versions.mjs', 181],
  ]) {
    assert.equal(selectedTopLevelScriptPurpose(source, classify(source).find(role => role.line === line), receipt), null);
  }
});

test('stateful stream purpose keeps canonical UNKNOWN and requires its separate original API adapter', () => {
  const classify = createSerializedOutputRoleClassifier(repository, classifierUniverse);
  const receipt = checkedTopLevelScriptPurposes(repository, graph, classify, sources, nativePackageEntries);
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
  const classify = createSerializedOutputRoleClassifier(repository, classifierUniverse);
  const receipt = checkedTopLevelScriptPurposes(repository, graph, classify, sources, nativePackageEntries);
  const proof = checkedReleaseRendererOutputs(repository, receipt);
  const renderer = 'scripts/updates/deployment-release.mjs';
  assert.equal(classify(renderer).find(role => role.line === 196).role, 'unknown');
  assert.equal(selectedTopLevelScriptPurpose(renderer, classify(renderer).find(role => role.line === 196), receipt), null);
  assert(proof.outputs.length > 0);
  assert.deepEqual([...new Set(proof.outputs.map(row => row.context.profile))], [
    'selected-ops-public-render:default', 'selected-ops-public-render:releases/values/ops.yaml',
    'selected-ops-public-render:optional-ops-output', 'selected-ops-public-render:ops-no-exec',
    'selected-ops-public-render:boolean:networkPolicy.cilium',
  ]);
  for (const {value, context} of proof.outputs) {
    assert(value.apiVersion && value.kind);
    assert.equal(context.path, renderer);
    assert.equal(context.line, 196);
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

// Exercise the exact private table via isolated copies of this pure receiver,
// never through an extra production binding interface or a product command.
test('exact five current purpose bindings reject missing duplicate reordered extra malformed and historical drift', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'top-purpose-current-bindings-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  for (const file of [...new Set([authorityPath, 'package.json', ...authority.inputs.map(input => input.path)])]) {
    fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true});
    fs.copyFileSync(path.join(repository, file), path.join(root, file));
  }
  const code = fs.readFileSync(path.join(repository, 'scripts/docs-api-top-level-script-purpose.mjs'), 'utf8');
  const prefix = 'const currentPurposeInputBindings20261031 = Object.freeze(';
  const start = code.indexOf(prefix) + prefix.length;
  const end = code.indexOf('.map(Object.freeze));', start);
  assert(start >= prefix.length && end > start);
  const bindings = JSON.parse(code.slice(start, end));
  assert.equal(bindings.length, 5);
  let mutationsExecuted = 0;
  async function loadReceiver(candidate) {
    const executable = candidate.replace("from 'typescript'", 'from '+JSON.stringify(import.meta.resolve('typescript')))
      .replace("from './docs-shell-source-custody.mjs'", 'from '+JSON.stringify(pathToFileURL(path.join(repository, 'scripts/docs-shell-source-custody.mjs')).href));
    const moduleFile = path.join(root, 'receiver-'+mutationsExecuted+'.mjs');
    fs.writeFileSync(moduleFile, executable); mutationsExecuted++;
    return import(pathToFileURL(moduleFile).href);
  }
  for (const mutate of [
    rows => rows.slice(1),
    rows => [rows[0], rows[0], ...rows.slice(2)],
    rows => [...rows].reverse(),
    rows => [...rows, {...rows[0], path: 'scripts/unapproved.mjs'}],
    rows => rows.map((row, i) => i ? row : {...row, path: 'scripts/unapproved.mjs'}),
    rows => rows.map((row, i) => i ? row : {...row, extra: true}),
    rows => rows.map((row, i) => i ? row : {...row, sha256: 'not-a-digest'}),
    rows => rows.map((row, i) => i ? row : {...row, historicalSha256: '0'.repeat(64)}),
    rows => rows.map((row, i) => i ? row : {...row, sha256: '0'.repeat(64)}),
    rows => rows.slice(0, 4),
    rows => rows.slice(0, 3),
    rows => rows.map((row, i) => i === 3 ? {...row, historicalSha256: '0'.repeat(64)} : row),
    rows => rows.map((row, i) => i === 3 ? {...row, sha256: '0'.repeat(64)} : row),
    rows => rows.map((row, i) => i === 4 ? {...row, historicalSha256: '0'.repeat(64)} : row),
    rows => rows.map((row, i) => i === 4 ? {...row, sha256: '0'.repeat(64)} : row),
  ]) {
    const candidate = code.slice(0, start) + JSON.stringify(mutate(structuredClone(bindings))) + code.slice(end);
    const receiver = await loadReceiver(candidate);
    assert.throws(() => receiver.checkedTopLevelScriptPurposes(root, graph, original, sources, nativePackageEntries), diagnostic);
  }
  const producerPrefix = 'const currentTopLevelProducerBinding20261101 = Object.freeze(';
  const producerStart = code.indexOf(producerPrefix)+producerPrefix.length;
  const producerEnd = code.indexOf(');\nfunction currentTopLevelPurposeAuthority', producerStart);
  assert(producerStart >= producerPrefix.length && producerEnd > producerStart);
  const producer = JSON.parse(code.slice(producerStart, producerEnd));
  for (const mutate of [
    r => ({...r, historicalSha256:'0'.repeat(64)}),
    r => ({...r, sha256:'0'.repeat(64)}),
    r => ({...r, historicalDescriptors:r.historicalDescriptors.slice(1)}),
    r => ({...r, descriptors:r.descriptors.map((row,i)=>i?row:{...row,line:999})}),
    r => ({...r, historicalSlots:[]}),
    r => ({...r, slots:r.slots.map((row,i)=>i?row:{...row,line:999})}),
    r => ({...r, historicalOutgoingEdges:r.historicalOutgoingEdges.slice(1)}),
    r => ({...r, outgoingEdges:[...r.outgoingEdges,{source:r.path,target:'scripts/unapproved.mjs',kind:'import',operation:'import unapproved'}]}),
  ]) {
    const candidate=code.slice(0,producerStart)+JSON.stringify(mutate(structuredClone(producer)))+code.slice(producerEnd);
    const receiver=await loadReceiver(candidate);
    assert.throws(()=>receiver.checkedTopLevelScriptPurposes(root,graph,original,sources,nativePackageEntries),diagnostic);
  }
});


test('four retained occurrences keep genuine UNKNOWN and require acquired exact-slot receipts', () => {
  const classify = createSerializedOutputRoleClassifier(repository, classifierUniverse);
  const receipt = checkedTopLevelScriptPurposes(repository, graph, classify, sources, nativePackageEntries);
  const selected = authority.descriptors.filter(row => editorial.sources.includes(row.source));
  assert.equal(selected.length, 4);
  for (const descriptor of selected) {
    const role = classify(descriptor.source).find(row => row.line === descriptor.line && row.sink === descriptor.sink);
    assert.equal(role.role, 'unknown');
    const before = structuredClone(role);
    const purpose = selectedTopLevelScriptPurpose(descriptor.source, role, receipt);
    assert.equal(purpose.canonicalRawRole, 'unknown');
    assert.equal(purpose.runtimeExecutionAuthorized, false);
    assert.equal(purpose.apiApplyAuthorized, false);
    assert.deepEqual(role, before);
    assert.throws(() => selectedTopLevelScriptPurpose(descriptor.source, role, {...receipt}), /unacquired receipt/u);
    for (const changed of [{...role, line: role.line+1}, {...role, sink: 'console.log'}, {...role, expression: 'arbitraryInput'}, {...role, role: 'non-api'}]) {
      assert.throws(() => selectedTopLevelScriptPurpose(descriptor.source, changed, receipt), /changed canonical slot or role/u);
    }
  }
});

test('retained transitive caller, native package, public, alias and unresolved-loader changes refuse authority', () => fixture(({root, acquire}) => {
  acquire();
  const retainedFailure = /retained editorial caller\/public\/alias\/dynamic context/u;
  const projection = 'scripts/docs-retained-language-projection.mjs';
  assert.throws(() => acquire(original, {...graph, edges: [...graph.edges, {source: 'scripts/new-runtime-consumer.mjs', target: projection, kind: 'import', operation: 'import newConsumer'}]}), retainedFailure);
  assert.throws(() => acquire(original, {...graph, publicEntries: [...graph.publicEntries, {path: 'scripts/new-alias.mjs', canonicalSource: projection}]}), retainedFailure);
  assert.throws(() => acquire(original, {...graph, aliases: [...graph.aliases, {source: 'scripts/new-alias.mjs', target: editorial.sources[0]}]}), retainedFailure);
  assert.throws(() => acquire(original, {...graph, dynamicOperations: [...graph.dynamicOperations, {source: 'scripts/new-runtime-consumer.mjs', expression: 'import(selected)', operation: 'import(selected)', hints: []}]}), retainedFailure);
  const changed = structuredClone(graph.dynamicOperations); changed[0].operation += '\n';
  assert.throws(() => acquire(original, {...graph, dynamicOperations: changed}), retainedFailure);
  assert.throws(() => checkedTopLevelScriptPurposes(root, graph, original, sources), /native package entry acquisition required/u);
  assert.throws(() => checkedTopLevelScriptPurposes(root, graph, original, sources, [...nativePackageEntries, {name: 'runtime:retained', command: 'node '+projection, source: projection}]), retainedFailure);
}));

const manifestSources = standalone.sources;
test('standalone verification family selects all134 retained UNKNOWN occurrences without role mutation or API grants', () => {
  const classify = createSerializedOutputRoleClassifier(repository, classifierUniverse);
  const receipt = checkedTopLevelScriptPurposes(repository, graph, classify, sources, nativePackageEntries);
  let selected = 0, total = 0;
  for (const source of manifestSources) for (const role of classify(source)) {
    total++; const before = JSON.stringify(role);
    const purpose = selectedTopLevelScriptPurpose(source, role, receipt);
    assert.equal(JSON.stringify(role), before);
    if (role.role === 'unknown' && standalone.slots.some(slot => slot.source === source && slot.line === role.line && slot.sink === role.sink)) {
      assert(purpose); selected++;
      assert.equal(purpose.canonicalRawRole, 'unknown');
      assert.equal(purpose.runtimeExecutionAuthorized, false);
      assert.equal(purpose.apiApplyAuthorized, false);
      assert.match(purpose.purpose, /receiving context/u);
    } else assert.equal(purpose, null);
  }
  assert.equal(selected, 134); assert.equal(total, 375);
  const outside = 'unreviewed-production-writer.mjs';
  // Foreign Source rejection only, not a native classification observation.
  assert.equal(selectedTopLevelScriptPurpose(outside, {line: 12, sink: 'fs.writeFileSync', role: 'unknown'}, receipt), null);
});
test('standalone family rejects changes in each complete Source/caller input', () => fixture(({root, write, acquire}) => {
  acquire();
  for (const source of standalone.contextSources) {
    const bytes = fs.readFileSync(path.join(root, source));
    write(source, Buffer.concat([bytes, Buffer.from('\n')]));
    assert.throws(() => acquire(), diagnostic, source);
    write(source, bytes);
  }
  acquire();
}));
test('standalone family retains actual incoming outgoing native command and public boundaries', () => fixture(({root, write, acquire}) => {
  const helper = manifestSources.find(source => source.includes('/support/'));
  assert.throws(() => acquire(original, {...graph, edges: [...graph.edges,
    {source: 'unreviewed.mjs', target: helper, kind: 'import', operation: 'import x'}]}), diagnostic);
  const outgoing = graph.edges.find(edge => standalone.contextSources.includes(edge.source)
    && !sources.includes(edge.target)); assert(outgoing);
  assert.throws(() => acquire(original, {...graph, edges: graph.edges.filter(edge => edge !== outgoing)}), diagnostic);
  assert.throws(() => acquire(original, {...graph, publicEntries: [...graph.publicEntries,
    {path: 'new-alias.mjs', canonicalSource: helper}]}), diagnostic);
  const entries = nativePackageEntries.map(entry => standalone.contextSources.includes(entry.source)
    ? {...entry, command: entry.command + ' --unreviewed'} : entry);
  assert.throws(() => acquire(original, graph, sources, entries), diagnostic);
  const packageBytes = fs.readFileSync(path.join(root, 'package.json'));
  const pkg = JSON.parse(packageBytes), entry = standalone.packageEntries[0];
  pkg.scripts[entry.name] += ' --changed-physical-command';
  write('package.json', JSON.stringify(pkg));
  assert.throws(() => acquire(), /actual maintained command/u);
  write('package.json', packageBytes);
  const dynamic = {source: manifestSources[0], expression: 'unresolved', operation: 'import(unknown)', hints: []};
  assert.throws(() => acquire(original, {...graph, dynamicOperations: [...graph.dynamicOperations, dynamic]}), diagnostic);
}));

// Finite saved-row receiving-purpose regression, not runtime acceptance or payload truth.
const finalReceivingRows = [
  {
    "source": "tests/verification/historical-branch-acceptance/delivery-manifest-stage-boundary.test.mjs",
    "rowId": "1001:0",
    "line": 22,
    "sink": "console.log"
  },
  {
    "source": "tests/verification/reliability/adapter-dependency-boundary.test.mjs",
    "rowId": "1017:3",
    "line": 32,
    "sink": "console.log"
  },
  {
    "source": "tests/verification/reliability/admission-retirement.test.mjs",
    "rowId": "1025:4",
    "line": 134,
    "sink": "fs.writeFileSync"
  },
  {
    "source": "tests/verification/reliability/admission-retirement.test.mjs",
    "rowId": "1025:5",
    "line": 134,
    "sink": "fs.writeFileSync"
  },
  {
    "source": "tests/verification/reliability/blob-read-independent.test.mjs",
    "rowId": "1036:0",
    "line": 17,
    "sink": "fs.writeFileSync"
  },
  {
    "source": "tests/verification/reliability/blob-read-independent.test.mjs",
    "rowId": "1036:2",
    "line": 37,
    "sink": "console.log"
  },
  {
    "source": "tests/verification/reliability/delivery-manifest-v3-stage-boundary.test.mjs",
    "rowId": "1050:0",
    "line": 23,
    "sink": "console.log"
  },
  {
    "source": "tests/verification/reliability/delivery-manifest-v3-stage-boundary.test.mjs",
    "rowId": "1050:1",
    "line": 34,
    "sink": "console.log"
  },
  {
    "source": "tests/verification/reliability/delivery-manifest-v3-stage-boundary.test.mjs",
    "rowId": "1050:2",
    "line": 44,
    "sink": "console.log"
  },
  {
    "source": "tests/verification/reliability/delivery-manifest-v3-stage-boundary.test.mjs",
    "rowId": "1050:3",
    "line": 54,
    "sink": "console.log"
  },
  {
    "source": "tests/verification/reliability/discord-delivery-receipt.test.mts",
    "rowId": "1053:0",
    "line": 27,
    "sink": "fs.writeFileSync"
  },
  {
    "source": "tests/verification/reliability/kubernetes-manifest-budget.test.mjs",
    "rowId": "1062:0",
    "line": 33,
    "sink": "fs.writeFileSync"
  },
  {
    "source": "tests/verification/reliability/nova-dispatch-projection.test.mjs",
    "rowId": "1069:3",
    "line": 160,
    "sink": "console.log"
  },
  {
    "source": "tests/verification/reliability/operator-request-projection.test.mjs",
    "rowId": "1078:1",
    "line": 75,
    "sink": "fs.writeFileSync"
  },
  {
    "source": "tests/verification/reliability/operator-request-projection.test.mjs",
    "rowId": "1078:2",
    "line": 85,
    "sink": "fs.writeFileSync"
  },
  {
    "source": "tests/verification/reliability/operator-request-projection.test.mjs",
    "rowId": "1078:3",
    "line": 90,
    "sink": "fs.writeFileSync"
  },
  {
    "source": "tests/verification/reliability/report-evidence.test.mts",
    "rowId": "1099:10",
    "line": 127,
    "sink": "fs.writeFileSync"
  },
  {
    "source": "tests/verification/reliability/report-evidence.test.mts",
    "rowId": "1099:11",
    "line": 127,
    "sink": "fs.writeFileSync"
  },
  {
    "source": "tests/verification/reliability/report-evidence.test.mts",
    "rowId": "1099:14",
    "line": 145,
    "sink": "fs.writeFileSync"
  },
  {
    "source": "tests/verification/reliability/report-evidence.test.mts",
    "rowId": "1099:15",
    "line": 145,
    "sink": "fs.writeFileSync"
  },
  {
    "source": "tests/verification/reliability/report-evidence.test.mts",
    "rowId": "1099:16",
    "line": 149,
    "sink": "fs.writeFileSync"
  },
  {
    "source": "tests/verification/reliability/review-cache-legacy-prefix.test.mjs",
    "rowId": "1103:0",
    "line": 85,
    "sink": "fs.writeFileSync"
  },
  {
    "source": "tests/verification/reliability/review-report-locales.test.mjs",
    "rowId": "1114:0",
    "line": 11,
    "sink": "process.stdout.write"
  },
  {
    "source": "scripts/tests/api-output-publication-native-custody.test.mjs",
    "rowId": "1162:0",
    "line": 59,
    "sink": "unknown-output-function"
  },
  {
    "source": "scripts/tests/api-output-publication-native-custody.test.mjs",
    "rowId": "1162:1",
    "line": 72,
    "sink": "unknown-output-function"
  },
  {
    "source": "scripts/tests/api-output-publication-native-custody.test.mjs",
    "rowId": "1162:2",
    "line": 85,
    "sink": "unknown-output-function"
  },
  {
    "source": "skills/nova/plugins/review/scripts/generate-bundle-schema.mjs",
    "rowId": "609:1",
    "line": 40,
    "sink": "fs.writeFileSync"
  },
  {
    "source": "skills/prism/server/bootstrap-database.ts",
    "rowId": "770:0",
    "line": 15,
    "sink": "process.stderr.write"
  },
  {
    "source": "skills/prism/server/ingestion.ts",
    "rowId": "775:0",
    "line": 20,
    "sink": "console.error"
  },
  {
    "source": "skills/prism/server/ingestion.ts",
    "rowId": "775:1",
    "line": 20,
    "sink": "console.error"
  },
  {
    "source": "skills/prism/server/ingestion.ts",
    "rowId": "775:2",
    "line": 77,
    "sink": "fs.writeFileSync"
  }
];
test('all31 residual receiving rows join exact canonical descriptors without raw-role mutation', () => fixture(({acquire}) => {
  const receipt = acquire();
  // These ledger rows retain their historical coordinates. Resolve only the
  // authenticated concrete producer successor already checked by this fixture.
  assert.equal(finalReceivingRows.filter(row => row.source === companion.path).length, companion.historicalDescriptors.length);
  for (const historicalSlot of finalReceivingRows) {
    let slot = historicalSlot;
    if (slot.source === companion.path) {
      const matches = companion.historicalDescriptors.map((row,index) => ({row,index}))
        .filter(({row}) => row.source === slot.source && row.line === slot.line && row.sink === slot.sink);
      assert.equal(matches.length, 1, slot.rowId);
      const current = companion.descriptors[matches[0].index];
      assert.deepEqual(current, {...matches[0].row,line:current.line});
      assert.equal(current.role, 'unknown');
      assert.equal(current.source, slot.source); assert.equal(current.sink, slot.sink);
      slot = {...slot,line:current.line};
    }
    const candidates = original(slot.source).filter(role => role.line === slot.line && role.sink === slot.sink);
    assert(candidates.length, slot.rowId);
    for (const role of candidates) {
      const before = structuredClone(role);
      const purpose = selectedTopLevelScriptPurpose(slot.source, role, receipt);
      assert(purpose, slot.rowId);
      assert.equal(purpose.canonicalRawRole, 'unknown');
      assert.equal(purpose.runtimeExecutionAuthorized, false);
      assert.equal(purpose.apiApplyAuthorized, false);
      assert.deepEqual(role, before);
      assert.throws(() => selectedTopLevelScriptPurpose(slot.source, {...role, expression: 'FORGED-UNSEALED'}, receipt), /changed canonical slot/u);
    }
  }
  const repeatSource = 'tests/verification/reliability/admission-retirement.test.mjs';
  const repeated = original(repeatSource).filter(role => role.line === 134 && role.sink === 'fs.writeFileSync');
  assert.equal(repeated.length, 2);
  assert.notDeepEqual(repeated[0], repeated[1]);
  for (const role of repeated) assert(selectedTopLevelScriptPurpose(repeatSource, role, receipt));
  const quarantine = original('skills/prism/server/ingestion.ts').find(role => role.line === 77);
  assert.match(selectedTopLevelScriptPurpose('skills/prism/server/ingestion.ts', quarantine, receipt).purpose, /raw BYTES/u);
  assert.equal(selectedTopLevelScriptPurpose('tests/verification/live/prism-production-failures.mjs', {line:6,sink:'kubectl-request',role:'unknown'}, receipt), null);
}));

test('new workspace declarations and complete receiving context cannot drift', () => fixture(({root,write,acquire}) => {
  acquire();
  for (const item of declarationServer.workspacePackages) {
    const bytes = fs.readFileSync(path.join(root,item.path));
    write(item.path, JSON.stringify({scripts:{forged:'node arbitrary.mjs'}}));
    assert.throws(() => acquire(), diagnostic);
    write(item.path, bytes);
  }
  const target = declarationServer.sources[0];
  assert.throws(() => acquire(original, {...graph,edges:[...graph.edges,{source:'scripts/foreign-product.mjs',target,kind:'import',operation:'import x'}]}), diagnostic);
  assert.throws(() => acquire(original, {...graph,publicEntries:[...graph.publicEntries,{path:'foreign.mjs',canonicalSource:target}]}), diagnostic);
  assert.throws(() => acquire(original, graph, sources, [...nativePackageEntries,{source:target,name:'forged',command:'node arbitrary.mjs'}]), diagnostic);
  assert.throws(() => acquire(original, {...graph,dynamicOperations:[...graph.dynamicOperations,{source:target,expression:'import(x)',operation:'import(x)',hints:[]}]}), diagnostic);
}));
