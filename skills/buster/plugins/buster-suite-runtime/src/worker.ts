import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { parseJob, parseResult, sha256, type BusterSuiteJob } from './protocol.ts';
import {
  atomicJson, authorized, builderReady, buildkitGid, canonicalResultRoot, jobDirectory,
  maxArchiveBytes, maxExtractedBytes, maxQueuedJobs, maxRequestBytes, port, prepareSharedDirectory,
  queued, readStatus, removeRunDirectory, resultRoot, runner, runnerEnvironment, runnerGid,
  runnerUid, running, runDirectory, send, stateRoot, terminationTimers, testMode, writeStatus,
} from './worker-context.ts';

async function body(request: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.from(chunk); size += bytes.byteLength;
    if (size > maxRequestBytes) throw new Error('BUSTER_WORKER_REQUEST_TOO_LARGE');
    chunks.push(bytes);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function archiveEntries(file: string): void {
  const entries = execFileSync('tar', ['-tzf', file], { encoding: 'utf8', timeout: 120_000 }).split('\n').filter(Boolean);
  if (entries.length > 200_000 || entries.some((entry) => entry.startsWith('/') || entry.split('/').includes('..'))) throw new Error('BUSTER_JOB_ARCHIVE_PATH_INVALID');
  const listing = execFileSync('tar', ['--numeric-owner', '-tvzf', file], { encoding: 'utf8', timeout: 120_000 }).split('\n').filter(Boolean);
  if (listing.some((entry) => /^[lh]/u.test(entry))) throw new Error('BUSTER_JOB_ARCHIVE_LINK_DENIED');
  listing.reduce((total, entry) => {
    const size = Number(entry.trim().split(/\s+/u)[2]);
    if (!Number.isSafeInteger(size) || size < 0 || size > maxExtractedBytes) throw new Error('BUSTER_JOB_ARCHIVE_SIZE_INVALID');
    const next = total + size;
    if (!Number.isSafeInteger(next) || next > maxExtractedBytes) throw new Error('BUSTER_JOB_ARCHIVE_EXPANDED_SIZE_EXCEEDED');
    return next;
  }, 0);
}

function prepareRun(job: BusterSuiteJob): Readonly<{ directory: string; repository: string; gid: number }> {
  const directory = runDirectory(job.jobId); const repository = path.join(directory, 'repository');
  const gid = job.capabilities.includes('image_build') ? buildkitGid : runnerGid;
  fs.mkdirSync(directory, { recursive: false, mode: 0o770 });
  if (!testMode) fs.chownSync(directory, process.getuid?.() ?? 1000, gid);
  fs.chmodSync(directory, 0o770);
  [repository, path.join(directory, 'home'), path.join(directory, 'tmp')].forEach((value) => prepareSharedDirectory(value, gid));
  const jobFile = path.join(directory, 'job.json'); atomicJson(jobFile, job); fs.chmodSync(jobFile, 0o440);
  if (!testMode) fs.chownSync(jobFile, process.getuid?.() ?? 1000, gid);
  const archive = path.join(directory, 'repository.tar.gz'); fs.writeFileSync(archive, Buffer.from(job.archive.data, 'base64'), { mode: 0o600 });
  archiveEntries(archive);
  execFileSync('tar', ['--no-same-owner', '--no-same-permissions', '-xzf', archive, '-C', repository], { timeout: 120_000 });
  if (!testMode) execFileSync('chown', ['-R', `${process.getuid?.() ?? 1000}:${gid}`, repository], { timeout: 120_000 });
  execFileSync('chmod', ['-R', 'g+rwX,o-rwx', repository], { timeout: 120_000 }); fs.rmSync(archive, { force: true });
  return { directory, repository, gid };
}

function spawnRunner(job: BusterSuiteJob, run: Readonly<{ directory: string; repository: string; gid: number }>): ChildProcess {
  const args = [process.execPath, runner, path.join(run.directory, 'job.json'), run.repository];
  return spawn(testMode ? process.execPath : '/usr/bin/setpriv', testMode ? args.slice(1) : [
    `--reuid=${runnerUid}`, `--regid=${run.gid}`, '--clear-groups', '/usr/bin/unshare', '--user',
    '--map-current-user', '--pid', '--fork', '--kill-child=SIGKILL', '--mount-proc', '/usr/bin/setpriv',
    '--no-new-privs', '--bounding-set=-all', '--inh-caps=-all', '--ambient-caps=-all', ...args,
  ], { cwd: run.repository, env: runnerEnvironment(job, run.directory, run.gid), stdio: ['ignore', 'ignore', 'pipe', 'pipe'], detached: true }) as ChildProcess;
}

interface Completion { readonly output: Buffer[]; readonly errors: Buffer[]; readonly outputBytes: number; readonly code: number | null; readonly signal: NodeJS.Signals | null; }
function completeJob(job: BusterSuiteJob, requestDigest: string, completion: Completion): void {
  const { output, errors, outputBytes, code, signal } = completion;
  const current = readStatus(job.jobId);
  if (current?.state === 'cancelled') { removeRunDirectory(job.jobId); pump(); return; }
  if (code === 0 && outputBytes <= 16_777_216 && output.length > 0) {
    try {
      const result = parseResult(JSON.parse(Buffer.concat(output).toString('utf8')), job.jobId);
      writeStatus(job.jobId, { state: 'completed', requestDigest, result }); removeRunDirectory(job.jobId); pump(); return;
    } catch (error) { errors.push(Buffer.from(error instanceof Error ? error.message : String(error))); }
  }
  const detail = Buffer.concat(errors).toString('utf8').trim().slice(-4_096);
  writeStatus(job.jobId, { state: 'failed', requestDigest, error: detail || `runner exited with code ${String(code)} signal ${String(signal)}` });
  removeRunDirectory(job.jobId); pump();
}

function monitor(job: BusterSuiteJob, requestDigest: string, child: ChildProcess): void {
  const errors: Buffer[] = []; const output: Buffer[] = []; let errorBytes = 0; let outputBytes = 0;
  child.stderr?.on('data', (chunk: Buffer) => { if (errorBytes < 65_536) { const bytes = Buffer.from(chunk).subarray(0, 65_536 - errorBytes); errors.push(bytes); errorBytes += bytes.byteLength; } });
  child.stdio[3]?.on('data', (chunk: Buffer) => { const bytes = Buffer.from(chunk); outputBytes += bytes.byteLength; if (outputBytes > 16_777_216) terminate(job.jobId, child); else output.push(bytes); });
  const timeout = setTimeout(() => terminate(job.jobId, child), job.timeoutMs);
  child.once('exit', (code, signal) => {
    clearTimeout(timeout); const timer = terminationTimers.get(job.jobId); if (timer) clearTimeout(timer);
    terminationTimers.delete(job.jobId); running.delete(job.jobId);
    completeJob(job, requestDigest, { output, errors, outputBytes, code, signal });
  });
}

function start(job: BusterSuiteJob, requestDigest: string): void {
  if (readStatus(job.jobId)?.state !== 'accepted') return;
  const run = prepareRun(job); writeStatus(job.jobId, { state: 'running', requestDigest });
  const child = spawnRunner(job, run); running.set(job.jobId, child); monitor(job, requestDigest, child);
}

function pump(): void {
  if (running.size > 0) return;
  const next = queued.entries().next().value as [string, { readonly job: BusterSuiteJob; readonly requestDigest: string }] | undefined;
  if (!next) return;
  const [jobId, pending] = next; queued.delete(jobId);
  if (readStatus(jobId)?.state !== 'accepted') { setImmediate(pump); return; }
  try { start(pending.job, pending.requestDigest); }
  catch (error) {
    writeStatus(jobId, { state: 'failed', requestDigest: pending.requestDigest, error: error instanceof Error ? error.message : String(error) });
    removeRunDirectory(jobId); setImmediate(pump);
  }
}

function signalProcessGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  if (!child.pid) return;
  try { process.kill(-child.pid, signal); } catch { child.kill(signal); }
}
function terminate(jobId: string, child: ChildProcess): void {
  signalProcessGroup(child, 'SIGTERM'); if (terminationTimers.has(jobId)) return;
  const timer = setTimeout(() => signalProcessGroup(child, 'SIGKILL'), 5_000); timer.unref(); terminationTimers.set(jobId, timer);
}
function recoverInterruptedJobs(): void {
  for (const entry of fs.readdirSync(stateRoot, { withFileTypes: true })) {
    const file = path.join(stateRoot, entry.name, 'status.json');
    if (!entry.isDirectory() || !fs.existsSync(file)) continue;
    const status = JSON.parse(fs.readFileSync(file, 'utf8')) as { state?: string; jobId: string; requestDigest: string };
    if (status.state === 'accepted' || status.state === 'running') writeStatus(status.jobId, { state: 'failed', requestDigest: status.requestDigest, error: 'worker restarted during execution' });
  }
}

