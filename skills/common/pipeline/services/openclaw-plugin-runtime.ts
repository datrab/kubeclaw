// Shared OpenClaw plugin runtime control for Nova and Buster entrypoints.

// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import { spawnSync } from 'child_process';

function controlConfig(config = {}) {
  return config?.agent_observability?.plugin_control || {};
}

function requireString(config, field) {
  const value = String(config?.[field] ?? '').trim();
  if (value) return value;
  throw new Error(`agent_observability.plugin_control.${field} is required when plugin control is enabled`);
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

function runtimeLogger(opts = {}) {
  return opts.logger || console;
}

function runPluginCommand(action, runtimeConfig, opts = {}) {
  const pluginId = requireString(runtimeConfig, 'pluginId');
  const command = requireString(runtimeConfig, 'command');
  const timeoutMs = Number(runtimeConfig.timeout_ms);
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error('agent_observability.plugin_control.timeout_ms is required when plugin control is enabled');
  }
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

  const logger = runtimeLogger(opts);
  let started = false;
  return {
    enabled: true,
    get started() {
      return started;
    },
    async start() {
      const result = runPluginCommand('enable', runtimeConfig, opts);
      started = true;
      logger.info?.(`[openclaw-plugin-runtime] enabled ${runtimeConfig.pluginId}`);
      return result;
    },
    async stop() {
      if (runtimeConfig.disableOnStop === false || !started) return { skipped: true };
      try {
      const result = runPluginCommand('disable', runtimeConfig, opts);
        started = false;
        logger.info?.(`[openclaw-plugin-runtime] disabled ${runtimeConfig.pluginId}`);
        return result;
      } catch (error) {
        logger.warn?.(`[openclaw-plugin-runtime] failed to disable ${runtimeConfig.pluginId}: ${error.message}`);
        return { ok: false, error };
      }
    },
  };
}
