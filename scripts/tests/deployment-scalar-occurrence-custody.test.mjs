import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import yaml from 'js-yaml';
import {deploymentScalarCallerFacts, deploymentScalarOccurrenceCustody, selectedDeploymentScalarOccurrences} from '../docs-deployment-scalar-occurrence-custody.mjs';
import {discoverScriptInputGraph} from '../docs-api-output-discovery.mjs';
import {classifySerializedOutputRoles} from '../docs-api-output-role-classification.mjs';

const repository = path.resolve(import.meta.dirname, '../..');
const source = 'scripts/bundle-values-field.mjs';
const graph = discoverScriptInputGraph(repository);
const bytes = fs.readFileSync(path.join(repository, source));
const rawRole = {role: 'unknown', line: 12, sink: 'process.stdout.write', expression: '`${value}\\n`'};
function fixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deployment-scalar-occurrence-'));
  const write = (file, value) => { fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true}); fs.writeFileSync(path.join(root, file), value); };
  try {
    // Genuine complete first-party caller bytes, not a fake tiny census/hash.
    for (const fact of deploymentScalarCallerFacts(repository)) {
      if (fact.alias) { fs.mkdirSync(path.dirname(path.join(root, fact.path)), {recursive: true}); fs.symlinkSync(fact.alias, path.join(root, fact.path)); }
      else { write(fact.path, fs.readFileSync(path.join(repository, fact.path))); fs.chmodSync(path.join(root, fact.path), fs.statSync(path.join(repository, fact.path)).mode & 0o777); }
    }
    for (const file of [...new Set([...graph.closureSources, 'package.json', 'node_modules/js-yaml/package.json', 'node_modules/js-yaml/dist/js-yaml.mjs'])]) write(file, fs.readFileSync(path.join(repository, file)));
    run({root, write, acquire: () => deploymentScalarOccurrenceCustody(root, source, fs.readFileSync(path.join(root, source)), graph)});
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
}

test('canonical stdout remains UNKNOWN while only six genuine consumer occurrences are qualified', () => fixture(({root, acquire}) => {
  const receipt = acquire();
  assert.equal(acquire(), receipt, 'real warmed occurrence cache may reuse only fully revalidated custody');
  assert.deepEqual(classifySerializedOutputRoles(repository, source).map(role => role.role), ['unknown']);
  assert.equal(receipt.canonicalRole, 'unknown');
  assert.equal(selectedDeploymentScalarOccurrences(rawRole, receipt).length, 6);
  assert.equal(selectedDeploymentScalarOccurrences(rawRole, {...receipt}), null);
  assert.throws(() => { receipt.occurrences[0].caller.line = 9999; }, TypeError);
  assert.throws(() => { receipt.occurrences[0].receivers.push({source: 'foreign'}); }, TypeError);
  assert.equal(selectedDeploymentScalarOccurrences({...rawRole, expression: 'process.argv[2]'}, receipt), null);
  assert.equal(receipt.runtimeExecutionAuthorized, false);
  assert.equal(receipt.apiApplyAuthorized, false);
}));