function runtimeResult(request: http.IncomingMessage, response: http.ServerResponse): boolean {
  const match = request.url?.match(/^\/v2\/runtime-results\/([a-f0-9-]{36}\.json)$/u);
  if (request.method !== 'GET' || !match) return false;
  const name = match[1]; if (!name) throw new Error('BUSTER_RUNTIME_RESULT_PATH_INVALID');
  const file = path.join(resultRoot, name);
  if (!fs.existsSync(file) || !fs.lstatSync(file).isFile()) { send(response, 404, { error: 'not found' }); return true; }
  if (!fs.realpathSync(file).startsWith(`${canonicalResultRoot}${path.sep}`)) { send(response, 403, { error: 'result path denied' }); return true; }
  const content = fs.readFileSync(file, 'utf8');
  if (Buffer.byteLength(content, 'utf8') > 1_048_576) { send(response, 413, { error: 'result too large' }); return true; }
  send(response, 200, { schemaVersion: 'runtime-agent-result-file.v2', content }); return true;
}

async function createJob(request: http.IncomingMessage, response: http.ServerResponse): Promise<boolean> {
  if (request.method !== 'POST' || request.url !== '/v2/jobs') return false;
  const raw = await body(request); const job = parseJob(raw, maxArchiveBytes); const requestDigest = sha256(JSON.stringify(raw));
  const existing = readStatus(job.jobId);
  if (existing) { send(response, existing.requestDigest === requestDigest ? 200 : 409, existing.requestDigest === requestDigest ? existing : { error: 'job id conflict' }); return true; }
  if (queued.size >= maxQueuedJobs) { send(response, 429, { error: 'worker queue full' }); return true; }
  fs.mkdirSync(jobDirectory(job.jobId), { recursive: false, mode: 0o700 });
  const accepted = writeStatus(job.jobId, { state: 'accepted', requestDigest }); queued.set(job.jobId, { job, requestDigest }); setImmediate(pump); send(response, 202, accepted); return true;
}

