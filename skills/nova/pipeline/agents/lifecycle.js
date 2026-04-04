import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { resolveModel, logEffectivePolicy } from '../core/config.js';
import { completionStreamKey, modulePath, relPath, statusPath, swarmRoot, validateSafePath } from '../core/paths.js';
import { log, getActiveContext } from '../core/logger.js';
import { onAgentKilled } from '../services/telemetry.js';
import { gatewayInvoke } from '../integrations/gateway.js';
import { discord } from '../integrations/discord.js';
import { acpxCleanup, getTrackedAgent, reaperAfterKill, trackAgent, untrackAgent } from './shutdown.js';
import { parseSessionState, readAcpTranscriptState, transcriptShowsProgress, waitForSessionIdle } from './acp-monitor.js';

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function nodeExec(scriptPath, args, opts = {}) {
  const defaults = { encoding: 'utf8', timeout: 30000, maxBuffer: 50 * 1024 * 1024 };
  const result = execFileSync('node', [scriptPath, ...args], { ...defaults, ...opts });
  return typeof result === 'string' ? result.trim() : '';
}
function tmpFile(prefix, moduleId = '', ext = '.tmp') {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return path.join('/tmp', `swarm-pipeline-${prefix}-${moduleId}-${ts}-${rand}${ext}`);
}

export function acpLabel(agentType, moduleId) { return `${agentType}-${moduleId}`; }
export function modelToHarness(modelId) {
  if (!modelId) return null;
  const m = modelId.toLowerCase();
  if (m.includes('claude')) return 'claude';
  if (m.includes('codex')) return 'codex';
  if (m.includes('gpt')) return 'codex';
  if (m.includes('gemini')) return 'gemini';
  if (m.includes('opencode')) return 'opencode';
  if (m.includes('kimi')) return 'kimi';
  return null;
}

export async function spawnAcpAgent(config, agentType, moduleId, model, taskPrompt, opts = {}) {
  const agentConfig = config.agents[agentType];
  const trackingKey = acpLabel(agentType, moduleId);
  const gatewayLabel = `${trackingKey}-${Date.now()}`;
  const agentId = modelToHarness(model) || agentConfig.acp_agent_id || agentType;
  const cwd = agentConfig.cwd || config.repo_root;
  const m = String(model || '').toLowerCase();
  const useSubagent = m.startsWith('openai/') || m.startsWith('openai-codex/') || m.includes('gpt-5') || m.includes('codex');

  // Thinking: opts.thinking (from policy resolver) beats config.agents fallback
  const thinkingLevel = opts.thinking || (useSubagent ? null : config.agents?.[agentType]?.thinking_level) || null;

  log('STEP', `Spawning ${useSubagent ? 'subagent' : 'ACP'} session: ${gatewayLabel} (agent: ${agentId}, model: ${model}${thinkingLevel ? `, thinking: ${thinkingLevel}` : ''})`);

  const spawnArgs = {
    task: taskPrompt,
    runtime: useSubagent ? 'subagent' : 'acp',
    label: gatewayLabel,
    model,
    cwd,
    thread: false,
    mode: 'run',
    cleanup: 'keep',
  };
  if (!useSubagent) {
    spawnArgs.agentId = agentId;
    spawnArgs.streamTo = 'parent';
    if (thinkingLevel) spawnArgs.thinking = thinkingLevel;
  }

  try {
    const raw = await gatewayInvoke('sessions_spawn', spawnArgs, 30000);
    const result = raw?.result?.details || raw;
    if (result.status !== 'accepted') throw new Error(`Spawn not accepted: ${JSON.stringify(result)}`);
    const streamLogPath = result.streamLogPath || null;
    log('OK', `${useSubagent ? 'Subagent' : 'ACP'} session spawned: ${gatewayLabel} → ${result.childSessionKey}${streamLogPath ? ` (stream: ${streamLogPath})` : ''}`, { agent: agentId, model, sessionKey: result.childSessionKey, runId: result.runId, stream: streamLogPath });
    trackAgent(config, trackingKey, result.childSessionKey, agentId, gatewayLabel, streamLogPath, { model, runtime: useSubagent ? 'subagent' : 'acp', moduleId });

    // Capture baseline files for files_changed tracking at kill time (non-critical)
    try {
      const baselineOutput = execFileSync('git', ['diff', '--name-only', 'HEAD'], {
        encoding: 'utf8', timeout: 5000, cwd: cwd
      });
      const entry = getTrackedAgent(trackingKey);
      if (entry) entry._baselineFiles = new Set(baselineOutput.trim().split('\n').filter(Boolean));
    } catch { /* non-critical — no git repo or command failed */ }

    discord(config, 'INFO', `🔬 ${useSubagent ? 'Subagent' : 'ACP'} Session Spawned: ${agentType}/${moduleId}`, 'Agent is now working.', [
      { name: 'Agent', value: agentId, inline: true },
      { name: 'Model', value: model, inline: true },
      { name: 'Session', value: result.childSessionKey, inline: false },
    ]).catch(() => {});
    return { label: trackingKey, childSessionKey: result.childSessionKey, runId: result.runId, streamLogPath };
  } catch (e) {
    discord(config, 'CRITICAL', `❌ Spawn Failed: ${agentType}/${moduleId}`, e.message?.split('\n')[0] || 'unknown').catch(() => {});
    throw new Error(`Failed to spawn session '${gatewayLabel}': ${e.message}`);
  }
}

