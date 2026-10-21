import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

// Two closed metadata writes in the original tutorial checker, not permission
// to run its Core imports, npm/role children, plugin code or local runtime.
const source = 'scripts/check-ap08-minimal-plugin.mjs';
const inputs = Object.freeze([
  {path: source, sha256: '5fb5e2db66603a145edb2ab0abd5cbe3739a7a90e808ecde138cd08eca134dfa'},
  {path: 'scripts/check-runtime-role-manifests.mjs', sha256: '521f14214afa42f7651ef81eca689f206cf3bc63c1c9edeb2376037dfba7d80c'},
  {path: 'docs/site/extend/examples/minimal-stage/plugin.json', sha256: 'ffcd1ea2b759081d86a9812ea05b37a347ce13bd1a68a2640bf1e0a29146bd73'},
  {path: 'docs/site/extend/examples/minimal-stage/package.json', sha256: '858afd76f0e8f9d21fac54b22cb409b5c11effd93b5530c91eb40bc4b9907a39'},
].map(Object.freeze));
const slots = Object.freeze([
  Object.freeze({line: 176, expression: 'JSON.stringify(probeManifest)'}),
  Object.freeze({line: 179, expression: 'JSON.stringify(probePackage)'}),
]);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const receipts = new WeakSet(), cache = new Map();

export function minimalPluginFixtureOutputCustody(root, selectedSource, sourceBytes) {
  if (selectedSource !== source) return null;
  const fail = detail => assert.fail(`MINIMAL_PLUGIN_FIXTURE_OUTPUT_UNQUALIFIED: ${source}; ${detail}`);
  if (!path.isAbsolute(root) || fs.realpathSync(root) !== root) fail('canonical root');
  const facts = [];
  for (const input of inputs) {
    const absolute = path.join(root, input.path);
    if (!fs.existsSync(absolute) || fs.realpathSync(absolute) !== absolute || !fs.lstatSync(absolute).isFile()) fail('physical input ' + input.path);
    const bytes = fs.readFileSync(absolute);
    if (hash(bytes) !== input.sha256) fail('changed source/fixture/consumer ' + input.path);
    if (input.path === source && !bytes.equals(Buffer.from(sourceBytes))) fail('selected source snapshot');
    facts.push(input);
  }
  // Original source copies this exact fixture to a fresh role-probe directory,
  // changes only plugin id/package name, then passes its plugin.json to the
  // pinned --additional-plugin ownership consumer. No arbitrary argv payload.
  const inputDigest = hash(JSON.stringify(facts));
  const prior = cache.get(root);
  if (prior?.inputDigest === inputDigest) return prior;
  const receipt = Object.freeze({source, inputDigest,
    dependencies: Object.freeze(facts.map(input => input.path)),
    runtimeExecutionAuthorized: false, moduleImportAuthorized: false, apiApplyAuthorized: false});
  receipts.add(receipt); cache.set(root, receipt); return receipt;
}

export function minimalPluginFixtureOutputRole(role, receipt) {
  if (!receipt || !receipts.has(receipt) || role.role !== 'unknown' || role.sink !== 'fs.writeFileSync'
    || !slots.some(slot => slot.line === role.line && slot.expression === role.expression)) return role;
  return {...role, role: 'non-api', basis: 'exact-temporary-plugin-role-probe-metadata',
    dependencies: [...new Set([...(role.dependencies ?? []), ...receipt.dependencies])],
    fixtureMetadataCustodyDigest: receipt.inputDigest};
}
