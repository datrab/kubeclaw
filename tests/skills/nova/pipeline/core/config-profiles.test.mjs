import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  expandSwarmConfig,
  normalizeSwarmConfigInPlace,
} from '../../../../../skills/nova/pipeline/core/platform-config.ts';
import { validateConfig } from '../../../../../skills/nova/pipeline/core/config.ts';

const sourceRoot = path.resolve(new URL('../../../../../', import.meta.url).pathname);
const compactConfigPath = path.join(sourceRoot, 'charts', 'kubeclaw', 'files', 'config', 'swarm.config.json');
const novaStandardProfilePath = path.join(sourceRoot, 'skills', 'nova', 'pipeline', 'core', 'config-profiles', 'standard.json');
const commonStandardProfilePath = path.join(sourceRoot, 'skills', 'common', 'pipeline', 'config-profiles', 'standard.json');
const examplesDir = path.join(sourceRoot, 'docs', 'examples', 'swarm-config');

function loadCompactConfig() {
  return JSON.parse(fs.readFileSync(compactConfigPath, 'utf8'));
}

function withTempSwarmConfig(config, fn) {
  const previousSwarmConfig = process.env.SWARM_CONFIG;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-config-profile-'));
  const configPath = path.join(tempDir, 'swarm.config.json');
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  process.env.SWARM_CONFIG = configPath;
  try {
    return fn(configPath);
  } finally {
    if (previousSwarmConfig === undefined) {
      delete process.env.SWARM_CONFIG;
    } else {
      process.env.SWARM_CONFIG = previousSwarmConfig;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function validProgress() {
  return {
    project: 'demo',
    execution_order: [],
    modules: {},
    gates: {},
  };
}

function addRuntimeFields(config) {
  return Object.assign(config, {
    project: 'demo',
    repo_root: sourceRoot,
    paths: {
      swarm_dir: path.join(sourceRoot, 'Projects', 'demo', 'src', '.swarm'),
      modules_dir: path.join(sourceRoot, 'Projects', 'demo', 'src', '.swarm', 'modules'),
      progress_file: path.join(sourceRoot, 'Projects', 'demo', 'src', '.swarm', 'progress.json'),
    },
  });
}

test('standard compact swarm config expands to the complete runtime config shape', () => {
  const expanded = expandSwarmConfig(loadCompactConfig());

  assert.equal(expanded.profile, undefined);
  assert.equal(expanded.telemetry.enabled, true);
  assert.equal(expanded.agent_observability.required, true);
  assert.equal(expanded.gateway.invoke.session_spawn.timeout_ms, 30000);
  assert.equal(expanded.session.kill.stop_message, '/stop');
  assert.equal(expanded.buster.runtime.task_stream, 'swarm:buster:tasks');
});

test('shared runtime standard profile stays identical to the Nova reference profile', () => {
  assert.equal(
    fs.readFileSync(commonStandardProfilePath, 'utf8'),
    fs.readFileSync(novaStandardProfilePath, 'utf8'),
  );
});

test('authored swarm config stays compact for humans and agents', () => {
  const config = loadCompactConfig();
  const leafCount = countLeaves(config);
  const keyCount = countKeys(config);

  assert.equal(config.profile, 'standard');
  assert.ok(leafCount <= 20, `expected compact authored config to stay <=20 leaves, got ${leafCount}`);
  assert.ok(keyCount <= 25, `expected compact authored config to stay <=25 total keys, got ${keyCount}`);
});

test('validateConfig normalizes compact swarm config in place before runtime validation', () => {
  const config = loadCompactConfig();

  assert.equal(config.profile, 'standard');
  assert.doesNotThrow(() => validateConfig(addRuntimeFields(config), validProgress()));
  assert.equal(config.profile, undefined);
  assert.equal(config.agents.buster.dispatch, 'redis');
  assert.equal(config.plugins.enabled, true);
});

test('compact swarm config supports structured overrides for known effective paths only', () => {
  const config = loadCompactConfig();
  config.overrides.session = { kill: { acp_confirm_timeout_ms: 45000 } };

  const expanded = expandSwarmConfig(config);
  assert.equal(expanded.session.kill.acp_confirm_timeout_ms, 45000);
});

test('documented compact swarm config examples expand through the same strict profile path', () => {
  for (const filename of ['local-dev.json', 'staging-like.json']) {
    const example = JSON.parse(fs.readFileSync(path.join(examplesDir, filename), 'utf8'));
    const expanded = expandSwarmConfig(example);

    assert.equal(expanded.agents.buster.dispatch, 'redis', `${filename} keeps required Buster dispatch`);
    assert.equal(expanded.telemetry.enabled, true, `${filename} keeps telemetry enabled`);
    assert.equal(expanded.agent_observability.required, true, `${filename} keeps agent observability required`);
  }
});

test('compact swarm config rejects unknown profile names', () => {
  const config = loadCompactConfig();
  config.profile = 'ci';

  assert.throws(
    () => expandSwarmConfig(config),
    /config\.profile: only 'standard' is supported/,
  );
});

test('compact swarm config rejects non-standard feature and tuning declarations', () => {
  const featureConfig = loadCompactConfig();
  featureConfig.features.observability = false;
  assert.throws(
    () => expandSwarmConfig(featureConfig),
    /config\.features\.observability: standard profile requires true/,
  );

  const tuningConfig = loadCompactConfig();
  tuningConfig.tuning.logs = 'quiet';
  assert.throws(
    () => expandSwarmConfig(tuningConfig),
    /config\.tuning\.logs: standard profile requires "verbose"/,
  );
});

test('compact swarm config rejects unknown compact fields and override paths', () => {
  const fieldConfig = loadCompactConfig();
  fieldConfig.telemetry = { enabled: false };
  assert.throws(
    () => expandSwarmConfig(fieldConfig),
    /config\.telemetry: unknown compact swarm config field/,
  );

  const overrideConfig = loadCompactConfig();
  overrideConfig.overrides.telemetry = { missing_key: 1 };
  assert.throws(
    () => expandSwarmConfig(overrideConfig),
    /overrides\.telemetry\.missing_key: unknown effective config path/,
  );
});

test('normalizeSwarmConfigInPlace preserves object identity for compact callers', () => {
  const config = loadCompactConfig();
  const sameObject = normalizeSwarmConfigInPlace(config);

  assert.equal(sameObject, config);
  assert.equal(config.profile, undefined);
  assert.equal(config.telemetry.stream_max_len, 10000);
});

test('Buster runtime readers expand compact swarm config before resolving policy', async () => {
  const runtimePolicy = await import('../../../../../skills/buster/pipeline/services/runtime-policy.ts');

  withTempSwarmConfig(loadCompactConfig(), () => {
    runtimePolicy.resetBusterRuntimePolicyForTests();
    const policy = runtimePolicy.loadBusterRuntimePolicy();

    assert.equal(policy.task_stream, 'swarm:buster:tasks');
    assert.equal(policy.task_stream_max_len, 250);
  });

  runtimePolicy.resetBusterRuntimePolicyForTests();
});

test('common git helpers expand compact swarm config before resolving command policy', async () => {
  const gitPrimitives = await import('../../../../../skills/common/pipeline/git-primitives.ts');

  withTempSwarmConfig(loadCompactConfig(), () => {
    gitPrimitives.setGitRuntimePolicy(null);
    const root = gitPrimitives.gitExec(sourceRoot, ['rev-parse', '--show-toplevel']);

    assert.equal(root, sourceRoot);
  });

  gitPrimitives.setGitRuntimePolicy(null);
});

test('Redis dispatch tool expands compact swarm config before resolving stream policy', async () => {
  const redisTool = await import('../../../../../skills/nova/pipeline/tools/redis.ts');

  withTempSwarmConfig(loadCompactConfig(), () => {
    const policy = redisTool.__redisToolTest.redisToolPolicy();

    assert.equal(policy.taskStream, 'swarm:buster:tasks');
    assert.equal(policy.archiveMaxLen, 1000);
    assert.equal(policy.tailScanBatchSize, 100);
    assert.equal(policy.tailScanLimit, 1000);
    assert.equal(policy.readyTimeoutMs, 120000);
  });
});

function countLeaves(value) {
  if (!value || typeof value !== 'object') return 1;
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + countLeaves(item), 0);
  const entries = Object.values(value);
  if (entries.length === 0) return 0;
  return entries.reduce((sum, item) => sum + countLeaves(item), 0);
}

function countKeys(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 0;
  return Object.entries(value).reduce((sum, [, item]) => sum + 1 + countKeys(item), 0);
}
