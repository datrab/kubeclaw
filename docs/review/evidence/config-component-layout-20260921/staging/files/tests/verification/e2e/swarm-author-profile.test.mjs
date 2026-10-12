import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readTestBundle, writeTestBundle, canonicalSwarmEntry } from '../../fixtures/config/swarm-bundle.mjs';
import { expandSwarmConfig, pipelineProfileFromSwarm } from './support/platform-config.ts';
const authored = readTestBundle(canonicalSwarmEntry);
test('CE01 shared authorship is centrally validated before explicit E2E-profile projection', () => {
  const snapshot = JSON.stringify(authored);
  const profile = pipelineProfileFromSwarm(canonicalSwarmEntry);
  assert.deepEqual(Object.keys(profile).sort(), ['_doc', 'features', 'overrides', 'profile', 'tuning']);
  const expanded = expandSwarmConfig({ ...profile, repo_root: '/tmp/profile-test' });
  assert.equal(Object.hasOwn(expanded, 'operator'), false);
  assert.ok(expanded.agents);
  assert.equal(JSON.stringify(authored), snapshot);
});
for (const field of ['root', 'operator', 'worker-value']) test(`CE02 ${field} rejects invalid central authorship before E2E derivation`, t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-config-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'swarm.config.json');
  const invalid = structuredClone(authored);
  if (field === 'root') invalid.entry.unknown = true;
  else if (field === 'operator') invalid['prism-worker'].unknown = true;
  else invalid['prism-worker'].settings.ingress.maximumConnections = 0;
  writeTestBundle(file, invalid);
  assert.throws(() => pipelineProfileFromSwarm(file), /SWARM_CONFIG_INVALID/);
  assert.throws(() => expandSwarmConfig(file), /SWARM_CONFIG_INVALID/);
});
test('CE03 run-scoped E2E overrides are added only after central validation and projection', () => {
  const profile = pipelineProfileFromSwarm(canonicalSwarmEntry);
  profile.repo_root = '/tmp/real-profile'; profile.run_id = 'review-profile';
  profile.overrides = { agents: { forge: { cwd: '/tmp/real-profile' } } };
  const expanded = expandSwarmConfig(profile);
  assert.equal(expanded.agents.forge.cwd, '/tmp/real-profile');
  assert.equal(expanded.run_id, 'review-profile');
  assert.equal(Object.hasOwn(expanded, 'operator'), false);
});
