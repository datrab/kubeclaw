import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildPluginRegistry } from '../../../../../skills/nova/pipeline/core/registry.ts';
import { dispatchNotificationHook } from '../../../../../skills/nova/pipeline/services/notification-dispatch.ts';
import {
  getBuiltinNotificationPluginDefinitions,
  observeDiscordNotification,
  validateDiscordOperatorPresentation,
} from '../../../../../skills/nova/pipeline/services/notification-contract.ts';

function makeConfig(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
  return {
    project: prefix,
    repo_root: root,
    paths: {
      swarm_dir: path.join(root, '.swarm'),
    },
    _runId: 'run-observer-correlation',
    run_id: 'run-observer-correlation',
    _disable_discord_webhooks: true,
  };
}

function makeContext(config) {
  return {
    coreRuntime: {
      readConfig: async () => config,
    },
  };
}

function makePluginRegistryConfig() {
  return {
    enabled: true,
    allowCustomModules: false,
    extraModulePaths: [],
    modules: {},
    stageOwners: {},
    restrictedCapabilityAllowlist: {},
  };
}

function makeInput(discordPresentation) {
  return {
    ids: {
      hookId: 'gate.completed',
      runId: 'run-observer-correlation',
      moduleId: 'module-alpha',
      gateId: 'gate-review',
      gateType: 'review',
      attempt: 3,
      stageId: 'gate.completed',
    },
    event: {
      type: 'gate.completed',
      payload: {},
    },
    presentation: {
      discord: discordPresentation,
    },
  };
}

function readRunDiscordEntry(config) {
  const filePath = path.join(config.paths.swarm_dir, 'logs', 'pipeline', 'runs', config.run_id, 'discord.jsonl');
  return JSON.parse(fs.readFileSync(filePath, 'utf8').trim().split('\n').at(-1));
}

function assertNotificationCorrelation(entry) {
  assert.equal(entry.run_id, 'run-observer-correlation');
  assert.equal(entry.module_id, 'module-alpha');
  assert.equal(entry.gate_id, 'gate-review');
  assert.equal(entry.gate_type, 'review');
  assert.equal(entry.attempt, 3);
}

test('observeDiscordNotification forwards ids as correlation for field presentation', async () => {
  const config = makeConfig('notification-discord-fields-test');

  await observeDiscordNotification(makeInput({
    level: 'WARN',
    title: 'Gate completed',
    description: 'No hidden correlation fields are present.',
    fields: [{ name: 'Status', value: 'complete' }],
  }), makeContext(config));

  assertNotificationCorrelation(readRunDiscordEntry(config));
});

test('observeDiscordNotification forwards ids as correlation for embed presentation', async () => {
  const config = makeConfig('notification-discord-embeds-test');

  await observeDiscordNotification(makeInput({
    level: 'WARN',
    embeds: [{
      title: 'Gate completed',
      description: 'No hidden correlation fields are present.',
      fields: [{ name: 'Status', value: 'complete' }],
    }],
  }), makeContext(config));

  assertNotificationCorrelation(readRunDiscordEntry(config));
});

test('dispatchNotificationHook supplies config runtime to built-in Discord listener', async () => {
  const config = makeConfig('notification-dispatch-discord-test');
  const discordDefinition = getBuiltinNotificationPluginDefinitions()
    .find((definition) => definition.manifest.moduleId === 'builtin.notification.discord.gate_completed');
  assert.ok(discordDefinition);

  const { registry, errors } = buildPluginRegistry(makePluginRegistryConfig(), {
    builtinModules: [discordDefinition],
  });
  assert.deepEqual(errors, []);
  config.pluginRegistry = registry;

  const result = await dispatchNotificationHook({ config }, 'gate.completed', {
    ids: {
      runId: 'run-observer-correlation',
      moduleId: 'module-alpha',
      gateId: 'gate-review',
      gateType: 'review',
      attempt: 3,
    },
    event: {
      type: 'gate.completed',
      payload: {},
    },
    presentation: {
      discord: {
        level: 'WARN',
        title: 'Gate completed',
        description: 'Dispatched through notification registry.',
        fields: [{ name: 'Status', value: 'complete' }],
      },
    },
  });

  assert.deepEqual(result.results, [{
    moduleId: 'builtin.notification.discord.gate_completed',
    ok: true,
  }]);
  assertNotificationCorrelation(readRunDiscordEntry(config));
});

test('Discord operator validation rejects path-only critical but accepts existing status presentations', () => {
  assert.deepEqual(validateDiscordOperatorPresentation({
    level: 'WARN',
    title: 'Gate completed',
    fields: [{ name: 'Status', value: 'complete' }],
  }, {
    hookId: 'gate.completed',
    gateId: 'gate-review',
  }), []);

  assert.deepEqual(validateDiscordOperatorPresentation({
    level: 'CRITICAL',
    title: 'Gate blocked',
    fields: [{ name: 'Status', value: 'BLOCKED' }],
  }, {
    hookId: 'gate.completed',
    gateId: 'gate-review',
  }), []);

  const pathOnlyErrors = validateDiscordOperatorPresentation({
    critical: true,
    title: 'Gate blocked',
    fields: [{ name: 'Evidence', value: '.swarm/logs/pipeline/latest.json' }],
  }, {
    hookId: 'gate.completed',
    gateId: 'gate-review',
  });
  assert(pathOnlyErrors.includes('critical Discord notification must include verdict/status/outcome'));
  assert(pathOnlyErrors.includes('critical Discord notification must include next action/action'));
});
