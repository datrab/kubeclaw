#!/usr/bin/env node
// pipeline/cli.js — CLI entry point for the modular pipeline.
// Internal helpers (initTempDir, output, log, dryRun) will be co-located here
// as extraction proceeds in later modules.

// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import { fileURLToPath } from 'url';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import fs from 'fs';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import path from 'path';
import { registerShutdownHooks } from './agents/shutdown.ts';
import { loadConfig } from './core/config.ts';
import { listBlueprints, releaseBlueprint } from './services/blueprint.ts';
import { createPipelineContext } from './core/context.ts';
import { setActiveContext, clearActiveContext } from './core/logger.ts';
import { createTempManager } from './core/temp.ts';
import { closeLogDir, initLogDir } from './services/status-store.ts';
import { createRunId, createRunStats } from './core/runtime.ts';
import { runPipeline, printStatus, dryRun } from './runners/pipeline-runner.ts';
import { validateThinkingLevel, VALID_THINKING_LEVELS } from './core/policy.ts';
import { parseCliFlagValues } from './cli-args.ts';
import { redactSecrets, sanitizeJsonEgress } from './redaction.ts';
import { resolveNovaPromptIngress, PROMPT_INGRESS_MAX_BYTES } from './services/prompt-ingress.ts';

declare const process: any;
type AnyRecord = Record<string, any>;

const PROCESS_SUCCESS_CODE = 0;
const PROCESS_FAILURE_CODE = 1;

const __currentPath = fs.realpathSync(fileURLToPath(import.meta.url));
const __entryPath = (process.argv[1] && fs.existsSync(process.argv[1]))
  ? fs.realpathSync(process.argv[1])
  : process.argv[1];

function prepareReadOnlyLifecycleContext(config: AnyRecord = {}) {
  config._lifecycleReadOnly = true;
  const swarmDir = config?.paths?.swarm_dir;
  const latestPath = swarmDir ? path.join(swarmDir, 'logs', 'pipeline', 'latest.json') : null;
  if (!latestPath || !fs.existsSync(latestPath)) return;
  try {
    const latest = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
    const runId = typeof latest?.run_id === 'string' ? latest.run_id.trim() : '';
    if (!runId) return;
    if (runId.includes('\0') || runId.includes('/') || runId.includes('\\') || runId === '.' || runId === '..') return;
    config._runId = config._runId || runId;
    config.run_id = config.run_id || runId;
    config._lifecycleReadOnlyRunLogDir = path.join(swarmDir, 'logs', 'pipeline', 'runs', runId);
  } catch (_error) {
    return;
  }
}

export function normalizeNovaCliFlags(rawFlags: AnyRecord = {}, env: AnyRecord = {}) {
  return Object.freeze({
    project: rawFlags.project || env.CURRENT_PROJECT,
    repo: rawFlags.repo || env.REPO_ROOT,
    module: rawFlags.module,
    blueprint: rawFlags.blueprint,
    blueprintList: rawFlags['blueprint-list'] === true,
    prompt: rawFlags.prompt,
    promptFile: rawFlags['prompt-file'],
    novaChannel: rawFlags['nova-channel'] || env.NOVA_CHANNEL,
    runtimeModel: rawFlags.model,
    runtimeThinking: rawFlags.thinking,
    resume: rawFlags.resume === true,
    status: rawFlags.status === true,
    dryRun: rawFlags['dry-run'] === true,
    help: rawFlags.help === true,
  });
}

