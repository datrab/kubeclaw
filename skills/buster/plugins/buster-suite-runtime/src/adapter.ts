import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import type { AdapterActivationContext, AdapterInstance, AdapterInvocation } from '@kubeclaw/plugin-sdk';
import {
  JOB_SCHEMA,
  STATUS_SCHEMA,
  exact,
  isRecord,
  parseResult,
  requiredCapabilitiesForSuites,
  relocateRepositoryValues,
  sha256,
  stringList,
  SUPPORTED_SUITES,
} from './protocol.ts';

const exec = promisify(execFile);

interface ClientConfig {
  readonly endpoint: string;
  readonly tokenSecret: string;
  readonly allowedRoots: readonly string[];
  readonly allowedSuites: ReadonlySet<string>;
  readonly capabilities: readonly string[];
  readonly gitExecutable: string;
  readonly maxArchiveBytes: number;
  readonly maxTimeoutMs: number;
  readonly pollMs: number;
}

function canonicalDirectory(value: string): string {
  const resolved = fs.realpathSync(path.resolve(value));
  if (!fs.statSync(resolved).isDirectory()) throw new Error('BUSTER_SUITE_REPOSITORY_INVALID');
  return resolved;
}

function within(candidate: string, roots: readonly string[]): boolean {
  return roots.some((root) => candidate === root || candidate.startsWith(`${root}${path.sep}`));
}

function validLimits(gitExecutable: string, archiveBytes: number, timeoutMs: number, pollMs: number): boolean {
  return [Boolean(gitExecutable), Number.isSafeInteger(archiveBytes), archiveBytes >= 1, archiveBytes <= 134_217_728,
    Number.isSafeInteger(timeoutMs), timeoutMs >= 1, timeoutMs <= 7_200_000,
    Number.isSafeInteger(pollMs), pollMs >= 100, pollMs <= 30_000].every(Boolean);
}

function parseConfig(raw: Readonly<Record<string, unknown>>): ClientConfig {
  exact(raw as Record<string, unknown>, [
    'endpoint', 'tokenSecret', 'allowedRepositoryRoots', 'allowedSuites',
    'suiteCapabilities', 'gitExecutable', 'maxArchiveBytes', 'maxSuiteTimeoutMs', 'pollMs',
  ], 'BUSTER_SUITE_CONFIG_UNKNOWN_FIELD');
  const endpoint = typeof raw.endpoint === 'string' ? new URL(raw.endpoint) : null;
  if (!endpoint || !['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password) {
    throw new Error('BUSTER_SUITE_CONFIG_INVALID:endpoint');
  }
  if (typeof raw.tokenSecret !== 'string' || !/^[a-z0-9._:-]+$/u.test(raw.tokenSecret)) {
    throw new Error('BUSTER_SUITE_CONFIG_INVALID:tokenSecret');
  }
  const allowedRoots = stringList(raw.allowedRepositoryRoots, 'allowedRepositoryRoots').map(canonicalDirectory);
  const allowedSuites = new Set(stringList(raw.allowedSuites, 'allowedSuites'));
  if ([...allowedSuites].some((suite) => !SUPPORTED_SUITES.includes(suite as typeof SUPPORTED_SUITES[number]))) {
    throw new Error('BUSTER_SUITE_CONFIG_INVALID:allowedSuites');
  }
  const capabilities = stringList(raw.suiteCapabilities, 'suiteCapabilities');
  const gitExecutable = typeof raw.gitExecutable === 'string' && path.isAbsolute(raw.gitExecutable)
    ? fs.realpathSync(raw.gitExecutable)
    : '';
  const maxArchiveBytes = Number(raw.maxArchiveBytes);
  const maxTimeoutMs = Number(raw.maxSuiteTimeoutMs);
  const pollMs = Number(raw.pollMs);
  if (!validLimits(gitExecutable, maxArchiveBytes, maxTimeoutMs, pollMs)) throw new Error('BUSTER_SUITE_CONFIG_INVALID:limits');
  return Object.freeze({
    endpoint: endpoint.href.replace(/\/+$/u, ''),
    tokenSecret: raw.tokenSecret,
    allowedRoots,
    allowedSuites,
    capabilities,
    gitExecutable,
    maxArchiveBytes,
    maxTimeoutMs,
    pollMs,
  });
}

function responseBody(response: Readonly<Record<string, unknown>>): Record<string, unknown> {
  if (!isRecord(response.body)) throw new Error('BUSTER_WORKER_RESPONSE_INVALID');
  return response.body;
}

async function archive(config: ClientConfig, repositoryRoot: string): Promise<Buffer> {
  const { stdout } = await exec(config.gitExecutable, ['archive', '--format=tar.gz', 'HEAD'], {
    cwd: repositoryRoot,
    encoding: 'buffer',
    maxBuffer: config.maxArchiveBytes + 1,
  });
  const bytes = Buffer.from(stdout);
  if (bytes.byteLength < 1 || bytes.byteLength > config.maxArchiveBytes) {
    throw new Error('BUSTER_SUITE_ARCHIVE_SIZE_EXCEEDED');
  }
  return bytes;
}

async function secret(context: AdapterActivationContext, name: string): Promise<string> {
  const response = await context.invokeConfidential('secrets.read', {
    operation: 'resolve',
    resource: { type: 'secret.name', canonicalId: name },
    payload: {},
  });
  if (typeof response.value !== 'string' || response.value.length < 32) {
    throw new Error('BUSTER_WORKER_TOKEN_UNAVAILABLE');
  }
  return response.value;
}

function resultReceipt(status: Record<string, unknown>, jobId: string): Readonly<Record<string, unknown>> {
  const result = parseResult(status.result, jobId);
  return Object.freeze({
    receipt: Object.freeze({ schemaVersion: 'test-suite-receipt.v1', provider: 'buster-suite-v2', jobId: result.jobId, completedAt: result.completedAt, resultDigest: sha256(JSON.stringify(result)) }),
    results: result.results, suiteSummary: result.suiteSummary,
    suiteDetailSummary: result.suiteDetailSummary, criticalFailed: result.criticalFailed,
  });
}

async function waitForResult(context: AdapterActivationContext, config: ClientConfig, jobId: string, headers: Readonly<Record<string, string>>, timeoutMs: number, signal: AbortSignal): Promise<Readonly<Record<string, unknown>>> {
  const deadline = Date.now() + timeoutMs + 60_000;
  while (Date.now() < deadline) {
    if (signal.aborted) throw new Error('ADAPTER_CANCELLED');
    const status = responseBody(await context.invokeConfidential('network.http', { operation: 'request', resource: { type: 'network.url', canonicalId: `${config.endpoint}/v2/jobs/${jobId}` }, payload: { method: 'GET', headers } }));
    if (status.schemaVersion !== STATUS_SCHEMA || status.jobId !== jobId) throw new Error('BUSTER_WORKER_STATUS_INVALID');
    if (status.state === 'completed') return resultReceipt(status, jobId);
    if (status.state === 'failed' || status.state === 'cancelled') throw new Error(`BUSTER_WORKER_${String(status.state).toUpperCase()}:${String(status.error ?? '')}`);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, config.pollMs);
      signal.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('ADAPTER_CANCELLED')); }, { once: true });
    });
  }
  throw new Error('BUSTER_WORKER_TIMEOUT');
}

