import fs from 'node:fs';
import path from 'node:path';
import { runProcess, assertNotAborted } from './engine/process.ts';

export interface CandidatePreparation {
  readonly mode: 'npm-ci'; readonly executable: string; readonly path: string;
  readonly timeoutMs: number; readonly maxOutputBytes: number;
}
export function candidatePreparation(value: unknown): CandidatePreparation | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('LINT_PREPARATION_CONFIG_INVALID');
  const config = value as Record<string, unknown>;
  if (Object.keys(config).some(key => !['mode', 'executable', 'path', 'timeoutMs', 'maxOutputBytes'].includes(key)) ||
    config.mode !== 'npm-ci' || typeof config.executable !== 'string' || !path.isAbsolute(config.executable) ||
    typeof config.path !== 'string' || !config.path ||
    !Number.isSafeInteger(config.timeoutMs) || (config.timeoutMs as number) <= 0 ||
    !Number.isSafeInteger(config.maxOutputBytes) || (config.maxOutputBytes as number) <= 0) throw new Error('LINT_PREPARATION_CONFIG_INVALID');
  return config as unknown as CandidatePreparation;
}
export async function prepareCandidate(checkout: string, temporary: string, config: CandidatePreparation, signal?: AbortSignal): Promise<void> {
  assertNotAborted(signal);
  for (const filename of ['package.json', 'package-lock.json']) {
    const file = path.join(checkout, filename);
    if (!fs.existsSync(file) || !fs.lstatSync(file).isFile()) throw new Error('LINT_PREPARATION_LOCKFILE_REQUIRED');
  }
  // Preparation has no ambient credentials/config and does not execute package lifecycle scripts.
  if (fs.existsSync(path.join(checkout, 'npm-shrinkwrap.json'))) throw new Error('LINT_PREPARATION_ALTERNATE_LOCK_UNSUPPORTED');
  if (fs.existsSync(path.join(checkout, '.npmrc'))) throw new Error('LINT_PREPARATION_PROJECT_NPMRC_UNSUPPORTED');
  const home = path.join(temporary, 'npm-home'); fs.mkdirSync(home);
  const userconfig = path.join(home, 'user.npmrc'); const globalconfig = path.join(home, 'global.npmrc');
  fs.writeFileSync(userconfig, ''); fs.writeFileSync(globalconfig, '');
  const result = await runProcess(config.executable, ['ci', '--ignore-scripts', '--no-audit', '--no-fund',
    '--cache', path.join(temporary, 'npm-cache'), '--userconfig', userconfig, '--globalconfig', globalconfig], {
    cwd: checkout, env: { PATH: config.path, HOME: home }, signal,
    timeout: config.timeoutMs, maxBuffer: config.maxOutputBytes,
  });
  if (!result.ok) throw Object.assign(new Error('LINT_PREPARATION_FAILED'), { code: result.timedOut ? 'LINT_PREPARATION_TIMEOUT' : 'LINT_PREPARATION_FAILED' });
  assertNotAborted(signal);
}