for (const [name, mutate] of [
  ['source', ({write}) => write(source, 'process.stdout.write(process.argv[2]);\n')],
  ['caller or pipe receiver', ({root, write}) => write('scripts/deploy.sh', fs.readFileSync(path.join(root, 'scripts/deploy.sh'), 'utf8') + '\nnode scripts/bundle-values-field.mjs base.yaml overlay.yaml archiveUrl | kubectl apply -f -\n')],
  ['new computed caller', ({write}) => write('scripts/new-caller.mjs', "import {spawnSync} from 'node:child_process';spawnSync(process.execPath,['scripts/'+'bundle-'+'values-field.mjs','foreign.yaml','','archiveUrl'],{stdio:'inherit'});\n")],
  ['new public package entry', ({root, write}) => { const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'))); pkg.scripts['verify:raw-bundle-value'] = 'node scripts/bundle-values-field.mjs foreign.yaml none archiveUrl'; write('package.json', JSON.stringify(pkg)); }],
  ['new filesystem alias', ({root}) => fs.symlinkSync('bundle-values-field.mjs', path.join(root, 'scripts/raw-alias.mjs'))],
  ['new package boundary', ({write}) => write('scripts/package.json', '{"type":"module"}')],
  ['new shadowing dependency', ({write}) => write('scripts/node_modules/js-yaml/package.json', '{"exports":"./foreign.mjs"}')],
]) test(`warm occurrence custody rejects changed ${name}`, () => fixture(context => {
  context.acquire(); context.acquire(); mutate(context);
  assert.throws(context.acquire, /DEPLOYMENT_SCALAR_OCCURRENCE_UNQUALIFIED/);
}));

test('new imported or aliased entry does not borrow original captured-use receipts', () => fixture(({root, acquire}) => {
  acquire();
  for (const changed of [{edges: [{source: 'scripts/wrapper.mjs', target: source}], publicEntries: graph.publicEntries},
    {edges: [], publicEntries: [{path: 'scripts/alias.mjs', canonicalSource: source}]}]) {
    assert.throws(() => deploymentScalarOccurrenceCustody(root, source, bytes, changed), /imported or aliased helper entry/);
  }
}));


test('warm occurrence custody binds selected excluded test bytes and newly selected docs membership', () => fixture(({root, write, acquire}) => {
  acquire(); acquire();
  const selectedTest = 'skills/buster/plugins/junit-report-adapter/tests/adapter.test.mjs';
  const original = fs.readFileSync(path.join(root, selectedTest));
  write(selectedTest, original + "\nimport {spawnSync} from 'node:child_process'; spawnSync(process.execPath,['scripts/'+'bundle-'+'values-field.mjs'],{stdio:'inherit'});\n");
  assert.throws(acquire, /changed selected graph closure membership\/physical bytes/);
  write(selectedTest, original);
  write('docs/new-caller.mjs', "import {spawnSync} from 'node:child_process'; spawnSync(process.execPath,['scripts/'+'bundle-'+'values-field.mjs'],{stdio:'inherit'});\n");
  assert.throws(() => deploymentScalarOccurrenceCustody(root, source, bytes, {...graph, closureSources: [...graph.closureSources, 'docs/new-caller.mjs']}), /changed selected graph closure membership\/physical bytes/);
}));

test('actual direct CLI can emit an API-shaped string: it receives no global non-API role', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'raw-bundle-value-'));
  try {
    const file = path.join(root, 'values.yaml');
    fs.writeFileSync(file, 'codeBundle:\n  archiveUrl: |\n    apiVersion: v1\n    kind: Secret\n    metadata: {name: not-an-authorized-body}\n');
    const result = spawnSync(process.execPath, [path.join(repository, source), file, '', 'archiveUrl'], {encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^apiVersion: v1\nkind: Secret\n/);
    assert.deepEqual(classifySerializedOutputRoles(repository, source).map(role => role.role), ['unknown']);
    assert.equal(selectedDeploymentScalarOccurrences(rawRole, {}), null);
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});


test('actual original capture and append preserve an API-shaped scalar as one configuration value', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scalar-capture-to-config-'));
  try {
    const input = path.join(root, 'input.yaml'), output = path.join(root, 'output.yaml');
    fs.writeFileSync(input, 'codeBundle:\n  archiveUrl: |\n    apiVersion: v1\n    kind: Secret\n    metadata: {name: not-an-authorized-body}\n');
    const deploy = fs.readFileSync(path.join(repository, 'scripts/deploy.sh'), 'utf8');
    const reader = deploy.match(/bundle_values_field\(\) \{[\s\S]*?\n\}/u)[0];
    const append = deploy.match(/append_code_bundle_override_file\(\) \{[\s\S]*?\n\}/u)[0];
    const result = spawnSync('bash', ['-c', 'set -euo pipefail; REPO_DIR="$1"; ' + reader + '; ' + append + '; selected="$(bundle_values_field "$2" "" archiveUrl)"; append_code_bundle_override_file "$3" "$selected" revision v2', 'capture-test', repository, input, output], {encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr);
    const docs = yaml.loadAll(fs.readFileSync(output, 'utf8'));
    assert.equal(docs.length, 1);
    assert.deepEqual(Object.keys(docs[0]), ['codeBundle']);
    assert.equal(docs[0].codeBundle.archiveUrl, 'apiVersion: v1\nkind: Secret\nmetadata: {name: not-an-authorized-body}');
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});

test('resource assignment return and stdout stay unknown outside their single --set-json capture', () => fixture(({root, write}) => {
  const target = 'scripts/buster-resource-overlay.mjs';
  const targetGraph = graph;
  const acquire = () => deploymentScalarOccurrenceCustody(root, target, fs.readFileSync(path.join(root, target)), targetGraph);
  const receipt = acquire(); assert.equal(acquire(), receipt);
  const roles = classifySerializedOutputRoles(repository, target);
  assert.deepEqual(roles.map(role => role.role), ['unknown', 'unknown']);
  assert.deepEqual(roles.map(role => selectedDeploymentScalarOccurrences(role, receipt).map(item => item.caller.line)), [[1390], [1390]]);
  assert.equal(selectedDeploymentScalarOccurrences(roles[0], {...receipt}), null);
  assert.equal(selectedDeploymentScalarOccurrences({...roles[0], role: 'non-api'}, receipt), null);
  assert.throws(() => deploymentScalarOccurrenceCustody(root, target, fs.readFileSync(path.join(root, target)), {edges: [{source: 'scripts/foreign.mjs', target}], publicEntries: []}), /imported or aliased helper entry/);
  write('scripts/deploy.sh', fs.readFileSync(path.join(root, 'scripts/deploy.sh'), 'utf8').replace('helm_args+=(--set-json "$runtime_resources")', 'helm_args+=(--values "$runtime_resources")'));
  assert.throws(acquire, /DEPLOYMENT_SCALAR_OCCURRENCE_UNQUALIFIED/);
}));

test('actual resource CLI emits only the selected resource assignment and rejects document-shaped quantities', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'resource-assignment-'));
  try {
    const base = path.join(root, 'base.yaml'), overlay = path.join(root, 'overlay.yaml');
    fs.writeFileSync(base, JSON.stringify({extraContainers: [{name: 'neighbor'}, {name: 'buster-v2-runtime', image: 'not-copied', env: [{name: 'TOKEN', value: 'not-copied'}]}]}));
    const run = resources => { fs.writeFileSync(overlay, JSON.stringify(resources)); return spawnSync(process.execPath, [path.join(repository, 'scripts/buster-resource-overlay.mjs'), base, overlay], {encoding: 'utf8'}); };
    const resources = {requests: {cpu: '0', memory: '2Gi'}, limits: {cpu: '1500m', memory: '8Gi'}};
    const valid = run({busterRuntimeResources: resources});
    assert.equal(valid.status, 0, valid.stderr);
    assert.equal(valid.stdout, 'extraContainers[1].resources=' + JSON.stringify(resources));
    assert.equal(run({}).stdout, '');
    const replaced = run({busterRuntimeResources: resources, extraContainers: [{name: 'buster-v2-runtime'}]});
    assert.match(replaced.stdout, /^extraContainers\[0\]\.resources=/);
    for (const bad of [{...resources, apiVersion: 'v1', kind: 'Secret'}, {...resources, requests: {...resources.requests, cpu: '1\n---\napiVersion: v1\nkind: Secret'}}]) {
      const result = run({busterRuntimeResources: bad});
      assert.notEqual(result.status, 0); assert.equal(result.stdout, ''); assert.match(result.stderr, /BUSTER_RESOURCE_OVERLAY_INVALID/);
    }
    const missing = run({busterRuntimeResources: resources, extraContainers: []});
    assert.notEqual(missing.status, 0); assert.equal(missing.stdout, ''); assert.match(missing.stderr, /BUSTER_RESOURCE_CONTAINER_REQUIRED/);
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});
