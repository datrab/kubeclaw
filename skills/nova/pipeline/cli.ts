#!/usr/bin/env node
import { selectDefinedValue, selectTruthyValue } from './optional-absence.ts';
// pipeline/cli.js — CLI entry point for the modular pipeline.
// Internal helpers (initTempDir, output, log, dryRun) will be co-located here
// as extraction proceeds in later modules.

import { fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';
import { discoverLatestRun } from './run-discovery.ts';
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
import { limitEgressText, sanitizeJsonEgress } from './egress.ts';
import { novaEnvironmentSnapshot } from './core/runtime-environment.ts';
import { resolveNovaPromptIngress, PROMPT_INGRESS_MAX_BYTES } from './services/prompt-ingress.ts';

declare const process: any;
type AnyRecord = Record<string, any>;

const PROCESS_SUCCESS_CODE = 0;
const PROCESS_FAILURE_CODE = 1;

const __currentPath = fs.realpathSync(fileURLToPath(import.meta.url));
const __entryPath = (process.argv[1] && fs.existsSync(process.argv[1]))
  ? fs.realpathSync(process.argv[1])
  : process.argv[1];

function errorMessage(error: AnyRecord) {
  return typeof error?.message === 'string' && error.message ? error.message : String(error);
}

function runtimeOverridesFromFlags(flags: AnyRecord) {
  if (!flags.runtimeModel && !flags.runtimeThinking) return null;
  return {
    model:    selectDefinedValue(() => (flags.runtimeModel), () => (null)),
    thinking: selectDefinedValue(() => (flags.runtimeThinking), () => (null)),
  };
}

function blueprintStages(mod: AnyRecord) {
  return Array.isArray(mod.stages) ? mod.stages : ['forge', 'buster'];
}

function cliRunId(config: AnyRecord) {
  return selectDefinedValue(() => (selectDefinedValue(() => (config._runId), () => (config.run_id))), () => (createRunId()));
}

function prepareReadOnlyLifecycleContext(config: AnyRecord = {}) {
  config._lifecycleReadOnly = true;
  prepareResumeLifecycleContext(config);
}

function prepareResumeLifecycleContext(config: AnyRecord = {}) {
  const swarmDir = config?.paths?.swarm_dir;
  const pipelineRoot = swarmDir ? path.join(swarmDir, 'logs', 'pipeline') : null;
  if (!pipelineRoot) return;
  try {
    const latest = discoverLatestRun(pipelineRoot);
    const runId = typeof latest?.run_id === 'string' ? latest.run_id.trim() : '';
    if (!runId) return;
    if (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (runId.includes('\0')), () => (runId.includes('/')))), () => (runId.includes('\\')))), () => (runId === '.'))), () => (runId === '..'))) return;
    config._runId = runId;
    config.run_id = runId;
    config._lifecycleReadOnlyRunLogDir = path.join(swarmDir, 'logs', 'pipeline', 'runs', runId);
  } catch (_error: any) { /* INTENTIONAL_NONCRITICAL(optional_probe_failed): this optional probe converts unreadable or absent input to explicit absence. */
    return;
  }
}

export function normalizeNovaCliFlags(rawFlags: AnyRecord = {}, env: AnyRecord = {}) {
  return Object.freeze({
    project: selectDefinedValue(() => (rawFlags.project), () => (env.CURRENT_PROJECT)),
    repo: selectDefinedValue(() => (rawFlags.repo), () => (env.REPO_ROOT)),
    module: rawFlags.module,
    blueprint: rawFlags.blueprint,
    blueprintList: rawFlags['blueprint-list'] === true,
    prompt: rawFlags.prompt,
    promptFile: rawFlags['prompt-file'],
    novaChannel: selectDefinedValue(() => (rawFlags['nova-channel']), () => (env.NOVA_CHANNEL)),
    runtimeModel: rawFlags.model,
    runtimeThinking: rawFlags.thinking,
    resume: rawFlags.resume === true,
    status: rawFlags.status === true,
    dryRun: rawFlags['dry-run'] === true,
    help: rawFlags.help === true,
  });
}

