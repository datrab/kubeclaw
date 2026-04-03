// core/config.js — Config loading, validation, and model resolution
// Extracted from pipeline-original.js (module 02)

import fs from 'fs';
import path from 'path';
import { log } from './logger.js';
import { validateSafePath } from './paths.js';
import { getRepoRoot, setRepoRoot } from './git.js';
import { resolvePolicy, validateThinkingLevel, logEffectivePolicy, VALID_THINKING_LEVELS, THINKING_SUPPORTED_PATHS, THINKING_UNSUPPORTED_PATHS } from './policy.js';

export { resolvePolicy, validateThinkingLevel, logEffectivePolicy, VALID_THINKING_LEVELS, THINKING_SUPPORTED_PATHS, THINKING_UNSUPPORTED_PATHS };

// ─── Exported functions ───────────────────────────────────────────────────────

export function loadConfig(projectName, opts = {}) {
  if (!projectName) {
    throw new Error(
      'Project name required. Use --project <n> or set CURRENT_PROJECT env.'
    );
  }

  let repoRoot = opts.repoRoot || process.env.REPO_ROOT || null;
  if (repoRoot) {
    repoRoot = path.resolve(repoRoot);
    if (!fs.existsSync(path.join(repoRoot, '.git'))) {
      throw new Error(`Repo root '${repoRoot}' is not a git repository (no .git directory)`);
    }
    log('INFO', `Repo root from ${opts.repoRoot ? '--repo flag' : 'REPO_ROOT env'}: ${repoRoot}`);
  } else {
    try {
      repoRoot = getRepoRoot();
    } catch {
      throw new Error(
        'Cannot determine repo root. Either:\n' +
        '  --repo <path>        Pass the repo path explicitly\n' +
        '  REPO_ROOT=<path>     Set as environment variable\n' +
        '  cd <repo>            Run from within the git repo'
      );
    }
  }

  const swarmConfigPath = process.env.SWARM_CONFIG || '/app/config/swarm.config.json';
  if (!fs.existsSync(swarmConfigPath)) {
    throw new Error(
      `Swarm config not found: ${swarmConfigPath}\n` +
      `  Set SWARM_CONFIG env or place at /app/config/swarm.config.json`
    );
  }
  const swarmConfig = JSON.parse(fs.readFileSync(swarmConfigPath, 'utf8'));

  const swarmDir = path.join(repoRoot, 'Projects', projectName, 'src', '.swarm');
  const progressFile = path.join(swarmDir, 'progress.json');
  const modulesDir = path.join(swarmDir, 'modules');

  if (!fs.existsSync(progressFile)) {
    throw new Error(
      `Progress file not found: ${progressFile}\n` +
      `  Expected at: <repo>/Projects/${projectName}/src/.swarm/progress.json`
    );
  }
  const progress = JSON.parse(fs.readFileSync(progressFile, 'utf8'));

  const config = {
    ...swarmConfig,
    project: projectName,
    repo_root: repoRoot,
    paths: {
      swarm_dir: swarmDir,
      modules_dir: modulesDir,
      progress_file: progressFile,
    },
  };

  if (progress.pipeline_review && !config.pipeline_review) {
    config.pipeline_review = progress.pipeline_review;
  }

  if (!config.discord_webhook_url && process.env.DISCORD_WEBHOOK) {
    config.discord_webhook_url = process.env.DISCORD_WEBHOOK;
  }

  validateConfig(config, progress);

  // Make headHash() usable without passing config explicitly (e.g. in addHistory).
  setRepoRoot(config.repo_root);

  return { config, progress };
}

