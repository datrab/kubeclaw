import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { getPipelineArtifactBundle } from './artifact-bundle.ts';

export function text(value: unknown) {
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : null;
}

export function readJson(file: string, fallback: any = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    /* INTENTIONAL_NONCRITICAL(optional_probe_failed): absent evidence is represented explicitly. */
    return fallback;
  }
}

export function readJsonLines(file: string) {
  try {
    return fs.readFileSync(file, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    /* INTENTIONAL_NONCRITICAL(optional_probe_failed): absent evidence is represented explicitly. */
    return [];
  }
}

export function git(repo: string, args: string[]) {
  try {
    return execFileSync('git', ['-C', repo, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 10_000,
    }).trim();
  } catch {
    /* INTENTIONAL_NONCRITICAL(optional_probe_failed): optional Git evidence may be absent. */
    return null;
  }
}

function safeConfigValue(
  value: any,
  key: string,
  seen: WeakSet<object>
): any {
  if (/secret|token|password|credential|api.?key/i.test(key)) {
    return undefined;
  }
  if (value == null || ['string', 'number', 'boolean'].includes(typeof value)) {
    return value;
  }
  if (typeof value === 'function' || typeof value === 'bigint') {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => safeConfigValue(item, '', seen))
      .filter((item) => item !== undefined);
  }
  if (typeof value !== 'object' || seen.has(value)) return undefined;
  seen.add(value);
  const output: Record<string, any> = {};
  for (const [child, item] of Object.entries(value)) {
    if (child.startsWith('_')) continue;
    const normalized = safeConfigValue(item, child, seen);
    if (normalized !== undefined) output[child] = normalized;
  }
  return output;
}

export function safeConfig(config: any) {
  return safeConfigValue(config ?? {}, '', new WeakSet());
}

export function evidenceConfig(config: any) {
  return {
    ...config,
    pipeline_dir: getPipelineArtifactBundle(config).pipeline_dir,
  };
}

function fileSha(file: string) {
  try {
    return crypto.createHash('sha256')
      .update(fs.readFileSync(file))
      .digest('hex');
  } catch {
    /* INTENTIONAL_NONCRITICAL(optional_probe_failed): optional source evidence may be absent. */
    return null;
  }
}

export function versionedSource(
  repo: string | null,
  id: string,
  relative: string
) {
  const absolute = repo ? path.join(repo, relative) : null;
  return {
    id,
    version: repo ? git(repo, ['rev-parse', 'HEAD']) : null,
    source: relative,
    sha256: absolute ? fileSha(absolute) : null,
  };
}

export function configuredRecords(value: any, prefix: string): any[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      configuredRecords(item, `${prefix}[${index}]`)
    );
  }
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([id, item]) =>
    typeof item === 'object' && item !== null
      ? [{ id: `${prefix}.${id}`, ...safeConfig(item) }]
      : []
  );
}
