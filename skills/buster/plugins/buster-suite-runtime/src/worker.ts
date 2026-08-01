import crypto from 'node:crypto';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  JOB_SCHEMA,
  STATUS_SCHEMA,
  isRecord,
  parseJob,
  parseResult,
  sha256,
  type BusterSuiteResult,
  type BusterSuiteJob,
  type JobState,
} from './protocol.js';

interface Status {
  readonly schemaVersion: typeof STATUS_SCHEMA;
  readonly jobId: string;
  readonly state: JobState;
  readonly requestDigest: string;
  readonly updatedAt: string;
  readonly error?: string;
  readonly result?: BusterSuiteResult;
}

const port = Number(process.env.BUSTER_V2_PORT ?? 18891);
const stateRoot = path.resolve(process.env.BUSTER_V2_STATE_DIR ?? '/home/builder/.openclaw/v2-jobs');
const runRoot = path.resolve(process.env.BUSTER_V2_RUN_DIR ?? '/tmp/buster-v2-runs');
const token = fs.readFileSync(0, 'utf8').trim();
const maxArchiveBytes = Number(process.env.BUSTER_V2_MAX_ARCHIVE_BYTES ?? 67_108_864);
const maxExtractedBytes = Number(process.env.BUSTER_V2_MAX_EXTRACTED_BYTES ?? 536_870_912);
const maxRequestBytes = Math.ceil(maxArchiveBytes * 1.4) + 1_048_576;
const runner = fileURLToPath(new URL('./worker-runner.js', import.meta.url));
const resultRoot = path.resolve(
  process.env.BUSTER_V2_RESULT_ROOT ?? '/workspace/git-repo/.swarm/runtime-results',
);
const running = new Map<string, ChildProcess>();
const queued = new Map<string, { readonly job: BusterSuiteJob; readonly requestDigest: string }>();
const terminationTimers = new Map<string, NodeJS.Timeout>();
const maxQueuedJobs = Number(process.env.BUSTER_V2_MAX_QUEUED_JOBS ?? 8);
const runnerUid = Number(process.env.BUSTER_V2_RUNNER_UID ?? 1001);
const runnerGid = Number(process.env.BUSTER_V2_RUNNER_GID ?? 1001);
const buildkitGid = Number(process.env.BUSTER_V2_BUILDKIT_GID ?? 1002);
const testMode = process.env.BUSTER_V2_TEST_MODE === '1';
const kubernetesCredentials = path.resolve(
  process.env.BUSTER_V2_KUBERNETES_CREDENTIALS ?? '/var/run/buster-worker/kubernetes',
);

if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) throw new Error('BUSTER_WORKER_PORT_INVALID');
if (token.length < 32) throw new Error('BUSTER_WORKER_TOKEN_INVALID');
if (!Number.isSafeInteger(maxArchiveBytes) || maxArchiveBytes < 1 || maxArchiveBytes > 134_217_728) {
  throw new Error('BUSTER_WORKER_ARCHIVE_LIMIT_INVALID');
}
if (
  !Number.isSafeInteger(maxExtractedBytes) || maxExtractedBytes < maxArchiveBytes
  || maxExtractedBytes > 2_147_483_648
) throw new Error('BUSTER_WORKER_EXTRACTED_LIMIT_INVALID');
if (
  !Number.isSafeInteger(runnerUid) || runnerUid < (testMode ? 0 : 1)
  || !Number.isSafeInteger(runnerGid) || runnerGid < (testMode ? 0 : 1)
  || !Number.isSafeInteger(buildkitGid) || buildkitGid < (testMode ? 0 : 1)
) throw new Error('BUSTER_WORKER_RUNNER_IDENTITY_INVALID');
if (!Number.isSafeInteger(maxQueuedJobs) || maxQueuedJobs < 1 || maxQueuedJobs > 64) {
  throw new Error('BUSTER_WORKER_QUEUE_LIMIT_INVALID');
}

fs.mkdirSync(stateRoot, { recursive: true, mode: 0o700 });
fs.chmodSync(stateRoot, 0o700);
fs.rmSync(runRoot, { recursive: true, force: true });
fs.mkdirSync(runRoot, { recursive: true, mode: 0o711 });
fs.mkdirSync(resultRoot, { recursive: true, mode: 0o700 });
const canonicalResultRoot = fs.realpathSync(resultRoot);

function jobDirectory(jobId: string): string {
  return path.join(stateRoot, jobId.replace(/[^a-z0-9._-]/gu, '_'));
}