export function validateConfig(config, progress) {
  const errors = [];

  const requireField = (obj, fieldPath, parentPath = 'config') => {
    const keys = fieldPath.split('.');
    let current = obj;
    let currentPath = parentPath;
    for (const key of keys) {
      currentPath = `${currentPath}.${key}`;
      if (current === null || current === undefined || typeof current !== 'object') {
        errors.push(`${currentPath}: parent is ${current === null ? 'null' : typeof current}`);
        return;
      }
      current = current[key];
    }
    if (current === undefined || current === null) {
      errors.push(`${currentPath}: required field is missing`);
    }
  };

  requireField(config, 'project');
  requireField(config, 'repo_root');
  requireField(config, 'paths');
  requireField(config, 'paths.swarm_dir');
  requireField(config, 'paths.progress_file');
  requireField(config, 'paths.modules_dir');
  requireField(config, 'agents');
  requireField(config, 'agents.forge');
  requireField(config, 'agents.buster');

  config.agents.buster.dispatch = 'redis';
  config.agents.buster.redis_js_path ??= '/app/skills/redis.js';

  config.models ??= {};

  for (const [name, agentConf] of Object.entries(config.agents || {})) {
    if (typeof agentConf !== 'object' || agentConf === null) continue;
    if (name.startsWith('_')) continue;
    if (!agentConf.dispatch) {
      errors.push(`config.agents.${name}.dispatch: required ('acp' or 'redis')`);
    }
    if (agentConf.dispatch === 'redis' && !agentConf.redis_js_path) {
      errors.push(`config.agents.${name}.redis_js_path: required for redis dispatch agents`);
    }
  }

  config.poll_interval_seconds ??= 30;
  config.default_timeout_minutes ??= 45;
  config.default_max_fails ??= 3;
  config.acp_monitor ??= {};
  config.acp_monitor.unknown_poll_limit ??= 10;
  config.acp_monitor.stale_poll_limit ??= 10;

  requireField(progress, 'project', 'progress');
  requireField(progress, 'execution_order', 'progress');
  requireField(progress, 'modules', 'progress');

  const validGateTypes = ['buster', 'review', 'approval'];
  const validOnNogo    = ['fix_and_rereview'];
  const validOnFail    = ['fix_and_retest'];
  const validOnTimeout = ['block', 'continue'];

  for (const [gateId, gate] of Object.entries(progress.gates || {})) {
    if (!gate.type) {
      errors.push(`progress.gates.${gateId}.type: required (${validGateTypes.join(' | ')})`);
    } else if (!validGateTypes.includes(gate.type)) {
      errors.push(`progress.gates.${gateId}.type: '${gate.type}' not valid (${validGateTypes.join(' | ')})`);
    }

    if (gate.type === 'review') {
      if (!gate.review_name) errors.push(`progress.gates.${gateId}.review_name: required for review gates`);
      if (!gate.instructions_file) errors.push(`progress.gates.${gateId}.instructions_file: required`);
      if (gate.on_nogo && !validOnNogo.includes(gate.on_nogo)) {
        errors.push(`progress.gates.${gateId}.on_nogo: '${gate.on_nogo}' not valid (${validOnNogo.join(' | ')})`);
      }
    }

    if (gate.type === 'buster') {
      if (gate.on_fail && !validOnFail.includes(gate.on_fail)) {
        errors.push(`progress.gates.${gateId}.on_fail: '${gate.on_fail}' not valid (${validOnFail.join(' | ')})`);
      }
    }

    if (gate.type === 'approval') {
      if (!gate.title) {
        errors.push(`progress.gates.${gateId}.title: required for approval gates`);
      }
      if (gate.on_timeout && !validOnTimeout.includes(gate.on_timeout)) {
        errors.push(`progress.gates.${gateId}.on_timeout: '${gate.on_timeout}' not valid (${validOnTimeout.join(' | ')})`);
      }
      if (gate.timeout_minutes !== undefined && gate.timeout_minutes !== null) {
        const tm = Number(gate.timeout_minutes);
        if (!Number.isFinite(tm) || tm <= 0) {
          errors.push(`progress.gates.${gateId}.timeout_minutes: must be a positive number`);
        }
      }
    }
  }

  for (const [name, agentConf] of Object.entries(config.agents || {})) {
    if (agentConf?.redis_js_path) {
      try { validateSafePath(agentConf.redis_js_path, `config.agents.${name}.redis_js_path`); }
      catch (e) { errors.push(e.message); }
    }
  }

  if (errors.length > 0) {
    config._validationErrors = errors;
    throw new Error(
      `Config validation failed with ${errors.length} error(s):\n` +
      errors.map(e => `  - ${e}`).join('\n')
    );
  }
}

export function validateBusterConfig(config) {
  const buster = config.agents?.buster;
  if (!buster) throw new Error('config.agents.buster missing');
  if (buster.dispatch !== 'redis') throw new Error('Buster must use redis dispatch');
  if (!buster.redis_js_path) throw new Error('Buster redis_js_path missing');
  validateSafePath(buster.redis_js_path, 'config.agents.buster.redis_js_path');
  return true;
}

export function resolveModel(config, progress, agentName, explicitModel = null) {
  const { model } = resolvePolicy(config, progress, agentName, { scopeModel: explicitModel });
  return model;
}
