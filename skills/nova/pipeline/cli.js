#!/usr/bin/env node
// pipeline/cli.js — CLI entry point for the modular pipeline.
// Internal helpers (initTempDir, output, log, dryRun) will be co-located here
// as extraction proceeds in later modules.

import { fileURLToPath } from 'url';
import fs from 'fs';
import {
  loadConfig,
  printStatus,
  listBlueprints,
  releaseBlueprint,
  EXIT_OK,
  EXIT_ERROR,
  createPipelineContext,
  setActiveContext,
  clearActiveContext,
  initLogDir,
  registerShutdownHooks,
  createTempManager,
} from './index.js';
import { createRunId, createRunStats } from './core/runtime.js';
import { runPipeline, dryRun } from './runners/pipeline-runner.js';
import { validateThinkingLevel } from './core/policy.js';

const __currentPath = fs.realpathSync(fileURLToPath(import.meta.url));
const __entryPath = (process.argv[1] && fs.existsSync(process.argv[1]))
  ? fs.realpathSync(process.argv[1])
  : process.argv[1];

export async function main() {
  const tempManager = createTempManager();
  const initTempDir = () => tempManager.init();
  const cleanupTempDir = () => tempManager.cleanup();
  let output = (o) => process.stdout.write(JSON.stringify(o) + '\n');
  let log = (level, msg) => console.error(`[${level}]`, msg);

  const args = process.argv.slice(2);
  const flags = {};

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if      (a === '--project'        && args[i+1]) flags.project = args[++i];
    else if (a === '--repo'           && args[i+1]) flags.repo = args[++i];
    else if (a === '--module'         && args[i+1]) flags.module = args[++i];
    else if (a === '--blueprint'      && args[i+1]) flags.blueprint = args[++i];
    else if (a === '--blueprint-list')              flags.blueprintList = true;
    else if (a === '--prompt'         && args[i+1]) flags.prompt = args[++i];
    else if (a === '--prompt-file'   && args[i+1]) flags.promptFile = args[++i];
    else if (a === '--nova-channel'  && args[i+1]) flags.novaChannel = args[++i];
    else if (a === '--model'          && args[i+1]) flags.runtimeModel = args[++i];
    else if (a === '--thinking'       && args[i+1]) flags.runtimeThinking = args[++i];
    else if (a === '--resume')                      flags.resume = true;
    else if (a === '--status')                      flags.status = true;
    else if (a === '--dry-run')                     flags.dryRun = true;
    else if (a === '--help') {
      console.error(`
KubeClaw Swarm Pipeline — Deterministic Orchestrator

Usage: node pipeline.js [options]

Pipeline commands:
  --project <n>           Project name (or CURRENT_PROJECT env)
  --repo <path>           Git repo root (or REPO_ROOT env; auto-detected if in repo)
  --module <id>           Run a single module
  --resume                Resume pipeline from current state
  --model <id>            Runtime model override (beats all project/config defaults)
  --thinking <level>      Runtime thinking override: none|low|medium|high|xhigh
                          (only applies on ACP/subagent paths; ignored on Redis/Buster)
  --prompt "text"         Nova's prompt override (injected into Forge prompt)
  --prompt-file <path>    Read Nova's prompt from file (for long prompts)
  --nova-channel <id>     Discord channel id for EXIT 10 / TIMEOUT auto-injection
  --status                Print current pipeline status as JSON
  --dry-run               Show execution plan, spawn nothing

Config:
  Platform config:  SWARM_CONFIG env or /app/config/swarm.config.json
  Project config:   <repo>/Projects/<project>/src/.swarm/progress.json

Retry flow:
  Auto-retries 1-2 happen internally (no exit).
  After auto_retry_threshold (default 2), exits with code 10 (NEEDS_NOVA).
  Nova resumes the full pipeline: --resume --prompt "Use approach X instead of Y"

Blueprint commands:
  --blueprint <id>        Release a specific blueprint from architecture branch
  --blueprint-list        List all available blueprints

Exit codes:
  0   Success / pipeline complete
  1   Configuration or system error
  10  NEEDS_NOVA — failure, Nova must analyze
  20  BLOCKED — max retries exceeded, human needed
  30  TIMEOUT — agent didn't respond in time
      `);
      process.exit(0);
    }
  }

  // Env fallback
  if (!flags.project) flags.project = process.env.CURRENT_PROJECT;
  if (!flags.novaChannel) flags.novaChannel = process.env.NOVA_CHANNEL;

  // Nova channel is mandatory for pipeline runs (not for --status, --dry-run, --blueprint)
  if (!flags.novaChannel && !flags.status && !flags.dryRun && !flags.blueprint && !flags.blueprintList) {
    console.error('ERROR: --nova-channel <id> is required (or set NOVA_CHANNEL env var).');
    console.error('       Without it, EXIT 10/TIMEOUT failures cannot be escalated to Nova.');
    process.exit(EXIT_ERROR);
  }

  await (async () => {
    try {
      // Initialize temp directory first; config-aware shutdown hooks/logging follow after config load
      initTempDir();

      // Validate --thinking before loading config so invalid values fail early
      if (flags.runtimeThinking) {
        try { validateThinkingLevel(flags.runtimeThinking, '--thinking'); }
        catch (e) {
          log('ERROR', e.message);
          output({ exit: EXIT_ERROR, error: e.message });
          cleanupTempDir();
          process.exit(EXIT_ERROR);
        }
      }

      const { config, progress } = loadConfig(flags.project, { repoRoot: flags.repo });

      // Store runtime overrides on config so resolvePolicy() can read them anywhere
      if (flags.runtimeModel || flags.runtimeThinking) {
        config._runtimeOverrides = {
          model:    flags.runtimeModel    || null,
          thinking: flags.runtimeThinking || null,
        };
        if (flags.runtimeModel)    log('INFO', `Runtime model override: ${flags.runtimeModel}`);
        if (flags.runtimeThinking) log('INFO', `Runtime thinking override: ${flags.runtimeThinking}`);
      }

      const runId = createRunId();
      const stats = createRunStats();
      const ctx = createPipelineContext({ config, progress, runId, stats, novaChannel: flags.novaChannel });
      ctx._tmpDir = tempManager.dir;
      setActiveContext(ctx);
      initLogDir(config, ctx);
      registerShutdownHooks(config);

      // Blueprint commands
      if (flags.blueprintList) {
        output({ status: 'success', modules: listBlueprints(config) });
        cleanupTempDir();
        process.exit(EXIT_OK);
      }
      if (flags.blueprint) {
        const mod = progress.modules[flags.blueprint];
        if (!mod) {
          output({ status: 'error', error: `Module '${flags.blueprint}' not in progress.json` });
          cleanupTempDir();
          process.exit(EXIT_ERROR);
        }
        const result = await releaseBlueprint(config, progress, flags.blueprint, mod.dir, mod.stages || ['forge', 'buster']);
        output(result);
        cleanupTempDir();
        process.exit(EXIT_OK);
      }

      if (flags.status)  { printStatus(config, progress); cleanupTempDir(); process.exit(EXIT_OK); }
      if (flags.dryRun)  { dryRun(config, progress); cleanupTempDir(); process.exit(EXIT_OK); }

      // Resolve Nova prompt from --prompt or --prompt-file
      let novaPrompt = flags.prompt || null;
      if (!novaPrompt && flags.promptFile) {
        if (!fs.existsSync(flags.promptFile)) {
          throw new Error(`Prompt file not found: ${flags.promptFile}`);
        }
        novaPrompt = fs.readFileSync(flags.promptFile, 'utf8').trim();
        log('INFO', `Nova prompt loaded from file: ${flags.promptFile} (${novaPrompt.length} chars)`);
      }

      const exitCode = await runPipeline(config, progress, {
        module: flags.module,
        resume: flags.resume,
        novaPrompt,
        novaChannel: flags.novaChannel,
      });
      cleanupTempDir();
      process.exit(exitCode);

    } catch (e) {
      log('ERROR', e.message);
      output({ exit: EXIT_ERROR, error: e.message });
      cleanupTempDir();
      clearActiveContext();
      process.exit(EXIT_ERROR);
    }
  })();
}

// Also run directly if invoked as script
if (__currentPath === __entryPath) await main();