function cliOutput(value: any) {
  return new Promise<void>((resolve) => {
    process.stdout.write(JSON.stringify(sanitizeJsonEgress(value, 'cli_output')) + '\n', () => {
      resolve();
    });
  });
}

function cliLog(level: any, message: any) {
  console.error(`[${level}]`, limitEgressText(message, Number.POSITIVE_INFINITY));
}

function parseFlags() {
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
  return normalizeNovaCliFlags(rawFlags, novaEnvironmentSnapshot());
}

function printHelp() {
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
  --prompt "text"         Bounded operator remediation guidance for Forge prompts
  --prompt-file <path>    Read bounded guidance from a repo-contained UTF-8 file
  --nova-channel <id>     Discord channel id for action-required escalation
  --status                Print current pipeline status as JSON
  --dry-run               Show execution plan, spawn nothing

Blueprint commands:
  --blueprint <id>        Release a specific blueprint from architecture branch
  --blueprint-list        List all available blueprints

Exit codes:
  0   Success / pipeline complete
  1   Any non-success terminal status or configuration/system error
  `);
}

async function handleReadOnlyCommand(flags: AnyRecord, config: AnyRecord, progress: AnyRecord, cleanup: () => void) {
  if (flags.blueprintList) {
    await cliOutput({ status: 'success', modules: listBlueprints(config) });
    cleanup();
    return PROCESS_SUCCESS_CODE;
  }
  if (flags.blueprint) {
    const mod = progress.modules[flags.blueprint];
    if (!mod) {
      await cliOutput({ status: 'error', error: `Module '${flags.blueprint}' not in progress.json` });
      cleanup();
      return PROCESS_FAILURE_CODE;
    }
    await cliOutput(await releaseBlueprint(config, progress, flags.blueprint, mod.dir, blueprintStages(mod)));
    cleanup();
    return PROCESS_SUCCESS_CODE;
  }
  if (flags.status) {
    prepareReadOnlyLifecycleContext(config);
    printStatus(config, progress);
    cleanup();
    return PROCESS_SUCCESS_CODE;
  }
  if (flags.dryRun) {
    prepareReadOnlyLifecycleContext(config);
    dryRun(config, progress);
    cleanup();
    return PROCESS_SUCCESS_CODE;
  }
  return null;
}

async function executePipelineCommand(flags: AnyRecord, loaded: AnyRecord, tempManager: AnyRecord) {
  const { config, progress, pluginRegistry } = loaded;
  if (flags.resume) prepareResumeLifecycleContext(config);
  const runtimeOverrides = runtimeOverridesFromFlags(flags);
  const ctx = createPipelineContext({
    config,
    progress,
    runId: cliRunId(config),
    stats: createRunStats(),
    novaChannel: flags.novaChannel,
    pluginRegistry,
    runtimeOverrides,
  });
  ctx.setTempDir(tempManager.dir);
  setActiveContext(ctx);
  config._resume = flags.resume;
  initLogDir(config, ctx, { resume: flags.resume });
  registerShutdownHooks(config);
  const promptIngress = resolveNovaPromptIngress({
    prompt: flags.prompt,
    promptFile: flags.promptFile,
    repoRoot: config.repo_root,
  });
  if (promptIngress.metadata) {
    const meta = promptIngress.metadata;
    cliLog('INFO', `Operator remediation directive accepted (source=${meta.source}, chars=${meta.chars}, bytes=${meta.bytes}${meta.prompt_file ? `, file=${meta.prompt_file}` : ''})`);
  }
  const exitCode = await runPipeline(config, progress, {
    module: flags.module,
    resume: flags.resume,
    novaPrompt: promptIngress.prompt,
    novaChannel: flags.novaChannel,
  });
  return { config, ctx, exitCode };
}

async function runConfiguredCommand(flags: AnyRecord, tempManager: AnyRecord) {
  tempManager.init();
  if (flags.runtimeThinking) validateThinkingLevel(flags.runtimeThinking, '--thinking');
  const loaded = loadConfig(flags.project, { repoRoot: flags.repo });
  const readOnlyExit = await handleReadOnlyCommand(flags, loaded.config, loaded.progress, () => tempManager.cleanup());
  if (readOnlyExit !== null) return { exitCode: readOnlyExit, config: null, ctx: null };
  const result = await executePipelineCommand(flags, loaded, tempManager);
  tempManager.cleanup();
  return result;
}

export async function main() {
  const tempManager = createTempManager();
  let activeConfig: AnyRecord | null = null;
  let activeContext: AnyRecord | null = null;
  let flags: AnyRecord;
  try {
    flags = parseFlags();
  } catch (error: any) {
    const message = errorMessage(error);
    cliLog('ERROR', message);
    await cliOutput({ exit: PROCESS_FAILURE_CODE, error: message });
    process.exitCode = PROCESS_FAILURE_CODE;
    return PROCESS_FAILURE_CODE;
  }
  if (flags.help) {
    printHelp();
    process.exitCode = PROCESS_SUCCESS_CODE;
    return PROCESS_SUCCESS_CODE;
  }
  if (!flags.novaChannel && !flags.status && !flags.dryRun && !flags.blueprint && !flags.blueprintList) {
    console.error('ERROR: --nova-channel <id> is required (or set NOVA_CHANNEL env var).');
    process.exitCode = PROCESS_FAILURE_CODE;
    return PROCESS_FAILURE_CODE;
  }
  try {
    const result = await runConfiguredCommand(flags, tempManager);
    activeConfig = result.config;
    activeContext = result.ctx;
    process.exitCode = result.exitCode;
    return result.exitCode;
  } catch (error: any) {
    cliLog('ERROR', errorMessage(error));
    await cliOutput({ exit: PROCESS_FAILURE_CODE, error: errorMessage(error) });
    tempManager.cleanup();
    process.exitCode = PROCESS_FAILURE_CODE;
    return PROCESS_FAILURE_CODE;
  } finally {
    await closeLogDir(activeConfig, activeContext);
    clearActiveContext();
  }
}

/*
  let output = (o: any) => new Promise((resolve: any) => {
    process.stdout.write(JSON.stringify(sanitizeJsonEgress(o, 'cli_output')) + '\n', () => {
      resolve(undefined);
    });
  });
  let log = (level: any, msg: any) => console.error(`[${level}]`, limitEgressText(msg, Number.POSITIVE_INFINITY));

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
    flags = normalizeNovaCliFlags(rawFlags, novaEnvironmentSnapshot());
  } catch (e: any) {
    const message = errorMessage(e);
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

      const runtimeOverrides = runtimeOverridesFromFlags(flags);
      if (selectTruthyValue(() => (flags.runtimeModel), () => (flags.runtimeThinking))) {
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
        const result = await releaseBlueprint(config, progress, flags.blueprint, mod.dir, blueprintStages(mod));
        await output(result);
        cleanupTempDir();
        process.exitCode = PROCESS_SUCCESS_CODE;
        return PROCESS_SUCCESS_CODE;
      }

      if (flags.status)  { prepareReadOnlyLifecycleContext(config); printStatus(config, progress); cleanupTempDir(); process.exitCode = PROCESS_SUCCESS_CODE; return PROCESS_SUCCESS_CODE; }
      if (flags.dryRun)  { prepareReadOnlyLifecycleContext(config); dryRun(config, progress); cleanupTempDir(); process.exitCode = PROCESS_SUCCESS_CODE; return PROCESS_SUCCESS_CODE; }

      if (flags.resume) prepareResumeLifecycleContext(config);
      const runId = cliRunId(config);
      const stats = createRunStats();
      const ctx = createPipelineContext({ config, progress, runId, stats, novaChannel: flags.novaChannel, pluginRegistry, runtimeOverrides });
      activeContext = ctx;
      ctx.setTempDir(tempManager.dir);
      setActiveContext(ctx);
      config._resume = flags.resume;
      initLogDir(config, ctx, { resume: flags.resume });
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
        log('INFO', `Operator remediation directive accepted (source=${meta.source}, chars=${meta.chars}, bytes=${meta.bytes}${meta.prompt_file ? `, file=${meta.prompt_file}` : ''})`);
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
*/

// Also run directly if invoked as script
if (__currentPath === __entryPath) {
  const exitCode = await main();
  process.exit(exitCode);
}
