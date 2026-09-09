import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { test } from 'node:test';
import { activatePublisher, activateTelemetry } from '../../../skills/common/plugins/redis-transport/src/adapter.ts';
import { activate as activateSecrets } from '../../../skills/common/plugins/secret-resolver/src/adapter.ts';
import { exchange } from '../../../skills/common/plugins/redis-transport/src/exchange.ts';
import { streamIdentity } from '../../../skills/common/plugins/redis-transport/src/stream-identity.ts';
import { EffectCoordinator, FileEffectJournal, FileResourceLockManager } from '../../../skills/nova/core/src/index.ts';

const owner = { pluginId: 'kubeclaw.redis-transport', apiVersion: 'pipeline-plugin-v2' as const, packageVersion: '1.0.0', contentDigest: `sha256:${'a'.repeat(64)}`, registrationId: 'publisher' };
const attempt = { runId: 'run:redis', stageId: 'publish', attemptId: 'attempt:redis', attemptNumber: 1 };

async function freePort(): Promise<number> {
  const socket = net.createServer(); socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
  const address = socket.address(); assert(address && typeof address !== 'string');
  await new Promise<void>(resolve => socket.close(() => resolve())); return address.port;
}

test('native Redis keeps target and provider streams distinct and deduplicates within each stream', async () => {
  const binary = process.env.REDIS_SERVER; assert(binary, 'Set REDIS_SERVER to a native redis-server binary; no emulator fallback');
  const cli = path.join(path.dirname(binary), 'redis-cli');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'redis-transport-'));
  const port = await freePort(), password = 'local-redis-regression-password';
  const server = spawn(binary, ['--bind', '127.0.0.1', '--port', String(port), '--requirepass', password, '--save', '', '--appendonly', 'no', '--dir', root], { stdio: ['ignore', 'pipe', 'pipe'] });
  const exited = once(server, 'exit');
  let logs = ''; server.stdout.on('data', chunk => { logs += chunk; }); server.stderr.on('data', chunk => { logs += chunk; });
  const command = (...args: string[]) => JSON.parse(execFileSync(cli, ['-h', '127.0.0.1', '-p', String(port), '--json', ...args], { encoding: 'utf8', env: { ...process.env, REDISCLI_AUTH: password } }));
  const variable = `REDIS_TRANSPORT_TEST_${process.pid}`; process.env[variable] = password;
  const signal = new AbortController().signal;
  const secrets = activateSecrets({ config: { environment: { 'redis.password': variable } } } as any);
  const context = { config: { url: `redis://127.0.0.1:${port}`, passwordSecret: 'redis.password', streamPrefix: 'fixture', maxLen: 1000, dedupTtlMs: 60000, timeoutMs: 1000 },
    async invoke(capability: string, request: any) { assert.equal(capability, 'secrets.read'); return secrets.invoke({ request: { ...request, capability }, signal, confidential: true } as any); } };
  const publisher = activatePublisher(context as any), telemetry = activateTelemetry(context as any);
  try {
    const deadline = performance.now() + 5000;
    while (!logs.includes('Ready to accept connections')) {
      if (server.exitCode !== null || performance.now() >= deadline) throw new Error(`native Redis failed: ${logs}`);
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    const locks = new FileResourceLockManager(path.join(root, 'locks'));
    const receipts: any[] = [];
    for (const kind of ['publisher', 'telemetry'] as const) for (const target of ['pipeline.completed', 'pipeline_completed']) {
      const effects = new EffectCoordinator(new FileEffectJournal(path.join(root, `${kind}-${target}.jsonl`)), undefined, undefined, locks);
      const input = { idempotencyKey: 'same-delivery-key', attempt, capability: kind === 'publisher' ? 'transport.publish' : 'telemetry.emit',
        operation: kind === 'publisher' ? 'publish' : 'append', resource: { type: kind === 'publisher' ? 'transport.target' : 'telemetry.event', canonicalId: target }, payload: { kind, target, content: 'Unicode 日本語 🐾' } };
      const adapter = kind === 'publisher' ? publisher : telemetry;
      const receipt = await effects.invoke(adapter, { ...owner, registrationId: kind }, input, signal);
      assert.equal(receipt.status, 'completed', JSON.stringify(receipt)); receipts.push(receipt.result);
      assert.deepEqual(await effects.invoke(adapter, { ...owner, registrationId: kind }, input, signal), receipt);
      const restarted = new EffectCoordinator(new FileEffectJournal(path.join(root, `${kind}-${target}-second.jsonl`)), undefined, undefined, locks);
      const repeated = await restarted.invoke(adapter, { ...owner, registrationId: kind }, input, signal);
      assert.deepEqual(repeated.result, receipt.result, 'original adapter Lua deduplicates a real second send');
      const entries = command('XRANGE', receipt.result!.stream, '-', '+');
      assert.equal(entries.length, 1); assert.deepEqual(JSON.parse(entries[0][1][3]), input.payload);

    }
    assert.equal(new Set(receipts.map(receipt => receipt.stream)).size, 4);
    assert.deepEqual(receipts.map(receipt => receipt.stream), ['publisher', 'telemetry'].flatMap(kind => ['pipeline.completed', 'pipeline_completed'].map(target => streamIdentity('fixture', kind as 'publisher' | 'telemetry', target, 'same-delivery-key').stream)), 'consumer lookup is exact');

  } finally {
    await publisher.shutdown(signal); await telemetry.shutdown(signal); delete process.env[variable];
    server.kill('SIGTERM'); await exited; fs.rmSync(root, { recursive: true, force: true });
  }
});