export async function killAcpAgent(config, agentType, moduleId, graceful = false) {
  const label = acpLabel(agentType, moduleId);
  const entry = getTrackedAgent(label);
  const sessionKey = entry?.sessionKey;
  if (!sessionKey) {
    log('WARN', `No sessionKey tracked for '${label}' — skipping kill`);
    untrackAgent(label);
    return;
  }
  if (graceful) {
    log('INFO', `Waiting for session to become idle: ${label}`);
    await waitForSessionIdle(sessionKey);
  }
  const runtime = entry?.runtime;
  const entryModel = entry?.model || '';
  const lower = String(entryModel).toLowerCase();
  const isSubagent = runtime === 'subagent' || lower.startsWith('openai/') || lower.startsWith('openai-codex/') || lower.includes('gpt-5') || lower.includes('codex');

  log('STEP', `Destroying ${isSubagent ? 'subagent' : 'ACP'} session: ${label} (${sessionKey})`);
  try {
    await gatewayInvoke('sessions_send', { sessionKey, message: '/stop' }, 15000);
    log('OK', `Session destroyed: ${label}`);
  } catch {
    log('WARN', `Could not destroy session '${label}' — may have already exited`);
  }
  if (!isSubagent) {
    await acpxCleanup(entry.agentId, entry.gatewayLabel);
    await reaperAfterKill(entry.agentId, sessionKey);
  }

  // Compute files_changed against baseline (non-critical)
  let filesChanged = null;
  let baselineTracked = false;
  if (entry?._baselineFiles) {
    baselineTracked = true;
    try {
      const repoRoot = config?.repo_root || process.cwd();
      const currentOutput = execFileSync('git', ['diff', '--name-only', 'HEAD'], {
        encoding: 'utf8', timeout: 5000, cwd: repoRoot
      });
      const currentFiles = new Set(currentOutput.trim().split('\n').filter(Boolean));
      const newFiles = [...currentFiles].filter(f => !entry._baselineFiles.has(f));
      if (newFiles.length > 0) filesChanged = newFiles;
    } catch { /* non-critical */ }
  }

  untrackAgent(label);

  // Emit agent.killed telemetry with files_changed
  try {
    const _ctx = getActiveContext() || { config };
    onAgentKilled(_ctx, agentType, {
      label,
      module_id: moduleId,
      has_changes: baselineTracked ? (filesChanged !== null) : null,
      files_changed: filesChanged,
    });
  } catch { /* non-critical */ }
}

