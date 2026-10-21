import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

// One reviewed CLI serializer and its actual append -> Helm-values receiver.
// Not a YAML/template interpreter, command execution or deployment permission.
const profile = Object.freeze({
  source: 'scripts/bundle-override-values.mjs',
  sourceSha256: '81fcc460046007538475e5ac02048f9855674d1dc70556fba2ddf4ac5587d51a',
  line: 10,
  sink: 'process.stdout.write',
  expression: '`codeBundle: ${JSON.stringify(codeBundle)}\\n`',
  inputs: Object.freeze([
    Object.freeze({path: 'scripts/deploy.sh', sha256: '97c1e39bf9cec6c1d5d8e11198af90ed04efd15a6077f2bbac1129c2ea0741e2'}),
    Object.freeze({path: 'charts/kubeclaw/templates/deployment.yaml', sha256: '8e780bc0033c3da5c0a3d4db53e8ba9e0753200a072ce0ed63a598c461231883'}),
  ]),
});
const acquisitions = new WeakSet();
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

export function deploymentConfigOutputCustody(root, source, sourceBytes) {
  if (source !== profile.source) return null;
  const fail = detail => assert.fail(`DEPLOYMENT_CONFIG_OUTPUT_CUSTODY_UNQUALIFIED: ${source}; ${detail}`);
  if (!path.isAbsolute(root) || fs.realpathSync(root) !== root) fail('canonical root');
  const facts = [];
  for (const input of [{path: source, sha256: profile.sourceSha256}, ...profile.inputs]) {
    const file = path.join(root, input.path);
    if (!fs.existsSync(file) || fs.realpathSync(file) !== file || !fs.lstatSync(file).isFile()) fail(`physical input ${input.path}`);
    const bytes = fs.readFileSync(file);
    if (hash(bytes) !== input.sha256) fail(`changed source/caller/consumer ${input.path}`);
    if (input.path === source && !bytes.equals(Buffer.from(sourceBytes))) fail('selected source snapshot');
    facts.push(input);
  }
  // argv strings enter JSON.stringify values under the single literal root
  // codeBundle. No caller string can become a YAML key/document separator.
  // The source has no imports; ordinary graph admission must remain separate.
  const contract = Object.freeze({
    source, inputDigest: hash(JSON.stringify(facts)),
    dependencies: Object.freeze(facts.map(input => input.path)),
    runtimeExecutionAuthorized: false, apiApplyAuthorized: false,
  });
  acquisitions.add(contract);
  return contract;
}

export function deploymentConfigOutputRole(role, contract) {
  if (!contract || !acquisitions.has(contract) || role.role !== 'unknown'
    || role.line !== profile.line || role.sink !== profile.sink || role.expression !== profile.expression) return role;
  return {...role, role: 'non-api', basis: 'reviewed-codeBundle-configuration-fragment',
    dependencies: [...new Set([...(role.dependencies ?? []), ...contract.dependencies])],
    configurationCustodyDigest: contract.inputDigest};
}