function runDirectory(jobId: string): string {
  return path.join(runRoot, jobId.replace(/[^a-z0-9._-]/gu, '_'));
}

function removeRunDirectory(jobId: string): void {
  fs.rmSync(runDirectory(jobId), { recursive: true, force: true });
}

function atomicJson(file: string, value: unknown): void {
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, file);
}

function statusFile(jobId: string): string {
  return path.join(jobDirectory(jobId), 'status.json');
}

function readStatus(jobId: string): Status | undefined {
  const file = statusFile(jobId);
  if (!fs.existsSync(file)) return undefined;
  const value = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
  if (!isRecord(value) || value.schemaVersion !== STATUS_SCHEMA || value.jobId !== jobId) {
    throw new Error('BUSTER_WORKER_STATUS_CORRUPT');
  }
  return value as unknown as Status;
}

function writeStatus(jobId: string, status: Omit<Status, 'schemaVersion' | 'jobId' | 'updatedAt'>): Status {
  const value: Status = {
    schemaVersion: STATUS_SCHEMA,
    jobId,
    ...status,
    updatedAt: new Date().toISOString(),
  };
  atomicJson(statusFile(jobId), value);
  return value;
}

function authorized(request: http.IncomingMessage): boolean {
  const header = request.headers.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return false;
  const supplied = Buffer.from(header.slice(7));
  const expected = Buffer.from(token);
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

function builderReady(): boolean {
  try {
    execFileSync('buildctl', ['--addr', process.env.BUILDKIT_HOST ?? '', 'debug', 'workers'], {
      stdio: 'ignore',
      timeout: 3_000,
    });
    return true;
  } catch {
    return false;
  }
}

function send(response: http.ServerResponse, status: number, body: unknown): void {
  const encoded = Buffer.from(JSON.stringify(body));
  response.writeHead(status, {
    'content-type': 'application/json',
    'content-length': encoded.byteLength,
    'cache-control': 'no-store',
  });
  response.end(encoded);
}

const RUNNER_ENV_KEYS = Object.freeze([
  'AGENT_NAME',
  'BROWSER',
  'BUILDKIT_HOST',
  'BUSTER_BUILD_OUTPUT_DIR',
  'BUSTER_CAPABILITIES',
  'BUSTER_LEASE_API_GROUP',
  'BUSTER_LEASE_API_VERSION',
  'BUSTER_RESULTS_DIR',
  'HOME',
  'HTTPS_PROXY',
  'HTTP_PROXY',
  'KUBECONFIG',
  'KUBERNETES_SERVICE_HOST',
  'KUBERNETES_SERVICE_PORT',
  'KUBECLAW_LOCAL_REGISTRY',
  'KUBECLAW_NAMESPACE',
  'LANG',
  'LC_ALL',
  'NODE_EXTRA_CA_CERTS',
  'NODE_PATH',
  'NO_PROXY',
  'PATH',
  'PLAYWRIGHT_BROWSERS_PATH',
  'REPO_ROOT',
  'SSL_CERT_DIR',
  'SSL_CERT_FILE',
  'SWARM_CONFIG',
  'TMPDIR',
  'XDG_RUNTIME_DIR',
] as const);

function runnerEnvironment(job: BusterSuiteJob, directory: string, jobGid: number): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const key of RUNNER_ENV_KEYS) {
    if (
      (key === 'BUILDKIT_HOST' && !job.capabilities.includes('image_build'))
      || (
        (key === 'KUBECONFIG' || key === 'KUBERNETES_SERVICE_HOST' || key === 'KUBERNETES_SERVICE_PORT')
        && !job.capabilities.includes('kubernetes')
      )
      || key === 'BUSTER_RESULTS_DIR'
      || key === 'REPO_ROOT'
      || key === 'SWARM_CONFIG'
    ) continue;
    const value = process.env[key];
    if (value !== undefined) environment[key] = value;
  }
  environment.HOME = path.join(directory, 'home');
  environment.TMPDIR = path.join(directory, 'tmp');
  if (job.capabilities.includes('kubernetes')) {
    environment.KUBECONFIG = materializeKubeconfig(directory, jobGid);
  }
  environment.BUSTER_CAPABILITIES = job.capabilities.join(',');
  return environment;
}

function sharedDirectory(directory: string, gid: number): void {
  fs.mkdirSync(directory, { recursive: true, mode: 0o770 });
  if (!testMode) fs.chownSync(directory, process.getuid?.() ?? 1000, gid);
  fs.chmodSync(directory, 0o770);
}

