import crypto from 'node:crypto';
import { execFileSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import type http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STATUS_SCHEMA, isRecord, type BusterSuiteJob, type BusterSuiteResult, type JobState } from './protocol.ts';

export interface Status { readonly schemaVersion: typeof STATUS_SCHEMA; readonly jobId: string; readonly state: JobState; readonly requestDigest: string; readonly updatedAt: string; readonly error?: string; readonly result?: BusterSuiteResult; }
export function requiredEnvironment(name: string): string { const value = process.env[name]; if (!value) throw new Error(`BUSTER_WORKER_ENV_REQUIRED:${name}`); return value; }
export const port = Number(requiredEnvironment('BUSTER_V2_PORT'));
export const stateRoot = path.resolve(requiredEnvironment('BUSTER_V2_STATE_DIR'));
export const runRoot = path.resolve(requiredEnvironment('BUSTER_V2_RUN_DIR'));
export const token = fs.readFileSync(0, 'utf8').trim();
export const maxArchiveBytes = Number(requiredEnvironment('BUSTER_V2_MAX_ARCHIVE_BYTES'));
export const maxExtractedBytes = Number(requiredEnvironment('BUSTER_V2_MAX_EXTRACTED_BYTES'));
export const maxRequestBytes = Math.ceil(maxArchiveBytes * 1.4) + 1_048_576;
export const runner = fileURLToPath(new URL(`./worker-runner${path.extname(import.meta.filename)}`, import.meta.url));
export const resultRoot = path.resolve(requiredEnvironment('BUSTER_V2_RESULT_ROOT'));
export const running = new Map<string, ChildProcess>();
export const queued = new Map<string, { readonly job: BusterSuiteJob; readonly requestDigest: string }>();
export const terminationTimers = new Map<string, NodeJS.Timeout>();
export const maxQueuedJobs = Number(requiredEnvironment('BUSTER_V2_MAX_QUEUED_JOBS'));
export const runnerUid = Number(requiredEnvironment('BUSTER_V2_RUNNER_UID'));
export const runnerGid = Number(requiredEnvironment('BUSTER_V2_RUNNER_GID'));
export const buildkitGid = Number(requiredEnvironment('BUSTER_V2_BUILDKIT_GID'));
export const testMode = process.env.BUSTER_V2_TEST_MODE === '1';
export const kubernetesCredentials = path.resolve(requiredEnvironment('BUSTER_V2_KUBERNETES_CREDENTIALS'));

function validateConfiguration(): void {
  if (![Number.isSafeInteger(port), port >= 1, port <= 65_535].every(Boolean)) throw new Error('BUSTER_WORKER_PORT_INVALID');
  if (token.length < 32) throw new Error('BUSTER_WORKER_TOKEN_INVALID');
  if (![Number.isSafeInteger(maxArchiveBytes), maxArchiveBytes >= 1, maxArchiveBytes <= 134_217_728].every(Boolean)) throw new Error('BUSTER_WORKER_ARCHIVE_LIMIT_INVALID');
  if (![Number.isSafeInteger(maxExtractedBytes), maxExtractedBytes >= maxArchiveBytes, maxExtractedBytes <= 2_147_483_648].every(Boolean)) throw new Error('BUSTER_WORKER_EXTRACTED_LIMIT_INVALID');
  const minimum = testMode ? 0 : 1;
  if (![runnerUid, runnerGid, buildkitGid].every((value) => Number.isSafeInteger(value) && value >= minimum)) throw new Error('BUSTER_WORKER_RUNNER_IDENTITY_INVALID');
  if (![Number.isSafeInteger(maxQueuedJobs), maxQueuedJobs >= 1, maxQueuedJobs <= 64].every(Boolean)) throw new Error('BUSTER_WORKER_QUEUE_LIMIT_INVALID');
}
validateConfiguration();
fs.mkdirSync(stateRoot, { recursive: true, mode: 0o700 }); fs.chmodSync(stateRoot, 0o700);
fs.rmSync(runRoot, { recursive: true, force: true }); fs.mkdirSync(runRoot, { recursive: true, mode: 0o711 });
fs.mkdirSync(resultRoot, { recursive: true, mode: 0o700 });
export const canonicalResultRoot = fs.realpathSync(resultRoot);

