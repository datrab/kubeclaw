import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { expandSwarmConfig, pipelineProfileFromSwarm } from './support/platform-config.ts';
const authored = JSON.parse(fs.readFileSync(new URL('../../../charts/kubeclaw/files/config/swarm.config.json', import.meta.url), 'utf8'));
test('CE01 shared authorship is centrally validated before explicit E2E-profile projection', () => {
  const snapshot = JSON.stringify(authored);
  const profile = pipelineProfileFromSwarm(authored);
  assert.deepEqual(Object.keys(profile).sort(), ['_doc', 'features', 'overrides', 'profile', 'tuning']);
  const expanded = expandSwarmConfig({ ...profile, repo_root: '/tmp/profile-test' });
  assert.equal(Object.hasOwn(expanded, 'operator'), false);
  assert.ok(expanded.agents);
  assert.equal(JSON.stringify(authored), snapshot);
});
for (const field of ['root', 'operator', 'worker-value']) test(`CE02 ${field} rejects invalid central authorship before E2E derivation`, () => {
  const invalid = structuredClone(authored);
  if (field === 'root') invalid.unknown = true;
  else if (field === 'operator') invalid.operator.unknown = true;
  else invalid.operator.prism.worker.maximumConnections = 0;
  assert.throws(() => pipelineProfileFromSwarm(invalid), /SWARM_CONFIG_INVALID/);
  assert.throws(() => expandSwarmConfig(invalid), /SWARM_CONFIG_INVALID/);
});
test('CE03 run-scoped E2E overrides are added only after central validation and projection', () => {
  const profile = pipelineProfileFromSwarm(authored);
  profile.repo_root = '/tmp/real-profile'; profile.run_id = 'review-profile';
  profile.overrides = { agents: { forge: { cwd: '/tmp/real-profile' } } };
  const expanded = expandSwarmConfig(profile);
  assert.equal(expanded.agents.forge.cwd, '/tmp/real-profile');
  assert.equal(expanded.run_id, 'review-profile');
  assert.equal(Object.hasOwn(expanded, 'operator'), false);
});
