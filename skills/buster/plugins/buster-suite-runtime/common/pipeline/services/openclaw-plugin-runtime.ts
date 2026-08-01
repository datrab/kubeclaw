import { selectDefinedValue, selectTruthyValue } from '../optional-absence.js';
import { writeRuntimeLog } from '../runtime-log.js';
// Shared OpenClaw plugin runtime control for Nova and Buster entrypoints.

import { spawnSync } from 'child_process';

type AnyRecord = Record<string, any>;
type CommandResult = ReturnType<typeof spawnSync>;

function controlConfig(config: AnyRecord = {}): AnyRecord {
  const control = config.agent_observability?.plugin_control;
  return control && typeof control === 'object' && !Array.isArray(control) ? control : {};
}

function configStringField(config: AnyRecord, field: string): string {
  return typeof config?.[field] === 'string' ? config[field].trim() : '';
}

function requireString(config: AnyRecord, field: string): string {
  const value = configStringField(config, field);
  if (value) return value;
  throw new Error(`agent_observability.plugin_control.${field} is required when plugin control is enabled`);
}

function commandResultText(result: CommandResult): string {
  const stdout = result?.stdout ? String(result.stdout).trim() : '';
  const stderr = result?.stderr ? String(result.stderr).trim() : '';
  return [stdout, stderr].filter(Boolean).join('\n');
}

function defaultCommandRunner(command: string, args: string[], options: { timeoutMs: number }): CommandResult {
  return spawnSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: options.timeoutMs,
  });
}

function runPluginCommand(action: 'enable' | 'disable', runtimeConfig: AnyRecord): AnyRecord {
  const pluginId = requireString(runtimeConfig, 'pluginId');
  const command = requireString(runtimeConfig, 'command');
  const timeoutMs = Number(runtimeConfig.timeout_ms);
  if (selectTruthyValue(() => (!Number.isInteger(timeoutMs)), () => (timeoutMs <= 0))) {
    throw new Error('agent_observability.plugin_control.timeout_ms is required when plugin control is enabled');
  }
  const args = ['plugins', action, pluginId];
  const result = defaultCommandRunner(command, args, { timeoutMs });
  if (result?.error) {
    throw new Error(`${command} ${args.join(' ')} failed: ${result.error.message}`);
  }
  if (result?.status !== 0) {
    const detail = commandResultText(result);
    throw new Error(`${command} ${args.join(' ')} exited ${result?.status}${detail ? `: ${detail}` : ''}`);
  }
  return { command, args, output: commandResultText(result) };
}

export function createOpenClawAgentObserverPluginController(config: AnyRecord = {}) {
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
      const result = runPluginCommand('enable', runtimeConfig);
      started = true;
      writeRuntimeLog('info', 'common/openclaw-plugin-runtime', `enabled ${runtimeConfig.pluginId}`);
      return result;
    },
    async stop() {
      if (selectTruthyValue(() => (runtimeConfig.disableOnStop === false), () => (!started))) return { skipped: true };
      try {
      const result = runPluginCommand('disable', runtimeConfig);
        started = false;
        writeRuntimeLog('info', 'common/openclaw-plugin-runtime', `disabled ${runtimeConfig.pluginId}`);
        return result;
      } catch (error) {
        writeRuntimeLog('warn', 'common/openclaw-plugin-runtime', `failed to disable ${runtimeConfig.pluginId}`, { error: error instanceof Error ? error.message : String(error) });
        return { ok: false, error };
      }
    },
  };
}