export function jobDirectory(jobId: string): string { return path.join(stateRoot, jobId.replace(/[^a-z0-9._-]/gu, '_')); }
export function runDirectory(jobId: string): string { return path.join(runRoot, jobId.replace(/[^a-z0-9._-]/gu, '_')); }
export function removeRunDirectory(jobId: string): void { fs.rmSync(runDirectory(jobId), { recursive: true, force: true }); }
export function atomicJson(file: string, value: unknown): void { const temporary = `${file}.${process.pid}.tmp`; fs.writeFileSync(temporary, `${JSON.stringify(value)}\n`, { mode: 0o600 }); fs.renameSync(temporary, file); }
function statusFile(jobId: string): string { return path.join(jobDirectory(jobId), 'status.json'); }
export function readStatus(jobId: string): Status | undefined {
  const file = statusFile(jobId); if (!fs.existsSync(file)) return undefined;
  const value = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
  if (!isRecord(value) || value.schemaVersion !== STATUS_SCHEMA || value.jobId !== jobId) throw new Error('BUSTER_WORKER_STATUS_CORRUPT');
  return value as unknown as Status;
}
export function writeStatus(jobId: string, status: Omit<Status, 'schemaVersion' | 'jobId' | 'updatedAt'>): Status {
  const value: Status = { schemaVersion: STATUS_SCHEMA, jobId, ...status, updatedAt: new Date().toISOString() };
  atomicJson(statusFile(jobId), value); return value;
}
export function authorized(request: http.IncomingMessage): boolean {
  const header = request.headers.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return false;
  const supplied = Buffer.from(header.slice(7)); const expected = Buffer.from(token);
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}
export function builderReady(): boolean {
  try { execFileSync('buildctl', ['--addr', requiredEnvironment('BUILDKIT_HOST'), 'debug', 'workers'], { stdio: 'ignore', timeout: 3_000 }); return true; }
  catch { return false; }
}
export function send(response: http.ServerResponse, status: number, body: unknown): void {
  const encoded = Buffer.from(JSON.stringify(body));
  response.writeHead(status, { 'content-type': 'application/json', 'content-length': encoded.byteLength, 'cache-control': 'no-store' }); response.end(encoded);
}

const RUNNER_ENV_KEYS = Object.freeze(['AGENT_NAME','BROWSER','BUILDKIT_HOST','BUSTER_BUILD_OUTPUT_DIR','BUSTER_CAPABILITIES','BUSTER_LEASE_API_GROUP','BUSTER_LEASE_API_VERSION','BUSTER_V2_MAX_ARCHIVE_BYTES','BUSTER_RESULTS_DIR','HOME','HTTPS_PROXY','HTTP_PROXY','KUBECONFIG','KUBERNETES_SERVICE_HOST','KUBERNETES_SERVICE_PORT','KUBECLAW_LOCAL_REGISTRY','KUBECLAW_NAMESPACE','LANG','LC_ALL','NODE_EXTRA_CA_CERTS','NODE_PATH','NO_PROXY','PATH','PLAYWRIGHT_BROWSERS_PATH','REPO_ROOT','SSL_CERT_DIR','SSL_CERT_FILE','SWARM_CONFIG','TMPDIR','XDG_RUNTIME_DIR'] as const);
function sharedDirectory(directory: string, gid: number): void { fs.mkdirSync(directory, { recursive: true, mode: 0o770 }); if (!testMode) fs.chownSync(directory, process.getuid?.() ?? 1000, gid); fs.chmodSync(directory, 0o770); }
function sharedFile(file: string, content: string | Buffer, gid: number): void { fs.writeFileSync(file, content, { mode: 0o440 }); if (!testMode) fs.chownSync(file, process.getuid?.() ?? 1000, gid); }
function materializeKubeconfig(directory: string, gid: number): string {
  const tokenFile = path.join(kubernetesCredentials, 'token'); const caFile = path.join(kubernetesCredentials, 'ca.crt');
  if (!fs.existsSync(tokenFile) || !fs.existsSync(caFile)) throw new Error('BUSTER_WORKER_KUBERNETES_CREDENTIALS_UNAVAILABLE');
  const credentials = path.join(directory, 'kubernetes'); sharedDirectory(credentials, gid);
  const localCa = path.join(credentials, 'ca.crt'); sharedFile(localCa, fs.readFileSync(caFile), gid);
  const host = process.env.KUBERNETES_SERVICE_HOST; const servicePort = requiredEnvironment('KUBERNETES_SERVICE_PORT');
  if (!host) throw new Error('BUSTER_WORKER_KUBERNETES_ENDPOINT_UNAVAILABLE');
  const kubeconfig = path.join(credentials, 'config');
  sharedFile(kubeconfig, `${JSON.stringify({ apiVersion: 'v1', kind: 'Config', clusters: [{ name: 'in-cluster', cluster: { server: `https://${host}:${servicePort}`, 'certificate-authority': localCa } }], contexts: [{ name: 'in-cluster', context: { cluster: 'in-cluster', user: 'buster-suite' } }], 'current-context': 'in-cluster', users: [{ name: 'buster-suite', user: { token: fs.readFileSync(tokenFile, 'utf8').trim() } }] })}\n`, gid);
  return kubeconfig;
}
export function runnerEnvironment(job: BusterSuiteJob, directory: string, jobGid: number): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const key of RUNNER_ENV_KEYS) {
    const denied = (key === 'BUILDKIT_HOST' && !job.capabilities.includes('image_build'))
      || (['KUBECONFIG','KUBERNETES_SERVICE_HOST','KUBERNETES_SERVICE_PORT'].includes(key) && !job.capabilities.includes('kubernetes'))
      || ['BUSTER_RESULTS_DIR','REPO_ROOT','SWARM_CONFIG'].includes(key);
    if (denied) continue;
    const value = process.env[key]; if (value !== undefined) environment[key] = value;
  }
  environment.HOME = path.join(directory, 'home'); environment.TMPDIR = path.join(directory, 'tmp');
  if (job.capabilities.includes('kubernetes')) environment.KUBECONFIG = materializeKubeconfig(directory, jobGid);
  environment.BUSTER_CAPABILITIES = job.capabilities.join(','); return environment;
}
export function prepareSharedDirectory(directory: string, gid: number): void { sharedDirectory(directory, gid); }
