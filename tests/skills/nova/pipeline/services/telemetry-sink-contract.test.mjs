import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildPluginRegistry } from '../../../../../skills/nova/pipeline/core/registry.ts';
import { emitOperatorAlert } from '../../../../../skills/nova/pipeline/services/telemetry/dispatch.ts';
import {
  buildTelemetrySinkInput,
  getBuiltinTelemetrySinkPluginDefinitions,
  validateTelemetrySinkInput,
} from '../../../../../skills/nova/pipeline/services/telemetry-sink-contract.ts';

function makeConfig(prefix = 'telemetry-sink-contract-test') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
  const discordDefinition = getBuiltinTelemetrySinkPluginDefinitions()
    .find((definition) => definition.manifest.moduleId === 'builtin.telemetry.discord');
  assert.ok(discordDefinition);
  const { registry, errors } = buildPluginRegistry({
    enabled: true,
    allowCustomModules: false,
    extraModulePaths: [],
    modules: {},
    stageOwners: {},
    restrictedCapabilityAllowlist: {},
  }, {
    builtinModules: [discordDefinition],
  });
  assert.deepEqual(errors, []);
  return {
    project: prefix,
    repo_root: root,
    paths: {
      swarm_dir: path.join(root, '.swarm'),
    },
    _runId: 'run-telemetry-sink-contract',
    run_id: 'run-telemetry-sink-contract',
    pluginRegistry: registry,
  };
}

function pathOnlyInput(level) {
  return buildTelemetrySinkInput({
    config: makeConfig(`telemetry-sink-path-only-${level.toLowerCase()}`),
  }, 'pipeline.operator_alert', {
    run_id: 'run-telemetry-sink-contract',
  }, {
    presentation: {
      discord: {
        level,
        title: 'Path only',
        fields: [
          { name: 'Evidence', value: '.swarm/logs/pipeline/latest.json' },
        ],
      },
    },
    occurredAt: '2026-06-17T00:00:00.000Z',
  });
}

test('telemetry sink rejects path-only severe Discord operator alerts', () => {
  for (const level of ['CRITICAL', 'ERROR', 'WARN']) {
    const errors = validateTelemetrySinkInput(pathOnlyInput(level));
    assert(errors.includes('telemetry sink severe Discord alert must include verdict/status/outcome'), `${level} must require verdict/status/outcome`);
    assert(errors.includes('telemetry sink severe Discord alert must include next action/action'), `${level} must require next action/action`);
  }
});

test('telemetry sink accepts valid severe Discord alerts with verdict, identity, and next action', () => {
  const input = buildTelemetrySinkInput({
    config: makeConfig('telemetry-sink-valid-alert'),
  }, 'module.operator_alert', {
    run_id: 'run-telemetry-sink-contract',
    module_id: 'module-a',
    attempt: 2,
    dispatch_id: 'dispatch-valid-alert',
    terminal_status: 'BLOCKED',
    action: 'fix module-a and resume',
  }, {
    moduleId: 'module-a',
    attempt: 2,
    presentation: {
      discord: {
        level: 'CRITICAL',
        title: 'Module blocked',
        fields: [
          { name: 'Status', value: 'BLOCKED' },
          { name: 'Next Action', value: 'Fix module-a and resume' },
          { name: 'Module', value: 'module-a' },
          { name: 'Dispatch ID', value: 'dispatch-valid-alert' },
        ],
      },
    },
    occurredAt: '2026-06-17T00:00:00.000Z',
  });

  assert.deepEqual(validateTelemetrySinkInput(input), []);
});

test('telemetry sink preserves top-level Discord status and action fields during normalization', () => {
  const input = buildTelemetrySinkInput({
    config: makeConfig('telemetry-sink-valid-top-level-alert'),
  }, 'pipeline.operator_alert', {
    run_id: 'run-telemetry-sink-contract',
  }, {
    presentation: {
      discord: {
        level: 'CRITICAL',
        title: 'Pipeline blocked',
        status: 'BLOCKED',
        action: 'Fix the deployment config and resume',
      },
    },
    occurredAt: '2026-06-17T00:00:00.000Z',
  });

  assert.equal(input.presentation.discord.status, 'BLOCKED');
  assert.equal(input.presentation.discord.action, 'Fix the deployment config and resume');
  assert.deepEqual(validateTelemetrySinkInput(input), []);
});

test('emitOperatorAlert rejects path-only severe Discord presentation before Discord sink dispatch', async () => {
  const calls = [];
  const result = await emitOperatorAlert({
    config: makeConfig('telemetry-sink-dispatch-rejects-path-only'),
    deps: {
      discord: async () => {
        calls.push('discord-called');
      },
    },
  }, 'pipeline.operator_alert', {
    run_id: 'run-telemetry-sink-contract',
  }, {
    presentation: {
      discord: {
        level: 'CRITICAL',
        title: 'Path only',
        fields: [
          { name: 'Evidence', value: '.swarm/logs/pipeline/latest.json' },
        ],
      },
    },
    occurredAt: '2026-06-17T00:00:00.000Z',
  });

  assert.equal(calls.length, 0);
  assert.match(result.dispatchError, /telemetry sink severe Discord alert must include verdict\/status\/outcome/);
  assert.match(result.dispatchError, /telemetry sink severe Discord alert must include next action\/action/);
});

test('emitOperatorAlert dispatches valid severe Discord presentation', async () => {
  const calls = [];
  const result = await emitOperatorAlert({
    config: makeConfig('telemetry-sink-dispatch-accepts-valid'),
    deps: {
      discord: async (_config, level, title, description, fields = []) => {
        calls.push({ level, title, description, fields });
      },
    },
  }, 'pipeline.operator_alert', {
    run_id: 'run-telemetry-sink-contract',
    terminal_status: 'BLOCKED',
    action: 'Fix the deployment config and resume',
  }, {
    presentation: {
      discord: {
        level: 'CRITICAL',
        title: 'Pipeline blocked',
        description: 'Deployment config is invalid.',
        fields: [
          { name: 'Status', value: 'BLOCKED' },
          { name: 'Next Action', value: 'Fix the deployment config and resume' },
          { name: 'Run ID', value: 'run-telemetry-sink-contract' },
        ],
      },
    },
    occurredAt: '2026-06-17T00:00:00.000Z',
  });

  assert.deepEqual(result.results, [{
    moduleId: 'builtin.telemetry.discord',
    ok: true,
  }]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].level, 'CRITICAL');
  assert.equal(calls[0].title, 'Pipeline blocked');
});