export function buildBusterPayload(config, progress, moduleId, taskType, taskPrompt, status, opts = {}) {
  const base = { task_type: taskType, module: moduleId, project: config.project, commit_hash: status?.forge_commit_hash || null, timestamp: new Date().toISOString(), completion_stream: completionStreamKey(config) };
  if (taskType === 'module_test') {
    const mod = progress.modules[moduleId];
    return { ...base, instructions: taskPrompt, session: { model: opts.model || null, agentId: modelToHarness(opts.model) || null, cwd: config.repo_root, timeout_seconds: (mod?.timeout_minutes ?? config.default_timeout_minutes) * 60, label: `buster-test-${moduleId}-${Date.now()}` }, module_path: mod ? relPath(config, modulePath(config, mod.dir)) : null, buster_md_path: mod ? relPath(config, path.join(modulePath(config, mod.dir), 'BUSTER.md')) : null, status_json_path: mod ? relPath(config, statusPath(config, mod.dir)) : null, test_suites: mod?.test_suites || null, test_config: mod?.test_config || null, run_id: opts.run_id || null, attempt: opts.attempt || 1, log_dir: (mod && config._logDir) ? path.join(config._logDir, 'modules', mod.dir) : null };
  }
  if (taskType === 'gate_test') {
    const gate = opts.gate || progress.gates?.[moduleId] || {};
    const gateTimeout = gate.timeout_minutes ?? config.default_timeout_minutes;
    return { ...base, instructions: taskPrompt, session: { model: opts.model || null, agentId: modelToHarness(opts.model) || null, cwd: config.repo_root, timeout_seconds: gateTimeout * 60, label: `buster-gate-${moduleId}-${Date.now()}` }, gate_id: moduleId, gate_title: gate.title || moduleId, work_dir: relPath(config, swarmRoot(config)), output_file: gate.output_file ? relPath(config, path.join(swarmRoot(config), gate.output_file)) : null, instructions_file: gate.instructions_file ? relPath(config, path.join(swarmRoot(config), gate.instructions_file)) : null, test_suites: gate.test_suites || null, test_config: gate.test_config || null, log_dir: config._logDir ? path.join(config._logDir, 'gates', moduleId) : null };
  }
  return { ...base, message: taskPrompt };
}

export function dispatchRedisTask(config, progress, agentType, moduleId, taskType, payload, status = null, opts = {}) {
  const agentConfig = config.agents[agentType];
  const redisJsPath = validateSafePath(agentConfig.redis_js_path || '/app/skills/redis.js', `agents.${agentType}.redis_js_path`);
  log('STEP', `Dispatching to Redis: ${agentType} (module: ${moduleId}, type: ${taskType})`);
  const taskPayload = (taskType === 'module_test' || taskType === 'gate_test') ? buildBusterPayload(config, progress, moduleId, taskType, payload, status, opts) : { module: moduleId, project: config.project, message: payload, timestamp: new Date().toISOString() };
  const tmpPayloadPath = tmpFile('payload', moduleId, '.json');
  const tmpScriptPath = tmpFile('dispatch', moduleId, '.mjs');
  fs.writeFileSync(tmpPayloadPath, JSON.stringify(taskPayload));
  fs.writeFileSync(tmpScriptPath, `
    import fs from 'fs';
    try {
      const lib = await import(${JSON.stringify(redisJsPath)});
      const payload = JSON.parse(fs.readFileSync(${JSON.stringify(tmpPayloadPath)}, 'utf8'));
      const result = await lib.default.sendTask(${JSON.stringify(agentType)}, ${JSON.stringify(taskType)}, payload, 1);
      console.log(JSON.stringify(result));
      await lib.default.disconnect();
    } catch (e) {
      console.error(JSON.stringify({ error: e.message, code: e.code || 'UNKNOWN' }));
      process.exit(1);
    }
  `);
  try {
    const result = nodeExec(tmpScriptPath, [], { timeout: 15000, env: process.env });
    log('OK', `Redis task dispatched to ${agentType}: ${result}`);
    const jsonMatch = result.match(/(\{[\s\S]*\})\s*$/);
    return JSON.parse(jsonMatch ? jsonMatch[1] : result);
  } catch (e) {
    throw new Error(`Failed to dispatch Redis task to ${agentType}: ${e.message}`);
  } finally {
    try { fs.unlinkSync(tmpPayloadPath); } catch {}
    try { fs.unlinkSync(tmpScriptPath); } catch {}
  }
}

