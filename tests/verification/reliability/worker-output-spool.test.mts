import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { NativeWorkerOutputSpool, readNativeWorkerOutput } from '../../../skills/worker/core/worker/native-output-spool.ts';
import { captureNativeWorkerOutput } from '../../../skills/worker/core/worker/native-process-output.ts';

test('production collector persists both real child pipes byte-for-byte with backpressure', { timeout: 15000 }, async () => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'native-output-pipes-'));
  const root = path.join(parent, 'output');
  const spool = await NativeWorkerOutputSpool.create(root, 2 * 1024 * 1024);
  const stdout = Buffer.alloc(256 * 1024, 255);
  const stderr = Buffer.from('uncensored demonstration credentials: test-only-password\n'.repeat(1000));
  const code = `process.stdout.write(Buffer.alloc(${stdout.length}, 255)); process.stderr.write(${JSON.stringify(stderr.toString())});`;
  const child = spawn(process.execPath, ['-e', code], { stdio: 'pipe' });
  const faults: string[] = [];
  const output = captureNativeWorkerOutput(child, 2 * 1024 * 1024, code => { faults.push(code); child.kill('SIGKILL'); }, spool);
  const closed = once(child, 'close'); child.stdin.end();
  try {
    assert.deepEqual(await closed, [0, null]);
    await output.flush();
    await spool.close();
    assert.deepEqual(faults, []);
    assert.deepEqual(output.snapshot(), { stdout, stderr });
    const restored = await readNativeWorkerOutput(root, 2 * 1024 * 1024);
    assert.deepEqual(restored.stdout.bytes, stdout); assert.deepEqual(restored.stderr.bytes, stderr);
    await assert.rejects(NativeWorkerOutputSpool.create(root, 2 * 1024 * 1024), /EEXIST/u);
    assert.deepEqual((await readNativeWorkerOutput(root, 2 * 1024 * 1024)).stdout, restored.stdout);
  } finally { child.kill('SIGKILL'); await closed; await spool.close(); await fs.rm(parent, { recursive: true, force: true }); }
});

test('combined output quota stops a real producer and cannot be split across stdout/stderr', { timeout: 15000 }, async () => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'native-output-quota-'));
  const root = path.join(parent, 'output');
  const spool = await NativeWorkerOutputSpool.create(root, 200);
  try {
    await spool.append('stdout', Buffer.alloc(128, 1));
    await assert.rejects(spool.append('stderr', Buffer.alloc(73, 2)), /WORKER_OUTPUT_SPOOL_LIMIT/u);
    await spool.append('stderr', Buffer.alloc(72, 2));
    await spool.close();
    const bytes = await readNativeWorkerOutput(root, 200);
    assert.equal(bytes.stdout.sizeBytes + bytes.stderr.sizeBytes, 200);
    const child = spawn(process.execPath, ['-e', 'process.stdout.write(Buffer.alloc(1048576)); setInterval(() => {}, 1000);'], { stdio: 'pipe' });
    const closed = once(child, 'close');
    let fault: string | null = null;
    const output = captureNativeWorkerOutput(child, 4096, code => { fault = code; child.kill('SIGKILL'); });
    child.stdin.end();
    assert.deepEqual(await closed, [null, 'SIGKILL']);
    assert.equal(fault, 'WORKER_NATIVE_OUTPUT_LIMIT');
    assert.ok(output.snapshot().stdout.byteLength <= 4096);
    await fs.link(path.join(root, 'stdout'), path.join(parent, 'unexpected-hardlink'));
    await assert.rejects(readNativeWorkerOutput(root, 200), /WORKER_OUTPUT_SPOOL_FILE_INVALID/u);
  } finally { await spool.close(); await fs.rm(parent, { recursive: true, force: true }); }
});

test('flushed original output survives a real writer SIGKILL', { timeout: 15000 }, async () => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'native-output-crash-'));
  const root = path.join(parent, 'output');
  const child = spawn(process.execPath, [fileURLToPath(new URL('../../fixtures/worker-output-writer.mjs', import.meta.url)), root], { stdio: 'pipe' });
  const exited = once(child, 'exit');
  try {
    const ready = await Promise.race([once(child.stdout, 'data').then(([bytes]) => String(bytes)),
      exited.then(() => { throw new Error('output writer exited before flush'); })]);
    assert.equal(ready, 'durable\n'); child.kill('SIGKILL');
    assert.deepEqual(await exited, [null, 'SIGKILL']);
    const output = await readNativeWorkerOutput(root, 65536);
    assert.deepEqual(output.stdout.bytes, Buffer.from([0, 1, 2, 255, 10]));
    assert.equal(output.stderr.bytes.toString(), 'original stderr: demo-password-is-preserved\n');
  } finally { child.kill('SIGKILL'); await exited; await fs.rm(parent, { recursive: true, force: true }); }
});
