import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { preflightPipelineV10Owners, readSwarmBundle } from '../../../skills/common/plugin-runtime/foundation/config/swarm-bundle.ts';

const base = new URL('../../../docs/review/evidence/config-acceptance/c0-completion-20261013/', import.meta.url);
const read = (file: string) => JSON.parse(fs.readFileSync(new URL(file, base), 'utf8'));
const contract = read('PACKAGE-GENERATION-CONTRACT.json');
const root = JSON.parse(fs.readFileSync(new URL('../../../'+contract.baseRoot.path, import.meta.url), 'utf8'));
for (const operation of contract.rootPatch) {
  const parts = operation.path.split('/').slice(1);
  const target = parts.slice(0,-1).reduce((value: any, key: string) => value[key], root);
  const key = parts.at(-1)!;
  if (operation.op === 'test') assert.deepEqual(target[key], operation.value);
  else if (Array.isArray(target)) { assert.equal(key, '-'); target.push(structuredClone(operation.value)); }
  else target[key] = structuredClone(operation.value);
}
const owners = Object.fromEntries(Object.entries(root.components).map(([owner, file]) => [owner,
  read('same-entry-agent-role-binding-01/stand/config/'+file)]));
const clone = () => ({ root: structuredClone(root), owners: structuredClone(owners) });

test('v10 schema is exact corrected v9 plus approved package deltas, not a reconstructed root', () => {
  const bundle = JSON.parse(fs.readFileSync(new URL('../../../skills/common/plugin-runtime/foundation/config/pipeline-v10-owner-schemas.json', import.meta.url), 'utf8'));
  const schema = JSON.parse(fs.readFileSync(new URL('../../../'+contract.baseRootSchema.path, import.meta.url), 'utf8'));
  for (const operation of contract.rootSchemaPatch) {
    const parts = operation.path.split('/').slice(1), key = parts.at(-1)!;
    const target = parts.slice(0,-1).reduce((value: any, key: string) => value[key], schema);
    if (Array.isArray(target)) { assert.equal(key, '-'); target.push(operation.value); }
    else target[key] = operation.value;
  }
  assert.deepEqual(bundle.root, schema);
  for (const [owner, reference] of Object.entries(bundle.provenance.componentSchemas)) {
    const ref = reference as { path: string; sha256: string };
    const bytes = fs.readFileSync(new URL('../../../'+ref.path, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), ref.sha256);
    assert.deepEqual(bundle.components[owner], JSON.parse(bytes.toString('utf8')));
  }
});

test('exact full v10 root and ALL six owner profile sets pass LOCAL structural preflight, not activation', () => {
  const result = preflightPipelineV10Owners(root, owners);
  assert.equal(result.ownerProfileCounts['buster-engine'], 95);
  assert.equal(result.activationAllowed, false);
  assert.equal(Object.isFrozen(result.ownerProfileCounts), true);
});

test('malformed unselected Buster policy denies the entire candidate before tuple selection', () => {
  const candidate = clone();
  const buster = candidate.owners['buster-engine'];
  const profiles = buster.profiles;
  const selected = new Set(candidate.root.bindings.filter((b: any) => b.owner === 'buster-engine').map((b: any) => b.profileId));
  const unselected = Object.keys(profiles).find(name => !selected.has(name))!;
  profiles[unselected].settings.remotePlanService.shutdownTimeoutMs = 2147483648;
  assert.throws(() => preflightPipelineV10Owners(candidate.root, candidate.owners), /OWNER_INVALID|SERVICE_POLICY_INVALID/);
  delete profiles[unselected].settings.remotePlanService;
  assert.throws(() => preflightPipelineV10Owners(candidate.root, candidate.owners), /OWNER_INVALID/);
});

test('missing/extra owners, duplicate selections, wrong roles and absent profiles cannot form v10 candidate', () => {
  for (const mutation of [
    (c: ReturnType<typeof clone>) => { delete c.owners['worker-core']; },
    (c: ReturnType<typeof clone>) => { c.owners.extra = c.owners['worker-core']; },
    (c: ReturnType<typeof clone>) => { c.root.bindings.push(c.root.bindings[0]); },
    (c: ReturnType<typeof clone>) => { c.root.pluginSelections.push(c.root.pluginSelections[0]); },
    (c: ReturnType<typeof clone>) => { c.root.bindings[0].role = 'buster'; },
    (c: ReturnType<typeof clone>) => { c.root.bindings[0].profileId = 'not-an-original-profile'; },
  ]) { const candidate = clone(); mutation(candidate); assert.throws(() => preflightPipelineV10Owners(candidate.root, candidate.owners)); }
});

