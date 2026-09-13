import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { REDIS_PUBLISH_LUA } from '../../../skills/common/plugins/redis-transport/src/adapter.ts';

test('original Redis RDB migrates into selected AOF with streams, pending consumers and absolute dedup expiry', { timeout: 60000 }, async t => {
  const binary = process.env.REDIS_SERVER;
  const sourceBinary = process.env.REDIS_SOURCE_SERVER;
  assert.ok(binary && sourceBinary, 'Native source and selected destination binaries are required; no emulator fallback');
  const cli = path.join(path.dirname(binary), 'redis-cli');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'redis-migration-'));
  const children: ReturnType<typeof spawn>[] = [];
  t.after(async () => {
    for (const child of children) if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited;
    }
    await fs.rm(root, { recursive: true, force: true });
  });
  const command = (socket: string, ...args: string[]): any => {
    const output = execFileSync(cli, ['-h', '127.0.0.1', '-p', socket, '--json', ...args], { encoding: 'utf8' });
    if (output.startsWith('error:')) throw new Error(output);
    return JSON.parse(output);
  };
  async function start(executable: string, directory: string, aof: boolean) {
    await fs.mkdir(directory, { recursive: true });
    const listener = createServer(); listener.listen(0, '127.0.0.1'); await once(listener, 'listening');
    const address = listener.address(); assert.ok(address && typeof address !== 'string');
    const socket = String(address.port);
    await new Promise<void>(resolve => listener.close(() => resolve()));
    const child = spawn(executable, ['--bind', '127.0.0.1', '--port', socket, '--dir', directory,
      '--appendonly', aof ? 'yes' : 'no', '--appendfsync', 'always', '--save', ''], { stdio: ['ignore', 'pipe', 'pipe'] });
    children.push(child);
    let log = ''; child.stdout!.on('data', bytes => { log += String(bytes); }); child.stderr!.on('data', bytes => { log += String(bytes); });
    const deadline = performance.now() + 5000;
    while (!log.includes('Ready to accept connections')) {
      assert.equal(child.exitCode, null, log); assert.ok(performance.now() < deadline, log);
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    return { socket, child };
  }
  const source = await start(sourceBinary, path.join(root, 'source'), false);
  const publish = ['EVAL', REDIS_PUBLISH_LUA, '2', 'migration:stream', 'migration:dedup',
    '10000', 'delivery:original', '{"original":true}', '600000'];
  const id = command(source.socket, ...publish);
  command(source.socket, 'XGROUP', 'CREATE', 'migration:stream', 'workers', '0');
  command(source.socket, 'XREADGROUP', 'GROUP', 'workers', 'consumer-a', 'STREAMS', 'migration:stream', '>');
  const originalStream = command(source.socket, 'XRANGE', 'migration:stream', '-', '+');
  const originalPending = command(source.socket, 'XPENDING', 'migration:stream', 'workers');
  const expiresAt = command(source.socket, 'PEXPIRETIME', 'migration:dedup');
  assert.ok(expiresAt > Date.now());
  // The runbook's actual Redis snapshot transport, while writes are paused.
  assert.equal(command(source.socket, 'CLIENT', 'PAUSE', '60000', 'WRITE'), 'OK');
  const snapshot = path.join(root, 'source.rdb');
  execFileSync(cli, ['-h', '127.0.0.1', '-p', source.socket, '--rdb', snapshot], { timeout: 10000, stdio: ['ignore', 'pipe', 'pipe'] });
  const exited = once(source.child, 'exit'); source.child.kill('SIGKILL'); await exited;
  const bytes = await fs.readFile(snapshot);
  const sha = createHash('sha256').update(bytes).digest('hex');
  const destination = path.join(root, 'destination');
  const env = { ...process.env, REDIS_SERVER: binary, REDIS_CLI: cli,
    REDIS_CHECK_RDB: path.join(path.dirname(binary), 'redis-check-rdb'), REDIS_MIGRATION_MAXIMUM_SECONDS: '20' };
  const output = execFileSync('bash', ['scripts/redis-prepare-migration.sh', snapshot, sha, destination],
    { encoding: 'utf8', timeout: 30000, env, stdio: ['ignore', 'pipe', 'pipe'] });
  assert.match(output, new RegExp(`${destination}$`, 'm'));
  assert.deepEqual(await fs.readFile(snapshot), bytes, 'source backup is unchanged');
  await assert.rejects(fs.stat(path.join(destination, 'dump.rdb')), { code: 'ENOENT' });
  assert.match(await fs.readFile(path.join(destination, 'migration-receipt.txt'), 'utf8'), /state=aof-restart-verified/);
  const target = await start(binary, destination, true);
  assert.deepEqual(command(target.socket, 'XRANGE', 'migration:stream', '-', '+'), originalStream);
  assert.deepEqual(command(target.socket, 'XPENDING', 'migration:stream', 'workers'), originalPending);
  assert.equal(command(target.socket, 'PEXPIRETIME', 'migration:dedup'), expiresAt, 'migration never extends the dedup window');
  assert.equal(command(target.socket, ...publish), id, 'old lost-ACK retry returns the original stream identity');
  assert.equal(command(target.socket, 'XLEN', 'migration:stream'), 1);
  assert.throws(() => execFileSync('bash', ['scripts/redis-prepare-migration.sh', snapshot, sha, destination],
    { env, stdio: ['ignore', 'pipe', 'pipe'] }), /Command failed/);
  assert.equal(command(target.socket, 'XLEN', 'migration:stream'), 1, 'refused overwrite cannot mutate the running target');
  const rejected = path.join(root, 'wrong-digest');
  assert.throws(() => execFileSync('bash', ['scripts/redis-prepare-migration.sh', snapshot, '0'.repeat(64), rejected],
    { env, stdio: ['ignore', 'pipe', 'pipe'] }), /SNAPSHOT_DIGEST_MISMATCH/);
  await assert.rejects(fs.stat(rejected), { code: 'ENOENT' });
});
