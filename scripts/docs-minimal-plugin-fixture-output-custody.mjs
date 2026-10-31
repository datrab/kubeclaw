import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

// Three closed metadata writes and one exact program-fixture text write, not permission
// to run its Core imports, npm/role children, plugin code or local runtime.
const source = 'scripts/check-ap08-minimal-plugin.mjs';
const inputs = Object.freeze([
  {path: source, sha256: 'b5b01f1734372e34237d1c41c710d014db3629f252ead3baa96448620e2025c4'},
  {path: 'scripts/check-runtime-role-manifests.mjs', sha256: '521f14214afa42f7651ef81eca689f206cf3bc63c1c9edeb2376037dfba7d80c'},
  {path: 'docs/site/extend/examples/minimal-stage/plugin.json', sha256: 'ffcd1ea2b759081d86a9812ea05b37a347ce13bd1a68a2640bf1e0a29146bd73'},
  {path: 'docs/site/extend/examples/minimal-stage/package.json', sha256: '858afd76f0e8f9d21fac54b22cb409b5c11effd93b5530c91eb40bc4b9907a39'},
  {path: 'docs/site/extend/examples/minimal-stage/src/stage.js', sha256: 'c57349a102e2a549c270e3a9062460fce887ab642f330a9b78980611272322e0'},
].map(Object.freeze));
const slots = Object.freeze([
  Object.freeze({line: 176, expression: 'JSON.stringify(probeManifest)'}),
  Object.freeze({line: 179, expression: 'JSON.stringify(probePackage)'}),
  Object.freeze({line: 235, expression: 'JSON.stringify(replacementManifest)'}),
]);
const programFixtureSlot = Object.freeze({line: 240, expression: "originalModule.replace(greeting,\n    '${context.contract.config.prefix}-v2, ${input.name}!')"});
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
  // The separately copied replacement manifest keeps package/registration/type
  // identities and schemas, changing only packageVersion to 2.0.0 under the
  // private replacement root before normal local Registry/Foundation selection.
  // Neither metadata role authorizes that selection, module writes or execution.
  // A separate exact text-write role binds the pinned capability-free stage.js
  // source copied to the private replacement root: one uniquely asserted fixed
  // greeting substitution only, consumed by the existing local stage fixture.
  // This is source-program text, not metadata or Kubernetes resource output;
  // passive classification never grants module import, execution or apply.
  const inputDigest = hash(JSON.stringify(facts));
  const prior = cache.get(root);
  if (prior?.inputDigest === inputDigest) return prior;
  const receipt = Object.freeze({source, inputDigest,
    dependencies: Object.freeze(facts.map(input => input.path)),
    runtimeExecutionAuthorized: false, moduleImportAuthorized: false, apiApplyAuthorized: false});
  receipts.add(receipt); cache.set(root, receipt); return receipt;
}

export function minimalPluginFixtureOutputRole(role, receipt) {
  if (!receipt || !receipts.has(receipt) || role.role !== 'unknown' || role.sink !== 'fs.writeFileSync') return role;
  const programFixture = programFixtureSlot.line === role.line && programFixtureSlot.expression === role.expression;
  if (!programFixture && !slots.some(slot => slot.line === role.line && slot.expression === role.expression)) return role;
  return {...role, role: 'non-api',
    basis: programFixture ? 'exact-temporary-capability-free-plugin-program-fixture' : role.line === 235 ? 'exact-temporary-plugin-replacement-manifest-metadata' : 'exact-temporary-plugin-role-probe-metadata',
    dependencies: [...new Set([...(role.dependencies ?? []), ...receipt.dependencies])],
    [programFixture ? 'programFixtureCustodyDigest' : 'fixtureMetadataCustodyDigest']: receipt.inputDigest};
}