test('existing physical loader checks v10 root and every owner, but never emits partial v3 capture/receipt', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-v10-owners-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.mkdirSync(path.join(directory, 'components'));
  fs.writeFileSync(path.join(directory, 'pipeline.config.json'), JSON.stringify(root));
  for (const [name, owner] of Object.entries(owners)) fs.writeFileSync(path.join(directory, 'components', name+'.config.json'), JSON.stringify(owner));
  const binding = root.bindings.find((b: any) => b.owner === 'buster-engine');
  const selection = { role: 'buster' as const, callerId: 'buster-preparation' as const, serviceInstanceId: binding.instanceId,
    bindings: [{ owner: 'buster-engine' as const, instanceId: binding.instanceId, profileId: binding.profileId }] };
  assert.throws(() => readSwarmBundle(path.join(directory, 'pipeline.config.json'), selection), /V10_SOURCE_LAYOUT_REQUIRED/);
  // Whole-owner functional receiving precedes plugin/source I/O, including
  // unselected arms. No successful source/boot/caller authority is inferred.
  const busterFile = path.join(directory, 'components/buster-engine.config.json');
  const originalBuster = fs.readFileSync(busterFile);
  const selectedProfiles = new Set(root.bindings.filter((b: any) => b.owner === 'buster-engine').map((b: any) => b.profileId));
  const unselected = Object.keys(owners['buster-engine'].profiles).find(name => !selectedProfiles.has(name))!;
  assert.ok(unselected);
  for (const profileId of [binding.profileId, unselected]) {
    for (const field of ['maximumOutputBytes', 'maximumSourceBytes', 'closeTimeoutMs',
      'resultInputReserveMultiplier', 'completionPhaseAllowance', 'attemptEvidenceBytes']) {
      const changed = JSON.parse(originalBuster.toString());
      const preparation = changed.profiles[profileId].settings.preparation;
      if (field === 'maximumOutputBytes') preparation[field] = preparation.maximumResultBytes;
      else if (field === 'maximumSourceBytes') preparation[field] = preparation.maximumRequestBytes;
      else if (field === 'closeTimeoutMs') preparation[field] = preparation.drainTimeoutMs;
      else if (field === 'completionPhaseAllowance') preparation[field] = 2_147_483_647;
      else if (field === 'attemptEvidenceBytes') preparation[field] = Number.MAX_SAFE_INTEGER + 1;
      else {
        preparation[field] = 8;
        preparation.maximumOutputBytes = preparation.maximumResultBytes + 4 * preparation.maximumInputBytes;
      }
      fs.writeFileSync(busterFile, JSON.stringify(changed));
      assert.throws(() => readSwarmBundle(path.join(directory, 'pipeline.config.json'), selection),
        /BUSTER_PREPARATION_V10_/, `${profileId}:${field} before plugin I/O`);
    }
    for (const field of ['attemptEvidenceBytes', 'attemptEvidenceFiles', 'attemptLogBytes',
      'completionPhaseAllowance', 'storeLockWaitSeconds', 'tarDiagnosticCodeUnits', 'resultInputReserveMultiplier']) {
      const changed = JSON.parse(originalBuster.toString());
      delete changed.profiles[profileId].settings.preparation[field];
      fs.writeFileSync(busterFile, JSON.stringify(changed));
      assert.throws(() => readSwarmBundle(path.join(directory, 'pipeline.config.json'), selection), /OWNER_INVALID/);
    }
  }
  const supported = JSON.parse(originalBuster.toString());
  supported.profiles[binding.profileId].settings.preparation.resultInputReserveMultiplier = 8;
  fs.writeFileSync(busterFile, JSON.stringify(supported));
  assert.throws(() => readSwarmBundle(path.join(directory, 'pipeline.config.json'), selection), /V10_SOURCE_LAYOUT_REQUIRED/,
    'supported authored multiplier reaches original source denial, never a legacy default');
  fs.writeFileSync(busterFile, originalBuster);
  assert.throws(() => readSwarmBundle(path.join(directory, 'pipeline.config.json'), selection), /V10_SOURCE_LAYOUT_REQUIRED/,
    'restored complete original still denied without source installation');
  const wrong = structuredClone(root); wrong.unknownAuthor = 'not admitted';
  fs.writeFileSync(path.join(directory, 'pipeline.config.json'), JSON.stringify(wrong));
  fs.unlinkSync(path.join(directory, 'components/buster-engine.config.json'));
  assert.throws(() => readSwarmBundle(path.join(directory, 'pipeline.config.json'), selection), /V10_ROOT_INVALID/,
    'bad root denied before component I/O, no legacy/default fallback');
});