function existingJob(request: http.IncomingMessage, response: http.ServerResponse): boolean {
  const match = request.url?.match(/^\/v2\/jobs\/([a-z0-9._:-]+)$/u); if (!match) return false;
  const jobId = match[1]; if (!jobId) throw new Error('BUSTER_JOB_ID_INVALID'); const status = readStatus(jobId);
  if (request.method === 'GET') { send(response, status ? 200 : 404, status ?? { error: 'not found' }); return true; }
  if (request.method !== 'DELETE') return false;
  if (!status) { send(response, 404, { error: 'not found' }); return true; }
  if (['completed', 'failed', 'cancelled'].includes(status.state)) { send(response, 200, status); return true; }
  const child = running.get(jobId); if (child) terminate(jobId, child); queued.delete(jobId);
  send(response, 200, writeStatus(jobId, { state: 'cancelled', requestDigest: status.requestDigest, error: 'cancelled by caller' })); return true;
}

async function handle(request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
  if (request.method === 'GET' && request.url === '/healthz') { const ready = builderReady(); send(response, ready ? 200 : 503, { schemaVersion: 'buster-suite-worker-health.v2', ready, activeJobs: running.size }); return; }
  if (!authorized(request)) { send(response, 401, { error: 'unauthorized' }); return; }
  if (runtimeResult(request, response) || await createJob(request, response) || existingJob(request, response)) return;
  send(response, 404, { error: 'not found' });
}

recoverInterruptedJobs();
const server = http.createServer((request, response) => { void handle(request, response).catch((error) => send(response, 400, { error: error instanceof Error ? error.message : String(error) })); });
server.listen(port, '0.0.0.0');
function shutdown(): void { server.close(); for (const [jobId, child] of running) terminate(jobId, child); const timer = setTimeout(() => process.exit(1), 7_000); timer.unref(); }
process.once('SIGTERM', shutdown); process.once('SIGINT', shutdown);