export async function spawnAgent(config, progress, agentType, moduleId, model, taskPrompt, opts = {}) {
  const agentConfig = config.agents[agentType];
  if (!agentConfig) throw new Error(`Unknown agent type: ${agentType}`);
  if (agentConfig.dispatch === 'redis') {
    const taskType = opts.taskType || 'module_test';
    opts.model = model;
    return dispatchRedisTask(config, progress, agentType, moduleId, taskType, taskPrompt, opts.status, opts);
  }
  return spawnAcpAgent(config, agentType, moduleId, model, taskPrompt, { thinking: opts.thinking });
}

export async function killAgent(config, agentType, moduleId, graceful = false) {
  const agentConfig = config.agents[agentType];
  if (!agentConfig) return;
  if (agentConfig.dispatch === 'redis') log('INFO', `${agentType} is a Redis agent — no session to destroy (persistent instance)`);
  else await killAcpAgent(config, agentType, moduleId, graceful);
}

export async function steerAgent(config, progress, agentType, moduleId, message) {
  const agentConfig = config.agents[agentType];
  if (!agentConfig) return;
  if (agentConfig.dispatch === 'redis') {
    log('STEP', `Steering ${agentType} via Redis follow-up message`);
    try { dispatchRedisTask(config, progress, agentType, moduleId, 'steer', message); }
    catch (e) { log('WARN', `Redis steer failed for ${agentType}: ${e.message}`); }
    return;
  }
  const label = acpLabel(agentType, moduleId);
  const sessionKey = getTrackedAgent(label)?.sessionKey;
  if (!sessionKey) {
    log('WARN', `No sessionKey tracked for '${label}' — cannot steer`);
    return;
  }
  try { await gatewayInvoke('sessions_send', { sessionKey, message }, 15000); }
  catch (e) { log('WARN', `ACP steer failed for '${label}': ${e.message}`); }
}

export async function verifyAgentAlive(config, agentType, moduleId, waitMs = 8000) {
  const agentConfig = config.agents[agentType];
  if (!agentConfig) return false;
  if (agentConfig.dispatch === 'redis') return true;
  await sleep(waitMs);
  const label = acpLabel(agentType, moduleId);
  const entry = getTrackedAgent(label);
  const sessionKey = entry?.sessionKey;
  if (!sessionKey) {
    log('ERROR', `Agent health check failed: no sessionKey for '${label}'`);
    return false;
  }
  try {
    const raw = await gatewayInvoke('session_status', { sessionKey }, 10000);
    const result = raw?.result?.details || raw;
    const { state } = parseSessionState(result);
    if (/^(closed|error)$/i.test(state)) {
      log('ERROR', `Agent health check: session in terminal state '${state}': ${label}`);
      return false;
    }
    if (/^(unknown|unreachable)$/i.test(state)) {
      const transcript = readAcpTranscriptState(entry?.streamLogPath);
      if (transcriptShowsProgress(transcript)) {
        log('WARN', `Agent health check using transcript fallback: ${label} (${sessionKey})`);
        return true;
      }
    }
    log('OK', `Agent health check passed: ${label} (${sessionKey}, state: ${state})`);
    return true;
  } catch (e) {
    const transcript = readAcpTranscriptState(entry?.streamLogPath);
    if (transcriptShowsProgress(transcript)) {
      log('WARN', `Agent health check using transcript fallback after session_status failure: ${label} (${sessionKey})`);
      return true;
    }
    log('ERROR', `Agent health check failed for '${label}': ${e.message}`);
    return false;
  }
}