function suiteRequest(config: ClientConfig, invocation: AdapterInvocation): Readonly<{ repositoryRoot: string; suites: readonly string[]; timeoutMs: number }> {
  const { request } = invocation;
  if (request.capability !== 'test.suite.execute' || request.operation !== 'run' || request.resource.type !== 'test.suite-plan') throw new Error('BUSTER_SUITE_OPERATION_UNSUPPORTED');
  const repositoryRoot = typeof request.payload.repositoryRoot === 'string' ? canonicalDirectory(request.payload.repositoryRoot) : '';
  if (!repositoryRoot || !within(repositoryRoot, config.allowedRoots)) throw new Error('BUSTER_SUITE_REPOSITORY_DENIED');
  const suites = stringList(request.payload.suites, 'suites');
  if (suites.some((suite) => !config.allowedSuites.has(suite))) throw new Error('BUSTER_SUITE_DENIED');
  if (!isRecord(request.payload.testConfig) || !isRecord(request.payload.task)) throw new Error('BUSTER_SUITE_PAYLOAD_INVALID');
  const timeoutMs = Number(request.payload.testConfig.suite_timeout_ms);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > config.maxTimeoutMs) throw new Error('BUSTER_SUITE_TIMEOUT_DENIED');
  return { repositoryRoot, suites, timeoutMs };
}

async function executeSuite(context: AdapterActivationContext, config: ClientConfig, invocation: AdapterInvocation): Promise<Readonly<Record<string, unknown>>> {
  const { request, signal } = invocation;
  const input = suiteRequest(config, invocation);
  const token = await secret(context, config.tokenSecret);
  const snapshot = await archive(config, input.repositoryRoot);
  const capabilities = requiredCapabilitiesForSuites(input.suites);
  if (capabilities.some((capability) => !config.capabilities.includes(capability))) throw new Error('BUSTER_SUITE_CAPABILITY_DENIED');
  const jobId = `job:${crypto.createHash('sha256').update(request.idempotencyKey).digest('hex').slice(0, 32)}`;
  const job = { schemaVersion: JOB_SCHEMA, jobId, idempotencyKey: request.idempotencyKey,
    archive: { encoding: 'base64', sha256: sha256(snapshot), bytes: snapshot.byteLength, data: snapshot.toString('base64') },
    suites: input.suites, testConfig: relocateRepositoryValues(request.payload.testConfig, input.repositoryRoot),
    task: relocateRepositoryValues(request.payload.task, input.repositoryRoot),
    ...(typeof request.payload.moduleId === 'string' ? { moduleId: request.payload.moduleId } : {}),
    ...(Number.isSafeInteger(request.payload.attempt) ? { attempt: Number(request.payload.attempt) } : {}), capabilities, timeoutMs: input.timeoutMs };
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  await context.invokeConfidential('network.http', { operation: 'request', resource: { type: 'network.url', canonicalId: `${config.endpoint}/v2/jobs` }, payload: { method: 'POST', headers, body: job } });
  try { return await waitForResult(context, config, jobId, headers, input.timeoutMs, signal); }
  catch (error) {
    await context.invokeConfidential('network.http', { operation: 'request', resource: { type: 'network.url', canonicalId: `${config.endpoint}/v2/jobs/${jobId}` }, payload: { method: 'DELETE', headers } }).catch(() => undefined);
    throw error;
  }
}

export function activate(context: AdapterActivationContext): AdapterInstance {
  const config = parseConfig(context.config);
  let stopping = false;
  return {
    async ready() {
      if (stopping) throw new Error('ADAPTER_SHUTTING_DOWN');
      config.allowedRoots.forEach(canonicalDirectory);
    },
    async invoke(invocation) {
      const { signal, confidential, fence } = invocation;
      if (!confidential) fence.assertCurrent();
      if (stopping) throw new Error('ADAPTER_SHUTTING_DOWN');
      if (signal.aborted) throw new Error('ADAPTER_CANCELLED');
      return executeSuite(context, config, invocation);
    },
    async shutdown() {
      stopping = true;
    },
  };
}
