import { execFileSync } from 'node:child_process';
import { log } from '../core/logger.ts';
import { buildSubprocessEnv } from '../security.ts';
import { canonicalizeModelId } from './runtime.ts';
import { getTrackedAgent } from './lifecycle.ts';
import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';

export type AnyRecord = Record<string, any>;
const REASONING_LEVEL_NOT_CONFIGURED = 'default';
const DISPLAY_AGENT_ROLE_FALLBACK = 'Agent';

export function textValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
}

export function objectRecord(value: unknown): AnyRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as AnyRecord : {};
}

export function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function reasoningLevelValue(value: unknown): string {
  return textValue(value) ?? REASONING_LEVEL_NOT_CONFIGURED;
}

export function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as AnyRecord).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return String(error);
}

export function requiredCanonicalModelId(model: unknown, label: string): string {
  const resolved = canonicalizeModelId(model);
  if (!resolved) throw new Error(`${label}: required non-empty model id`);
  return resolved;
}

export function requiredAcpAgentId(agentConfig: AnyRecord, agentType: string): string {
  const agentId = textValue(agentConfig?.acp_agent_id);
  if (!agentId) throw new Error(`ACP dispatch for '${agentType}' requires explicit acp_agent_id`);
  return agentId;
}

export function requiredAgentCwd(agentConfig: AnyRecord, config: AnyRecord, agentType: string, opts: AnyRecord = {}): string {
  const cwd = selectDefinedValue(
    () => (selectDefinedValue(() => (textValue(opts?.cwd)), () => (textValue(agentConfig?.cwd)))),
    () => (textValue(config?.repo_root)),
  );
  if (!cwd) throw new Error(`Agent '${agentType}' requires explicit cwd or config.repo_root`);
  return cwd;
}

export function acpLabel(agentType: string, moduleId: string) {
  return `${agentType}-${moduleId}`;
}

export function displayAgentRole(agentType: string) {
  const normalized = textValue(agentType) ?? DISPLAY_AGENT_ROLE_FALLBACK;
  return normalized.replace(/^\w/, (char: any) => char.toUpperCase());
}

function isGitWorktree(cwd: string | null) {
  if (!cwd) return false;
  try {
    const output = execFileSync('git', ['-C', cwd, 'rev-parse', '--is-inside-work-tree'], {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: buildSubprocessEnv(),
    });
    return output.trim() === 'true';
  } catch (_error) {
    return false;
  }
}

export function captureBaselineFiles(trackingKey: string, cwd: string | null) {
  if (!isGitWorktree(cwd) || !cwd) return;
  try {
    const output = execFileSync('git', ['-C', cwd, 'diff', '--name-only', 'HEAD'], {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: buildSubprocessEnv(),
    });
    const entry = getTrackedAgent(trackingKey);
    if (!entry) return;
    entry._baselineCwd = cwd;
    entry._baselineFiles = new Set(output.trim().split('\n').filter(Boolean));
  } catch (error) {
    log('DEBUG', `Could not capture baseline files for ${trackingKey}: ${errorMessage(error)}`);
  }
}

export function computeFilesChanged(entry: AnyRecord | null, _config: AnyRecord) {
  let filesChanged = null;
  let baselineTracked = false;
  if (!entry?._baselineFiles) return { filesChanged, baselineTracked };
  baselineTracked = true;
  try {
    const baselineCwd = selectTruthyValue(() => (entry._baselineCwd), () => (null));
    if (!baselineCwd || !isGitWorktree(baselineCwd)) return { filesChanged, baselineTracked: false };
    const output = execFileSync('git', ['-C', baselineCwd, 'diff', '--name-only', 'HEAD'], {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: buildSubprocessEnv(),
    });
    const currentFiles = new Set(output.trim().split('\n').filter(Boolean));
    const newFiles = [...currentFiles].filter((file: any) => !entry._baselineFiles.has(file));
    if (newFiles.length > 0) filesChanged = newFiles;
  } catch (error: any) {
    const label = selectDefinedValue(() => (textValue(entry?.gatewayLabel)), () => ('agent'));
    log('DEBUG', `Could not compute files changed for ${label}: ${selectTruthyValue(() => (error?.message), () => (error))}`);
  }
  return { filesChanged, baselineTracked };
}
