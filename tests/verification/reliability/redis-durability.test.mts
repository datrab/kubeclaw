import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { createServer, connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { load } from 'js-yaml';
import { REDIS_PUBLISH_LUA } from '../../../skills/common/plugins/redis-transport/src/adapter.ts';
import { command as resp } from '../../../skills/common/plugins/redis-transport/src/resp.ts';

test('real Redis recovers an unreceived ACK and dedup after SIGKILL, and refuses writes without eviction', { timeout: 20000 }, async t => {
  const binary = process.env.REDIS_SERVER;
  assert.ok(binary, 'Set REDIS_SERVER to a native Redis binary; no emulator fallback');
  const cli = join(dirname(binary), 'redis-cli');
  const root = await mkdtemp(join(tmpdir(), 'redis-durability-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const socket = createServer(); socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
  const address = socket.address(); assert.ok(address && typeof address !== 'string');
  const port = address.port;
  await new Promise<void>(resolve => socket.close(() => resolve()));
  const values = load(await readFile('my-values/infra/redis-values.yaml', 'utf8')) as { commonConfiguration: string };
  const password = 'local-durability-proof-password';
  // Use production persistence policy. A later CONFIG SET reduces only the
  // capacity threshold, so the boundary test does not allocate a gigabyte.
  await writeFile(join(root, 'redis.conf'), `${values.commonConfiguration}\nbind 127.0.0.1\nport ${port}\nrequirepass ${password}\ndir ${root}\n`);
  let child: ReturnType<typeof spawn>;
  const command = (...parts: string[]): any => {
    const output = execFileSync(cli, ['-h', '127.0.0.1', '-p', String(port), '--json', ...parts],
      { encoding: 'utf8', env: { ...process.env, REDISCLI_AUTH: password }, stdio: ['ignore', 'pipe', 'pipe'] });
    if (output.startsWith('error:')) throw new Error(output.slice('error:'.length).trim());
    return JSON.parse(output);
  };
  async function start() {
    child = spawn(binary!, [join(root, 'redis.conf')], { stdio: ['ignore', 'pipe', 'pipe'] });
    let log = ''; child.stdout!.on('data', bytes => { log += bytes; }); child.stderr!.on('data', bytes => { log += bytes; });
    const deadline = performance.now() + 5000;
    while (!log.includes('Ready to accept connections')) {
      if (child.exitCode !== null || performance.now() >= deadline) throw new Error(`Redis startup failed: ${log}`);
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
  async function stop() {
    if (child && child.exitCode === null) { const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited; }
  }
  t.after(stop);
  await start();
  for (const [name, expected] of [['appendonly', 'yes'], ['appendfsync', 'always'], ['maxmemory-policy', 'noeviction'], ['aof-load-truncated', 'no']]) {
    assert.equal(command('CONFIG', 'GET', name)[name], expected);
  }
  const publish = ['EVAL', REDIS_PUBLISH_LUA, '2', 'proof:stream', 'proof:dedup', '10000', 'delivery:1', '{"result":"original"}', '600000'];
  const lost = connect({ host: '127.0.0.1', port });
  t.after(() => lost.destroy());
  await once(lost, 'connect');
  // A real Redis connection suppresses the response before executing the real
  // publisher Lua. The sender never receives the publication ACK.
  lost.write(Buffer.concat([resp(['AUTH', password]), resp(['CLIENT', 'REPLY', 'OFF']), resp(publish)]));
  let entry: string | null = null;
  const deadline = performance.now() + 5000;
  while (!(entry = command('GET', 'proof:dedup'))) {
    if (performance.now() >= deadline) throw new Error('Unacknowledged publication was not committed');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  lost.destroy();
  await stop();
  await start();
  assert.equal(command(...publish), entry, 'retry returns the durable original ACK');
  assert.equal(command('XLEN', 'proof:stream'), 1, 'retry must not publish a second entry');
  assert.equal(command('GET', 'proof:dedup'), entry);
  assert.equal(command('CONFIG', 'SET', 'maxmemory', '1'), 'OK');
  assert.throws(() => command('SET', 'proof:overflow', 'rejected'), /OOM command not allowed/, 'noeviction must refuse a new allocation');
  assert.throws(() => command('EVAL', REDIS_PUBLISH_LUA, '2', 'proof:stream', 'proof:dedup-2',
    '10000', 'delivery:2', '{"result":"must not publish"}', '600000'), /OOM command not allowed/);
  assert.equal(command('GET', 'proof:dedup'), entry, 'memory pressure must retain the dedup key');
  assert.equal(command('XLEN', 'proof:stream'), 1);
  assert.equal(command('GET', 'proof:overflow'), null);
  assert.equal(command('CONFIG', 'SET', 'maxmemory', '1073741824'), 'OK');
  assert.equal(command(...publish), entry);
});
