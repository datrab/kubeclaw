import { spawnSync } from 'child_process';

import { log } from '../core/logger.ts';

const DEFAULT_PLUGIN_ID = 'kubeclaw-agent-observer';
const DEFAULT_COMMAND = 'openclaw';
const DEFAULT_TIMEOUT_MS = 10_000;

function controlConfig(config = {}) {
  return config?.agent_observability?.plugin_control || {};
}

function commandResultText(result) {
  const stdout = result?.stdout ? String(result.stdout).trim() : '';
  const stderr = result?.stderr ? String(result.stderr).trim() : '';
  return [stdout, stderr].filter(Boolean).join('\n');
}

function defaultCommandRunner(command, args, options) {
  return spawnSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: options.timeoutMs,
  });
}

function runPluginCommand(action, runtimeConfig, opts = {}) {
  const pluginId = runtimeConfig.pluginId || DEFAULT_PLUGIN_ID;
  const command = runtimeConfig.command || DEFAULT_COMMAND;
  const timeoutMs = Number(runtimeConfig.timeoutMs || DEFAULT_TIMEOUT_MS);
  const runner = opts.commandRunner || defaultCommandRunner;
  const args = ['plugins', action, pluginId];
  const result = runner(command, args, { timeoutMs, pluginId, action });
  if (result?.error) {
    throw new Error(`${command} ${args.join(' ')} failed: ${result.error.message}`);
  }
  if (result?.status !== 0) {
    const detail = commandResultText(result);
    throw new Error(`${command} ${args.join(' ')} exited ${result?.status}${detail ? `: ${detail}` : ''}`);
  }
  return { command, args, output: commandResultText(result) };
}

export function createOpenClawAgentObserverPluginController(config = {}, opts = {}) {
  const runtimeConfig = controlConfig(config);
  if (runtimeConfig.enabled !== true) {
    return {
      enabled: false,
      started: false,
      start: async () => ({ skipped: true }),
      stop: async () => ({ skipped: true }),
    };
  }

  let started = false;
  return {
    enabled: true,
    get started() {
      return started;
    },
    async start() {
      const result = runPluginCommand('enable', runtimeConfig, opts);
      started = true;
      log('INFO', `[openclaw-plugin-runtime] enabled ${runtimeConfig.pluginId || DEFAULT_PLUGIN_ID}`);
      return result;
    },
    async stop() {
      if (runtimeConfig.disableOnStop === false || !started) return { skipped: true };
      try {
        const result = runPluginCommand('disable', runtimeConfig, opts);
        started = false;
        log('INFO', `[openclaw-plugin-runtime] disabled ${runtimeConfig.pluginId || DEFAULT_PLUGIN_ID}`);
        return result;
      } catch (error) {
        log('WARN', `[openclaw-plugin-runtime] failed to disable ${runtimeConfig.pluginId || DEFAULT_PLUGIN_ID}: ${error.message}`);
        return { ok: false, error };
      }
    },
  };
}
