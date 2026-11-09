import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {deploymentConfigOutputCustody, deploymentConfigOutputRole} from '../docs-deployment-config-output-custody.mjs';
import {classifySerializedOutputRoles} from '../docs-api-output-role-classification.mjs';
import {discoverScriptApiOutputs} from '../docs-api-output-discovery.mjs';

const repository = path.resolve(import.meta.dirname, '../..');
const source = 'scripts/bundle-override-values.mjs';
const inputs = [source, 'scripts/deploy.sh', 'charts/kubeclaw/templates/deployment.yaml'];
function fixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deployment-config-custody-'));
  const write = (file, bytes) => { fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true}); fs.writeFileSync(path.join(root, file), bytes); };
  try {
    for (const file of inputs) write(file, fs.readFileSync(path.join(repository, file)));
    write('package.json', '{"scripts":{}}');
    run({root, write, acquire: () => deploymentConfigOutputCustody(root, source, fs.readFileSync(path.join(root, source)))});
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
}

test('only original configuration-fragment slot gains role; no module, apply or fabricated-receipt grant', () => fixture(({root, acquire}) => {
  const contract = acquire(), [role] = classifySerializedOutputRoles(root, source);
  assert.equal(role.role, 'unknown');
  assert.equal(deploymentConfigOutputRole(role, contract).role, 'non-api');
  assert.equal(contract.runtimeExecutionAuthorized, false);
  assert.equal(contract.apiApplyAuthorized, false);
  assert.equal(deploymentConfigOutputRole(role, {...contract}), role);
  for (const changed of [{...role, line: 11}, {...role, sink: 'console.log'}, {...role, expression: '`apiVersion: ${process.argv[2]}\\nkind: Secret\\n`'}]) {
    assert.equal(deploymentConfigOutputRole(changed, contract), changed);
  }
  assert.equal(deploymentConfigOutputCustody(root, 'scripts/foreign.mjs', ''), null);
}));

test('real warm script-output cache rejects changed source becoming an API document', () => fixture(({root, write}) => {
  assert.deepEqual(discoverScriptApiOutputs(root), []);
  assert.deepEqual(discoverScriptApiOutputs(root), []);
  write(source, "process.stdout.write('apiVersion: v1\\nkind: Secret\\nmetadata: {name: foreign}\\n');\n");
  assert.throws(() => discoverScriptApiOutputs(root), /DEPLOYMENT_CONFIG_OUTPUT_CUSTODY_UNQUALIFIED: scripts\/bundle-override-values\.mjs; changed source\/caller\/consumer scripts\/bundle-override-values\.mjs/);
}));

for (const consumer of inputs.slice(1)) test(`real warm cache rejects changed caller/consumer ${consumer}`, () => fixture(({root, write}) => {
  assert.deepEqual(discoverScriptApiOutputs(root), []);
  assert.deepEqual(discoverScriptApiOutputs(root), []);
  write(consumer, fs.readFileSync(path.join(root, consumer), 'utf8') + '\n# changed receiver authority\n');
  assert.throws(() => discoverScriptApiOutputs(root), /DEPLOYMENT_CONFIG_OUTPUT_CUSTODY_UNQUALIFIED:.*changed source\/caller\/consumer/);
}));

test('new unrelated raw-string producer is not covered by the fixed fragment role', () => fixture(({root, write}) => {
  assert.deepEqual(discoverScriptApiOutputs(root), []);
  write('scripts/foreign.mjs', 'process.stdout.write(process.argv[2]);\n');
  assert.throws(() => discoverScriptApiOutputs(root), /API_PRODUCT_SCRIPT_OUTPUT_ROLE_UNQUALIFIED: scripts\/foreign\.mjs/);
}));