export async function spawnReviewerAgent(config, progress, gateId, reviewer, instructions, opts = {}) {
  const trackingKey = `echo-${reviewer.label}-${gateId}`;
  const gatewayLabel = `${trackingKey}-${Date.now()}`;
  const model = resolveModel(config, progress, 'echo', reviewer.model);
  const agentId = modelToHarness(model) || reviewer.agent_id || 'claude';
  const cwd = config.agents.echo?.cwd || config.repo_root;
  // Thinking: opts.thinking (from policy resolver) beats config.agents.echo fallback
  const thinkingLevel = opts.thinking || config.agents?.echo?.thinking_level || null;
  log('STEP', `Spawning reviewer: ${gatewayLabel} (agent: ${agentId}, model: ${model}${thinkingLevel ? `, thinking: ${thinkingLevel}` : ''})`);
  const m = String(model || '').toLowerCase();
  const useSubagent = reviewer.dispatch === 'subagent'
    || m.startsWith('openai/')
    || m.startsWith('openai-codex/')
    || m.includes('gpt-5')
    || m.includes('codex');
  const spawnArgs = {
    task: instructions,
    runtime: useSubagent ? 'subagent' : 'acp',
    label: gatewayLabel,
    model,
    cwd,
    thread: false,
    mode: 'run',
    cleanup: 'keep',
  };
  if (!useSubagent) {
    spawnArgs.streamTo = 'parent';
    spawnArgs.agentId = agentId;
    if (thinkingLevel) spawnArgs.thinking = thinkingLevel;
  }
  try {
    const raw = await gatewayInvoke('sessions_spawn', spawnArgs, 30000);
    const result = raw?.result?.details || raw;
    if (result.status !== 'accepted') throw new Error(`Spawn not accepted: ${JSON.stringify(result)}`);
    const streamLogPath = result.streamLogPath || null;
    log('OK', `Reviewer spawned: ${gatewayLabel} → ${result.childSessionKey}${streamLogPath ? ` (stream: ${streamLogPath})` : ''}`, { agent: agentId, model, reviewer: reviewer.label, sessionKey: result.childSessionKey, runId: result.runId, stream: streamLogPath });
    trackAgent(config, trackingKey, result.childSessionKey, agentId, gatewayLabel, streamLogPath, { model, runtime: useSubagent ? 'subagent' : 'acp', moduleId });
    discord(config, 'INFO', `🔬 Reviewer Spawned: ${reviewer.label}/${gateId}`, 'Echo reviewer is now working.', [
      { name: 'Reviewer', value: reviewer.label, inline: true },
      { name: 'Model', value: model, inline: true },
      { name: 'Agent', value: agentId, inline: true },
      { name: 'Session', value: result.childSessionKey, inline: false },
    ]).catch(() => {});
    return { label: trackingKey, childSessionKey: result.childSessionKey, runId: result.runId, streamLogPath };
  } catch (e) {
    discord(config, 'CRITICAL', `❌ Reviewer Spawn Failed: ${gateId}`, `${reviewer.label}: ${e.message?.split('\n')[0] || 'unknown'}`).catch(() => {});
    throw new Error(`Failed to spawn reviewer '${gatewayLabel}': ${e.message}`);
  }
}

export async function killReviewerAgent(config, gateId, reviewer, graceful = false) {
  const label = `echo-${reviewer.label}-${gateId}`;
  const entry = getTrackedAgent(label);
  const sessionKey = entry?.sessionKey;
  if (!sessionKey) {
    log('WARN', `No sessionKey for reviewer '${label}' — skipping kill`);
    untrackAgent(label);
    return;
  }
  if (graceful) {
    log('INFO', `Waiting for reviewer session to become idle: ${label}`);
    await waitForSessionIdle(sessionKey);
  }
  log('STEP', `Destroying reviewer session: ${label} (${sessionKey})`);
  try {
    await gatewayInvoke('sessions_send', { sessionKey, message: '/stop' }, 15000);
    log('OK', `Reviewer session destroyed: ${label}`);
  } catch {
    log('WARN', `Could not destroy reviewer '${label}' — may have already exited`);
  }
  const runtime = entry?.runtime;
  if (runtime !== 'subagent') {
    await acpxCleanup(entry.agentId, entry.gatewayLabel);
    await reaperAfterKill(entry.agentId, sessionKey);
  }
  untrackAgent(label);
}
