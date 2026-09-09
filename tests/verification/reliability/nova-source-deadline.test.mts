import assert from 'node:assert/strict';
import { test } from 'node:test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { plan } from '../../fixtures/test-gate/remote-plan.mts';
import { createProductionNovaTestGate } from '../../../skills/nova/core/test-gates/production.ts';
import { buildCommittedSourceSnapshot } from '../../../skills/nova/core/test-gates/source-snapshot.ts';
import { FileNovaRemotePlanStore, createRemotePlanJob } from '../../../skills/nova/core/test-gates/remote-dispatch.ts';
import { GateDeadline, NovaGateTimeoutError } from '../../../skills/nova/core/test-gates/deadline.ts';
const limits = { maximumRecords: 100, maximumBytes: 10_000_000, maximumRecordBytes: 1_000_000 };
const key = crypto.generateKeyPairSync('ed25519').privateKey.export({ format: 'pem', type: 'pkcs8' });
function repository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-source-deadline-'));
  const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args]);
  git('init', '-q'); fs.writeFileSync(path.join(root, 'README'), 'source\n'); git('add', '.');
  git('-c', 'user.name=Regression', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'source');
  return { root, git };
}
const sourceOptions = (root: string) => ({ repositoryRoot: root, repositoryId: 'repository:deadline',
  pipelineStageId: 'test', creatorAuthority: 'nova:deadline', attestationPrivateKey: key, maximumArchiveBytes: 100_000 });

test('production deadline cancels actual Git archive compressor before any HTTP submission', async () => {
  const { root, git } = repository(); let requests = 0;
  const server = http.createServer((_request, response) => { requests++; response.end(); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    // Git's supported archive compressor hook launches a real process; no replacement Git or transport.
    const pidFile = path.join(root, 'compressor-pid');
    const code = `import os,time;open(${JSON.stringify(pidFile)},"w").write(str(os.getpid()));time.sleep(30)`;
    git('config', 'tar.tar.gz.command', `/usr/bin/python3 -c '${code}'`);
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    const gate = createProductionNovaTestGate({ stateRoot: path.join(root, 'state'), endpoint: `http://127.0.0.1:${address.port}`,
      token: 'x'.repeat(32), sourceAuthority: 'nova:deadline', sourceAttestationPrivateKey: key,
      pollMilliseconds: 10, maximumResponseBytes: 100_000, maximumResultBytes: 100_000, maximumArchiveBytes: 100_000,
      maximumArchiveStoreBytes: 1_000_000, maximumEvidenceBytes: 100_000, maximumEvidenceStoreBytes: 1_000_000, recordLimits: limits });
    const start = Date.now();
    await assert.rejects(gate.execute({ idempotencyKey: 'deadline:source', pipelineStageId: 'test', plan: plan('blocking', null),
      repositoryRoot: root, repositoryId: 'repository:deadline', grants: new Map([['test', []]]), maximumConcurrency: 1,
      submittedAt: '2026-08-10T03:00:00.000Z', timeoutMs: 500 }), /NOVA_REMOTE_PLAN_TIMEOUT/u);
    assert.ok(Date.now() - start < 2000); assert.equal(requests, 0); assert.ok(fs.existsSync(pidFile));
    const pid = Number(fs.readFileSync(pidFile, 'utf8'));
    const statFile = `/proc/${pid}/stat`;
    assert.ok(!fs.existsSync(statFile) || fs.readFileSync(statFile, 'utf8').split(') ')[1]!.startsWith('Z '), 'compressor must not remain live');
    git('config', '--unset', 'tar.tar.gz.command');
    assert.ok((await buildCommittedSourceSnapshot(sourceOptions(root))).repositoryArchive.length > 0);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); fs.rmSync(root, { recursive: true, force: true }); }
});

test('durable write already waiting for a real kernel lock is drained before timeout returns', async () => {
  const { root } = repository();
  const state = path.join(root, 'dispatch'); fs.mkdirSync(path.join(state, 'records'), { recursive: true });
  const holder = spawn('/usr/bin/flock', [path.join(state, 'records', '.write-lock'), '/bin/sh', '-c', "printf 'held\\n'; exec /bin/cat >/dev/null"], { stdio: ['pipe', 'pipe', 'pipe'] });
  await once(holder.stdout, 'data'); const exited = once(holder, 'exit');
  try {
    const snapshot = await buildCommittedSourceSnapshot(sourceOptions(root));
    const job = createRemotePlanJob({ ...snapshot, idempotencyKey: 'deadline:write', pipelineStageId: 'test', plan: plan('blocking', null),
      grants: new Map([['test', []]]), maximumConcurrency: 1, submittedAt: '2026-08-10T03:00:00.000Z' });
    const store = new FileNovaRemotePlanStore(state, { recordLimits: limits, maximumArchiveBytes: 100_000, maximumArchiveStoreBytes: 1_000_000 });
    const deadline = new GateDeadline(40); let settled = false;
    const pending = assert.rejects(store.persistBeforeDispatch(job, deadline.signal), /NOVA_REMOTE_PLAN_TIMEOUT/u).then(() => { settled = true; });
    await new Promise(resolve => setTimeout(resolve, 150)); assert.equal(settled, false, 'do not abandon the pending atomic write');
    holder.stdin.end(); await exited; await pending; deadline.dispose();
    const file = path.join(state, 'records', 'store.json'); const after = fs.readFileSync(file, 'utf8');
    await new Promise(resolve => setTimeout(resolve, 50)); assert.equal(fs.readFileSync(file, 'utf8'), after);
    assert.equal((await store.load(job.jobId)).jobId, job.jobId, 'pending archive is recoverable after the drained write');
  } finally { holder.stdin.end(); await exited; fs.rmSync(root, { recursive: true, force: true }); }
});


test('escaped real Git compressor pipe owner yields bounded unconfirmed cleanup with the timeout cause', async () => {
  const { root, git } = repository();
  const pidFile = path.join(root, 'escaped-pipe-owner');
  const script = path.join(root, 'compressor.py');
  let escapedPid: number | undefined;
  try {
    fs.writeFileSync(script, `import subprocess,time
p=subprocess.Popen(["sleep","30"],start_new_session=True)
open(${JSON.stringify(pidFile)},"w").write(str(p.pid))
time.sleep(30)
`);
    git('config', 'tar.tar.gz.command', `/usr/bin/python3 ${script}`);
    const started = Date.now();
    await assert.rejects(buildCommittedSourceSnapshot({ ...sourceOptions(root), timeoutMs: 500 }), (error: unknown) => {
      assert.ok(error instanceof AggregateError);
      assert.match(error.message, /NOVA_REMOTE_PLAN_TIMEOUT:NOVA_SOURCE_CLEANUP_UNCONFIRMED/u);
      assert.ok(error.cause instanceof NovaGateTimeoutError);
      assert.ok(error.errors.some(item => String(item).includes('NOVA_SOURCE_PROCESS_CLEANUP_TIMEOUT')));
      return true;
    });
    assert.ok(Date.now() - started < 3000, 'the inherited pipe cannot hold the deadline promise indefinitely');
    escapedPid = Number(fs.readFileSync(pidFile, 'utf8'));
    // The pipe was disposed locally; the code must not claim this escaped process was terminated.
    assert.doesNotThrow(() => process.kill(escapedPid!, 0));
  } finally {
    if (!escapedPid && fs.existsSync(pidFile)) escapedPid = Number(fs.readFileSync(pidFile, 'utf8'));
    if (escapedPid) { try { process.kill(escapedPid, 'SIGKILL'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; } }
    fs.rmSync(root, { recursive: true, force: true });
  }
});
