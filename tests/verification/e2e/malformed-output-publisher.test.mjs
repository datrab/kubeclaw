import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  malformedOutputScenarioConfig,
  publishMalformedOutput,
} from './malformed-output-publisher.mjs';

test('malformed output publisher deterministically writes the Forge invalid artifact after trigger', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'real-e2e-malformed-'));
  const swarmDir = path.join(root, '.swarm');
  const config = malformedOutputScenarioConfig('forge-malformed-output');
  const triggerPath = path.join(swarmDir, config.trigger);
  fs.mkdirSync(path.dirname(triggerPath), { recursive: true });
  fs.writeFileSync(triggerPath, 'redacted prompt metadata\n');

  const manifest = await publishMalformedOutput({
    scenario: 'forge-malformed-output',
    swarmDir,
    runId: 'real-e2e-test',
    project: 'real-pipeline-e2e-test',
    timeoutMs: 1000,
    pollMs: 10,
  });

  const targetPath = path.join(swarmDir, config.target);
  assert.equal(fs.readFileSync(targetPath, 'utf8'), config.raw);
  assert.throws(() => JSON.parse(fs.readFileSync(targetPath, 'utf8')));
  assert.equal(manifest.artifact_type, 'real_e2e_malformed_output_publication');
  assert.equal(manifest.scenario, 'forge-malformed-output');
  assert.equal(manifest.target, config.target);
  assert.equal(manifest.raw_sha256, crypto.createHash('sha256').update(config.raw).digest('hex'));
  assert.equal(manifest.raw_bytes, Buffer.byteLength(config.raw, 'utf8'));

  const manifestPath = path.join(swarmDir, 'logs', 'real-e2e', 'malformed-output-publisher-forge-malformed-output.json');
  assert.equal(JSON.parse(fs.readFileSync(manifestPath, 'utf8')).run_id, 'real-e2e-test');
});

test('malformed output publisher writes valid-json retry contract violations exactly', async () => {
  for (const scenario of ['retry-stale-forge-output', 'retry-reuses-previous-success-artifact']) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'real-e2e-bad-output-'));
    const swarmDir = path.join(root, '.swarm');
    const config = malformedOutputScenarioConfig(scenario);
    const triggerPath = path.join(swarmDir, config.trigger);
    fs.mkdirSync(path.dirname(triggerPath), { recursive: true });
    fs.writeFileSync(triggerPath, 'retry prompt metadata\n');

    const manifest = await publishMalformedOutput({
      scenario,
      swarmDir,
      runId: 'real-e2e-test',
      project: 'real-pipeline-e2e-test',
      timeoutMs: 1000,
      pollMs: 10,
    });

    const targetPath = path.join(swarmDir, config.target);
    const raw = fs.readFileSync(targetPath, 'utf8');
    assert.equal(raw, config.raw, scenario);
    assert.deepEqual(JSON.parse(raw), config.expectedJson, scenario);
    assert.equal(manifest.scenario, scenario, scenario);
    assert.equal(manifest.raw_sha256, crypto.createHash('sha256').update(config.raw).digest('hex'), scenario);
    assert.equal(manifest.raw_bytes, Buffer.byteLength(config.raw, 'utf8'), scenario);
  }
});