export async function main() {
  const tempManager = createTempManager();
  const initTempDir = () => tempManager.init();
  const cleanupTempDir = () => tempManager.cleanup();
  let output = (o) => new Promise((resolve) => {
    process.stdout.write(JSON.stringify(sanitizeJsonEgress(o, 'cli_output')) + '\n', () => {
      resolve(undefined);
    });
  });
  let log = (level, msg) => console.error(`[${level}]`, redactSecrets(msg, Number.POSITIVE_INFINITY));

  let flags;
  try {
    const rawFlags = parseCliFlagValues(process.argv.slice(2), {
      flags: {
        project: { type: 'string' },
        repo: { type: 'string' },
        module: { type: 'string' },
        blueprint: { type: 'string' },
        'blueprint-list': { type: 'boolean', default: false },
        prompt: { type: 'string' },
        'prompt-file': { type: 'string' },
        'nova-channel': { type: 'string' },
        model: { type: 'string' },
        thinking: { type: 'string' },
        resume: { type: 'boolean', default: false },
        status: { type: 'boolean', default: false },
        'dry-run': { type: 'boolean', default: false },
        help: { type: 'boolean', default: false },
      },
    });
    flags = normalizeNovaCliFlags(rawFlags, process.env);
  } catch (e: any) {
    const message = e?.message || String(e);
    log('ERROR', message);
    await output({ exit: PROCESS_FAILURE_CODE, error: message });
    cleanupTempDir();
    process.exitCode = PROCESS_FAILURE_CODE;
    return PROCESS_FAILURE_CODE;
  }
  if (flags.help) {
    console.error(`
KubeClaw Swarm Pipeline — Deterministic Orchestrator

Usage: node pipeline.ts [options]

Pipeline commands:
  --project <n>           Project name (or CURRENT_PROJECT env)
  --repo <path>           Git repo root (or REPO_ROOT env; auto-detected if in repo)
  --module <id>           Run a single module
  --resume                Resume pipeline from current state
  --model <id>            Runtime model override (beats project defaults and platform fallback_model)
  --thinking <level>      Runtime thinking override: ${VALID_THINKING_LEVELS.join('|')}
                          (only applies on ACP/subagent paths; ignored on Redis/Buster)
  --prompt "text"         Bounded operator remediation guidance for Forge prompts
  --prompt-file <path>    Read bounded guidance from a repo-contained UTF-8 file (max ${PROMPT_INGRESS_MAX_BYTES} bytes)
  --nova-channel <id>     Discord channel id for typed action-required / timeout auto-injection
  --status                Print current pipeline status as JSON
  --dry-run               Show execution plan, spawn nothing

Config:
  Platform config:  /home/node/.openclaw/swarm.config.json (SWARM_CONFIG secondary candidate)
  Project config:   <repo>/Projects/<project>/src/.swarm/progress.json

Retry flow:
  Auto-retries up to the configured auto_retry_threshold happen internally (no exit).
  After auto_retry_threshold from swarm.config.json/progress overrides, emits action_required terminal status.
  Nova resumes the full pipeline: --resume --prompt "Use approach X instead of Y"

Blueprint commands:
  --blueprint <id>        Release a specific blueprint from architecture branch
  --blueprint-list        List all available blueprints

Exit codes:
  0   Success / pipeline complete
  1   Any non-success terminal status or configuration/system error
      `);
    process.exitCode = PROCESS_SUCCESS_CODE;
    return PROCESS_SUCCESS_CODE;
  }

  // Nova channel is mandatory for pipeline runs (not for --status, --dry-run, --blueprint)
  if (!flags.novaChannel && !flags.status && !flags.dryRun && !flags.blueprint && !flags.blueprintList) {
    console.error('ERROR: --nova-channel <id> is required (or set NOVA_CHANNEL env var).');
    console.error('       Without it, action-required / timeout failures cannot be escalated to Nova.');
    process.exitCode = PROCESS_FAILURE_CODE;
    return PROCESS_FAILURE_CODE;
  }

  let activeConfig: AnyRecord | null = null;
  let activeContext: AnyRecord | null = null;

  return await (async () => {
    try {
      // Initialize temp directory first; config-aware shutdown hooks/logging follow after config load
      initTempDir();

      // Validate --thinking before loading config so invalid values fail early
      if (flags.runtimeThinking) {
        try { validateThinkingLevel(flags.runtimeThinking, '--thinking'); }
        catch (e: any) {
          log('ERROR', e.message);
          await output({ exit: PROCESS_FAILURE_CODE, error: e.message });
          cleanupTempDir();
          process.exitCode = PROCESS_FAILURE_CODE;
          return PROCESS_FAILURE_CODE;
        }
      }

      const { config, progress, pluginRegistry } = loadConfig(flags.project, { repoRoot: flags.repo });
      activeConfig = config;

      const runtimeOverrides = (flags.runtimeModel || flags.runtimeThinking) ? {
        model:    flags.runtimeModel    || null,
        thinking: flags.runtimeThinking || null,
      } : null;
      if (flags.runtimeModel || flags.runtimeThinking) {
        if (flags.runtimeModel)    log('INFO', `Runtime model override: ${flags.runtimeModel}`);
        if (flags.runtimeThinking) log('INFO', `Runtime thinking override: ${flags.runtimeThinking}`);
      }

      // Blueprint commands
      if (flags.blueprintList) {
        await output({ status: 'success', modules: listBlueprints(config) });
        cleanupTempDir();
        process.exitCode = PROCESS_SUCCESS_CODE;
        return PROCESS_SUCCESS_CODE;
      }
      if (flags.blueprint) {
        const mod = progress.modules[flags.blueprint];
        if (!mod) {
          await output({ status: 'error', error: `Module '${flags.blueprint}' not in progress.json` });
          cleanupTempDir();
          process.exitCode = PROCESS_FAILURE_CODE;
          return PROCESS_FAILURE_CODE;
        }
        const result = await releaseBlueprint(config, progress, flags.blueprint, mod.dir, mod.stages || ['forge', 'buster']);
        await output(result);
        cleanupTempDir();
        process.exitCode = PROCESS_SUCCESS_CODE;
        return PROCESS_SUCCESS_CODE;
      }

      if (flags.status)  { prepareReadOnlyLifecycleContext(config); printStatus(config, progress); cleanupTempDir(); process.exitCode = PROCESS_SUCCESS_CODE; return PROCESS_SUCCESS_CODE; }
      if (flags.dryRun)  { prepareReadOnlyLifecycleContext(config); dryRun(config, progress); cleanupTempDir(); process.exitCode = PROCESS_SUCCESS_CODE; return PROCESS_SUCCESS_CODE; }

      const runId = createRunId();
      const stats = createRunStats();
      const ctx = createPipelineContext({ config, progress, runId, stats, novaChannel: flags.novaChannel, pluginRegistry, runtimeOverrides });
      activeContext = ctx;
      ctx.setTempDir(tempManager.dir);
      setActiveContext(ctx);
      initLogDir(config, ctx);
      registerShutdownHooks(config);

      // Resolve bounded operator guidance from --prompt or --prompt-file.
      const promptIngress = resolveNovaPromptIngress({
        prompt: flags.prompt,
        promptFile: flags.promptFile,
        repoRoot: config.repo_root,
      });
      const novaPrompt = promptIngress.prompt;
      if (promptIngress.metadata) {
        const meta = promptIngress.metadata;
        log('INFO', `Operator remediation directive accepted (source=${meta.source}, chars=${meta.chars}, bytes=${meta.bytes}, redactions=${meta.redactions}${meta.prompt_file ? `, file=${meta.prompt_file}` : ''})`);
      }

      const exitCode = await runPipeline(config, progress, {
        module: flags.module,
        resume: flags.resume,
        novaPrompt,
        novaChannel: flags.novaChannel,
      });
      cleanupTempDir();
      process.exitCode = exitCode;
      return exitCode;

    } catch (e: any) {
      log('ERROR', e.message);
      await output({ exit: PROCESS_FAILURE_CODE, error: e.message });
      cleanupTempDir();
      process.exitCode = PROCESS_FAILURE_CODE;
      return PROCESS_FAILURE_CODE;
    } finally {
      await closeLogDir(activeConfig, activeContext);
      clearActiveContext();
    }
  })();
}

// Also run directly if invoked as script
if (__currentPath === __entryPath) await main();
