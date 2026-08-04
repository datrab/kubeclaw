import type { OpenClawTarget } from './openclaw.ts';

const ID = /^[a-z0-9](?:[a-z0-9._:-]{0,126}[a-z0-9])?$/;
const KEYS = new Set(['endpoint', 'tokenSecret', 'runtime', 'agentId', 'agentRole', 'model', 'thinking', 'cwd', 'repositoryRoot', 'pollMs', 'maxPollMs', 'maxPolls', 'sessionTimeoutMs', 'resultPathPrefix', 'resultEndpoint', 'resultTokenSecret']);

function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function exact(value: Record<string, unknown>, allowed: ReadonlySet<string>, code: string): void { for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`${code}:${key}`); }
function optionalUrl(value: unknown): string | undefined { return typeof value === 'string' ? new URL(value).href.replace(/\/+$/u, '') : undefined; }
function validHttp(value: URL): boolean { return ['http:', 'https:'].includes(value.protocol) && !value.username && !value.password && !value.hash; }
function validInteger(value: number, minimum: number, maximum = Number.MAX_SAFE_INTEGER): boolean { return Number.isSafeInteger(value) && value >= minimum && value <= maximum; }
function text(value: unknown, fallback = ''): string { return typeof value === 'string' ? value.trim() : fallback; }
function idValue(value: unknown, fallback: string): string { return typeof value === 'string' && ID.test(value) ? value : fallback; }
function absolute(value: unknown): string { return typeof value === 'string' && value.startsWith('/') ? value : ''; }
function endpointValue(value: unknown): URL | null { return typeof value === 'string' ? new URL(value) : null; }
function optionalText(value: unknown): string | undefined { return typeof value === 'string' ? value : undefined; }
function prefixValue(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.startsWith('/') || value.split('/').includes('..')) return '';
  return value.replace(/\/+$/u, '');
}
function timingValid(target: OpenClawTarget): boolean {
  return validInteger(target.pollMs, 10) && validInteger(target.maxPollMs, target.pollMs)
    && validInteger(target.maxPolls, 1) && validInteger(target.sessionTimeoutMs, target.pollMs, 86_400_000);
}
function resultValid(target: OpenClawTarget): boolean {
  return ((target.resultEndpoint === undefined) === (target.resultTokenSecret === undefined))
    && (target.resultTokenSecret === undefined || ID.test(target.resultTokenSecret));
}
function targetValid(target: OpenClawTarget, endpoint: URL | null): boolean {
  return [
    endpoint !== null && validHttp(endpoint), ID.test(target.tokenSecret),
    ['acp', 'subagent'].includes(target.runtime), Boolean(target.model), Boolean(target.cwd),
    Boolean(target.repositoryRoot), Boolean(target.resultPathPrefix), resultValid(target), timingValid(target),
  ].every(Boolean);
}

function parseTarget(id: string, raw: unknown): OpenClawTarget {
  if (!ID.test(id) || !record(raw)) throw new Error(`RUNTIME_CONFIG_INVALID:target:${id}`);
  exact(raw, KEYS, 'RUNTIME_CONFIG_UNKNOWN_TARGET_FIELD');
  const endpoint = endpointValue(raw.endpoint);
  const target: OpenClawTarget = {
    endpoint: endpoint?.href ?? '', tokenSecret: text(raw.tokenSecret),
    runtime: raw.runtime as 'acp' | 'subagent',
    agentId: idValue(raw.agentId, 'codex'), agentRole: idValue(raw.agentRole, id), model: text(raw.model),
    thinking: text(raw.thinking, 'high'), cwd: absolute(raw.cwd), repositoryRoot: absolute(raw.repositoryRoot),
    pollMs: Number(raw.pollMs ?? 1_000), maxPollMs: Number(raw.maxPollMs ?? 15_000),
    maxPolls: Number(raw.maxPolls ?? 1_800), sessionTimeoutMs: Number(raw.sessionTimeoutMs ?? 1_800_000),
    resultPathPrefix: prefixValue(raw.resultPathPrefix), resultEndpoint: optionalUrl(raw.resultEndpoint),
    resultTokenSecret: optionalText(raw.resultTokenSecret),
  };
  if (!targetValid(target, endpoint)) throw new Error(`RUNTIME_CONFIG_INVALID:openclaw:${id}`);
  return target;
}

export function targetsFrom(raw: Readonly<Record<string, unknown>>): ReadonlyMap<string, OpenClawTarget> {
  exact(raw as Record<string, unknown>, new Set(['targets']), 'RUNTIME_CONFIG_UNKNOWN_FIELD');
  if (!record(raw.targets) || Object.keys(raw.targets).length === 0) throw new Error('RUNTIME_CONFIG_INVALID:targets');
  return new Map(Object.entries(raw.targets).map(([id, target]) => [id, parseTarget(id, target)]));
}

export function validTargetId(value: string): boolean { return ID.test(value); }