function sharedFile(file: string, content: string | Buffer, gid: number): void {
  fs.writeFileSync(file, content, { mode: 0o440 });
  if (!testMode) fs.chownSync(file, process.getuid?.() ?? 1000, gid);
}

function materializeKubeconfig(directory: string, gid: number): string {
  const tokenFile = path.join(kubernetesCredentials, 'token');
  const caFile = path.join(kubernetesCredentials, 'ca.crt');
  if (!fs.existsSync(tokenFile) || !fs.existsSync(caFile)) {
    throw new Error('BUSTER_WORKER_KUBERNETES_CREDENTIALS_UNAVAILABLE');
  }
  const credentials = path.join(directory, 'kubernetes');
  sharedDirectory(credentials, gid);
  const localCa = path.join(credentials, 'ca.crt');
  sharedFile(localCa, fs.readFileSync(caFile), gid);
  const host = process.env.KUBERNETES_SERVICE_HOST;
  const servicePort = process.env.KUBERNETES_SERVICE_PORT ?? '443';
  if (!host) throw new Error('BUSTER_WORKER_KUBERNETES_ENDPOINT_UNAVAILABLE');
  const kubeconfig = path.join(credentials, 'config');
  sharedFile(kubeconfig, `${JSON.stringify({
    apiVersion: 'v1',
    kind: 'Config',
    clusters: [{
      name: 'in-cluster',
      cluster: { server: `https://${host}:${servicePort}`, 'certificate-authority': localCa },
    }],
    contexts: [{ name: 'in-cluster', context: { cluster: 'in-cluster', user: 'buster-suite' } }],
    'current-context': 'in-cluster',
    users: [{ name: 'buster-suite', user: { token: fs.readFileSync(tokenFile, 'utf8').trim() } }],
  })}\n`, gid);
  return kubeconfig;
}

async function body(request: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.from(chunk);
    size += bytes.byteLength;
    if (size > maxRequestBytes) throw new Error('BUSTER_WORKER_REQUEST_TOO_LARGE');
    chunks.push(bytes);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function start(job: BusterSuiteJob, requestDigest: string): void {
  if (readStatus(job.jobId)?.state !== 'accepted') return;
  const directory = runDirectory(job.jobId);
  const repository = path.join(directory, 'repository');
  const archiveFile = path.join(directory, 'repository.tar.gz');
  const jobGid = job.capabilities.includes('image_build') ? buildkitGid : runnerGid;
  fs.mkdirSync(directory, { recursive: false, mode: 0o770 });
  if (!testMode) fs.chownSync(directory, process.getuid?.() ?? 1000, jobGid);
  fs.chmodSync(directory, 0o770);
  sharedDirectory(repository, jobGid);
  sharedDirectory(path.join(directory, 'home'), jobGid);
  sharedDirectory(path.join(directory, 'tmp'), jobGid);
  atomicJson(path.join(directory, 'job.json'), job);
  fs.chmodSync(path.join(directory, 'job.json'), 0o440);
  if (!testMode) {
    fs.chownSync(path.join(directory, 'job.json'), process.getuid?.() ?? 1000, jobGid);
  }
  fs.writeFileSync(archiveFile, Buffer.from(job.archive.data, 'base64'), { mode: 0o600 });
  const entries = execFileSync('tar', ['-tzf', archiveFile], { encoding: 'utf8', timeout: 120_000 })
    .split('\n')
    .filter(Boolean);
  if (
    entries.length > 200_000
    || entries.some((entry) => entry.startsWith('/') || entry.split('/').includes('..'))
  ) throw new Error('BUSTER_JOB_ARCHIVE_PATH_INVALID');
  const listing = execFileSync('tar', [
    '--numeric-owner', '-tvzf', archiveFile,
  ], { encoding: 'utf8', timeout: 120_000 });
  const listingLines = listing.split('\n').filter(Boolean);
  if (listingLines.some((entry) => /^[lh]/u.test(entry))) {
    throw new Error('BUSTER_JOB_ARCHIVE_LINK_DENIED');
  }
  const extractedBytes = listingLines.reduce((total, entry) => {
    const size = Number(entry.trim().split(/\s+/u)[2]);
    if (!Number.isSafeInteger(size) || size < 0 || size > maxExtractedBytes) {
      throw new Error('BUSTER_JOB_ARCHIVE_SIZE_INVALID');
    }
    const next = total + size;
    if (!Number.isSafeInteger(next) || next > maxExtractedBytes) {
      throw new Error('BUSTER_JOB_ARCHIVE_EXPANDED_SIZE_EXCEEDED');
    }
    return next;
  }, 0);
  if (extractedBytes > maxExtractedBytes) throw new Error('BUSTER_JOB_ARCHIVE_EXPANDED_SIZE_EXCEEDED');
  execFileSync('tar', [
    '--no-same-owner', '--no-same-permissions', '-xzf', archiveFile, '-C', repository,
  ], { timeout: 120_000 });
  if (!testMode) {
    execFileSync('chown', ['-R', `${process.getuid?.() ?? 1000}:${jobGid}`, repository], {
      timeout: 120_000,
    });
  }
  execFileSync('chmod', ['-R', 'g+rwX,o-rwx', repository], { timeout: 120_000 });
  fs.rmSync(archiveFile, { force: true });
  writeStatus(job.jobId, { state: 'running', requestDigest });
  const isolatedRunnerArgs = [
    process.execPath,
    runner,
    path.join(directory, 'job.json'),
    repository,
  ];
  const child = spawn(testMode ? isolatedRunnerArgs[0] : '/usr/bin/setpriv', testMode
    ? isolatedRunnerArgs.slice(1)
    : [
        `--reuid=${runnerUid}`,
        `--regid=${jobGid}`,
        '--clear-groups',
        '--bounding-set=-all',
        '--inh-caps=-all',
        '--ambient-caps=-all',
        '/usr/bin/unshare',
        '--user',
        '--map-current-user',
        '--pid',
        '--fork',
        '--kill-child=SIGKILL',
        '--mount-proc',
        ...isolatedRunnerArgs,
      ], {
    cwd: repository,
    // The worker authentication credential is never inherited by suite code.
    // Kubernetes and BuildKit access remain explicit job capabilities backed by
    // this Buster pod's already-bounded runtime identities.
    env: runnerEnvironment(job, directory, jobGid),
    stdio: ['ignore', 'ignore', 'pipe', 'pipe'],
    detached: true,
  });
  running.set(job.jobId, child);
  const stderr: Buffer[] = [];
  const resultChunks: Buffer[] = [];
  let stderrBytes = 0;
  let resultBytes = 0;
  child.stderr?.on('data', (chunk: Buffer) => {
    if (stderrBytes >= 65_536) return;
    const bytes = Buffer.from(chunk).subarray(0, 65_536 - stderrBytes);
    stderr.push(bytes);
    stderrBytes += bytes.byteLength;
  });
  child.stdio[3]?.on('data', (chunk: Buffer) => {
    if (resultBytes > 16_777_216) return;
    const bytes = Buffer.from(chunk);
    resultBytes += bytes.byteLength;
    if (resultBytes > 16_777_216) {
      terminate(job.jobId, child);
      return;
    }
    resultChunks.push(bytes);
  });
  const timeout = setTimeout(() => terminate(job.jobId, child), job.timeoutMs);
  child.once('exit', (code, signal) => {
    clearTimeout(timeout);
    const terminationTimer = terminationTimers.get(job.jobId);
    if (terminationTimer) clearTimeout(terminationTimer);
    terminationTimers.delete(job.jobId);
    running.delete(job.jobId);
    const current = readStatus(job.jobId);
    if (current?.state === 'cancelled') {
      removeRunDirectory(job.jobId);
      pump();
      return;
    }
    if (code === 0 && resultBytes <= 16_777_216 && resultChunks.length > 0) {
      try {
        const result = parseResult(JSON.parse(Buffer.concat(resultChunks).toString('utf8')), job.jobId);
        writeStatus(job.jobId, { state: 'completed', requestDigest, result });
        removeRunDirectory(job.jobId);
        pump();
        return;
      } catch (error) {
        stderr.push(Buffer.from(error instanceof Error ? error.message : String(error)));
      }
    }
    const detail = Buffer.concat(stderr).toString('utf8').trim().slice(-4_096);
    writeStatus(job.jobId, {
      state: 'failed',
      requestDigest,
      error: detail || `runner exited with code ${String(code)} signal ${String(signal)}`,
    });
    removeRunDirectory(job.jobId);
    pump();
  });
}

function pump(): void {
  if (running.size > 0) return;
  const next = queued.entries().next().value as
    | [string, { readonly job: BusterSuiteJob; readonly requestDigest: string }]
    | undefined;
  if (!next) return;
  const [jobId, pending] = next;
  queued.delete(jobId);
  if (readStatus(jobId)?.state !== 'accepted') {
    setImmediate(pump);
    return;
  }
  try {
    start(pending.job, pending.requestDigest);
  } catch (error) {
    writeStatus(jobId, {
      state: 'failed',
      requestDigest: pending.requestDigest,
      error: error instanceof Error ? error.message : String(error),
    });
    removeRunDirectory(jobId);
    setImmediate(pump);
  }
}

function signalProcessGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    child.kill(signal);
  }
}

function terminate(jobId: string, child: ChildProcess): void {
  signalProcessGroup(child, 'SIGTERM');
  if (terminationTimers.has(jobId)) return;
  const timer = setTimeout(() => signalProcessGroup(child, 'SIGKILL'), 5_000);
  timer.unref();
  terminationTimers.set(jobId, timer);
}

function recoverInterruptedJobs(): void {
  for (const entry of fs.readdirSync(stateRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = path.join(stateRoot, entry.name, 'status.json');
    if (!fs.existsSync(file)) continue;
    const status = JSON.parse(fs.readFileSync(file, 'utf8')) as Status;
    if (status.state === 'accepted' || status.state === 'running') {
      writeStatus(status.jobId, {
        state: 'failed',
        requestDigest: status.requestDigest,
        error: 'worker restarted during execution',
      });
    }
  }
}

recoverInterruptedJobs();

const server = http.createServer(async (request, response) => {
  try {
    if (request.method === 'GET' && request.url === '/healthz') {
      const ready = builderReady();
      send(response, ready ? 200 : 503, {
        schemaVersion: 'buster-suite-worker-health.v2',
        ready,
        activeJobs: running.size,
      });
      return;
    }
    if (!authorized(request)) {
      send(response, 401, { error: 'unauthorized' });
      return;
    }
    const resultMatch = request.url?.match(/^\/v2\/runtime-results\/([a-f0-9-]{36}\.json)$/u);
    if (request.method === 'GET' && resultMatch) {
      const file = path.join(resultRoot, resultMatch[1]);
      if (!fs.existsSync(file) || !fs.lstatSync(file).isFile()) {
        send(response, 404, { error: 'not found' });
        return;
      }
      const canonical = fs.realpathSync(file);
      if (!canonical.startsWith(`${canonicalResultRoot}${path.sep}`)) {
        send(response, 403, { error: 'result path denied' });
        return;
      }
      const content = fs.readFileSync(file, 'utf8');
      if (Buffer.byteLength(content, 'utf8') > 1_048_576) {
        send(response, 413, { error: 'result too large' });
        return;
      }
      send(response, 200, {
        schemaVersion: 'runtime-agent-result-file.v2',
        content,
      });
      return;
    }
    if (request.method === 'POST' && request.url === '/v2/jobs') {
      const raw = await body(request);
      const job = parseJob(raw, maxArchiveBytes);
      const requestDigest = sha256(JSON.stringify(raw));
      const existing = readStatus(job.jobId);
      if (existing) {
        if (existing.requestDigest !== requestDigest) {
          send(response, 409, { error: 'job id conflict' });
          return;
        }
        send(response, 200, existing);
        return;
      }
      if (queued.size >= maxQueuedJobs) {
        send(response, 429, { error: 'worker queue full' });
        return;
      }
      const directory = jobDirectory(job.jobId);
      fs.mkdirSync(directory, { recursive: false, mode: 0o700 });
      const accepted = writeStatus(job.jobId, { state: 'accepted', requestDigest });
      queued.set(job.jobId, { job, requestDigest });
      setImmediate(pump);
      send(response, 202, accepted);
      return;
    }
    const match = request.url?.match(/^\/v2\/jobs\/([a-z0-9._:-]+)$/u);
    if (match && request.method === 'GET') {
      const status = readStatus(match[1]);
      send(response, status ? 200 : 404, status ?? { error: 'not found' });
      return;
    }
    if (match && request.method === 'DELETE') {
      const status = readStatus(match[1]);
      if (!status) {
        send(response, 404, { error: 'not found' });
        return;
      }
      if (status.state === 'completed' || status.state === 'failed' || status.state === 'cancelled') {
        send(response, 200, status);
        return;
      }
      const child = running.get(match[1]);
      if (child) terminate(match[1], child);
      queued.delete(match[1]);
      const cancelled = writeStatus(match[1], {
        state: 'cancelled',
        requestDigest: status.requestDigest,
        error: 'cancelled by caller',
      });
      send(response, 200, cancelled);
      return;
    }
    send(response, 404, { error: 'not found' });
  } catch (error) {
    send(response, 400, { error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(port, '0.0.0.0');

function shutdown(): void {
  server.close();
  for (const [jobId, child] of running) terminate(jobId, child);
  const timer = setTimeout(() => process.exit(1), 7_000);
  timer.unref();
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