async function socketCase(chunks: readonly Buffer[], expected: string | RegExp, end = false): Promise<void> {
  let peerClosed = false;
  const server = net.createServer(socket => {
    socket.on('error', () => undefined); socket.once('close', () => { peerClosed = true; });
    socket.once('data', async () => {
      for (const chunk of chunks) { if (socket.destroyed) break; socket.write(chunk); await new Promise(resolve => setTimeout(resolve, 2)); }
      if (end) socket.end();
    });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert(address && typeof address !== 'string');
  try {
    const started = performance.now();
    const operation = exchange({ url: new URL(`redis://127.0.0.1:${address.port}`), timeoutMs: 3000 }, 'local-password', ['PING'], new AbortController().signal);
    if (typeof expected === 'string') assert.equal(await operation, expected); else await assert.rejects(operation, expected);
    assert(performance.now() - started < 1500, 'failure must not wait for transport timeout');
    const deadline = performance.now() + 500;
    while (!peerClosed && performance.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5));
    assert(peerClosed, 'socket is closed on success or malformed reply');
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
}

test('original socket path bounds malformed headers/bulks and rejects premature close and bad framing', async () => {
  await socketCase([Buffer.from('+OK\r\n$'), Buffer.alloc(2048, 49)], /HEADER_LIMIT/);
  await socketCase([Buffer.from('+OK\r\n$1048577\r\n')], /RESPONSE_INVALID/);
  await socketCase([Buffer.from('+OK\r\n$4\r\nxy')], /CONNECTION_ENDED|CONNECTION_CLOSED/, true);
  await socketCase([Buffer.from('+OK\r\n$2\r\nok!!')], /RESPONSE_INVALID/);
  await socketCase([Buffer.from('+OK\r\n$1\r\n'), Buffer.from([255,13,10])], /UTF8_INVALID/);
  await socketCase([Buffer.from('+OK\r\n$1\r\nx\r\n+extra\r\n')], /TRAILING_DATA/);
});

test('original socket path preserves fragmented UTF-8 and maximum valid bulk', async () => {
  const text = '日本語 🐾'; const bytes = Buffer.from(text);
  await socketCase([Buffer.from('+O'), Buffer.from(`K\r\n$${bytes.length}\r\n`), ...Array.from(bytes, value => Buffer.from([value])), Buffer.from('\r\n')], text);
  const header = 'a'.repeat(1023);
  await socketCase([Buffer.from(`+OK\r\n+${header}\r`), Buffer.from('\n')], header);
  const maximum = 'a'.repeat(1048576);
  await socketCase([Buffer.from('+OK\r\n$1048576\r\n'), Buffer.from(maximum), Buffer.from('\r\n')], maximum);
});
