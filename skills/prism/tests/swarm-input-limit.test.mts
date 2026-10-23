import { fileURLToPath } from 'node:url';
import { captureSwarmSettings, type PrismWorkerSettings } from '../../common/plugin-runtime/foundation/config/swarm.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { spawnSync } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import { createWorkerServer } from '../server/worker-service.ts';
import { nativePrismCommand } from '../server/native-worker-execution.ts';
import { nativePrismHostConfig, type nativePrismSupervisorConfig } from '../config/native-worker.ts';

function settings(t: { after(fn: () => void): void }, maximumInputBytes: number) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-input-limit-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.cpSync(fileURLToPath(new URL('../../../config/', import.meta.url)), root, { recursive: true });
  const authorFile = path.join(root, 'components/prism-worker.config.json');
  const authored = JSON.parse(fs.readFileSync(authorFile, 'utf8'));
  authored.profiles.standard.settings.ingress.maximumInputBytes = maximumInputBytes;
  fs.writeFileSync(authorFile, JSON.stringify(authored));
  const entryFile = path.join(root, 'pipeline.config.json');
  const entry = JSON.parse(fs.readFileSync(entryFile, 'utf8'));
  const instanceId = 'kubeclaw/prism/prism-worker';
  const captured = captureSwarmSettings(entryFile, { role: 'prism', callerId: 'prism-worker', serviceInstanceId: instanceId,
    bindings: entry.bindings.filter((binding: { instanceId: string }) => binding.instanceId === instanceId)
      .map(({ role: _role, ...binding }: { role: string; owner: string; instanceId: string; profileId: string }) => binding) });
  const ingress = captured.components['prism-worker']!.settings.ingress as unknown as PrismWorkerSettings;
  const controlInternalUrl = new URL(captured.components['prism-control']!.settings.controlInternalUrl as string);
  // Consumer/parser fixture only, not a verified boot capture or native authority.
  return { native: { enginePolicy: captured.components['prism-execution']!.settings.enginePolicy as unknown as import('../../common/plugin-runtime/foundation/config/swarm.ts').PrismEngineSettings }, maximumArtifactAcknowledgmentBytes: captured.components['prism-control']!.settings.maximumArtifactAcknowledgmentBytes as number, ingress, shutdownTimeoutMs: ingress.shutdownTimeoutMs, controlInternalUrl,
    spiffeEnabled: true, workerSecret: '', trustedControlSpiffeId: 'spiffe://local/control' };

}

for (const maximumInputBytes of [64, 128]) test(`CI03 original HTTP body boundary follows authored ${maximumInputBytes} bytes`, { timeout: 10000 }, async t => {
  const config = settings(t, maximumInputBytes);
  let executed = 0;
  const server = createWorkerServer({ mode: 'spiffe', trustedControlSpiffeId: config.trustedControlSpiffeId }, {
    ready: () => true, execute: async () => { executed++; throw new Error('must not execute unauthenticated input'); },
  }, config.ingress);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => server.shutdown(config.shutdownTimeoutMs));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/attempts`;
  async function post(bytes: number) {
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: ' '.repeat(bytes) });
    assert.equal(response.status, 422);
    return (await response.json()) as { error: string };
  }
  const exact = await post(maximumInputBytes);
  assert.match(exact.error, /^WORKER_TRUST_/, 'within budget reaches real authentication');
  assert.equal((await post(maximumInputBytes + 1)).error, 'Prism attempt request is too large');
  const sameBody = await post(65);
  assert.equal(sameBody.error, maximumInputBytes === 64 ? 'Prism attempt request is too large' : exact.error);
  assert.deepEqual(await post(maximumInputBytes), exact, 'oversize request releases admission for the next valid-size body');
  assert.equal(executed, 0);
});

for (const maximumInputBytes of [64, 128]) test(`CI04 production command and real host parser use assigned ${maximumInputBytes} bytes`, t => {
  const config = settings(t, maximumInputBytes);
  // Only command fields are needed. This is transport/parser coverage, not a native owner or kernel fixture.
  const native = { launcher: '/not-invoked', uid: 1000, gid: 1000, engineContentDigest: `sha256:${'a'.repeat(64)}`,
    browserPath: '/not-invoked', maximumInputBytes: config.ingress.maximumInputBytes } as ReturnType<typeof nativePrismSupervisorConfig>;
  const previous = process.env.PRISM_NATIVE_ASSIGNED_INPUT_BYTES;
  process.env.PRISM_NATIVE_ASSIGNED_INPUT_BYTES = '2147483647';
  let command: ReturnType<typeof nativePrismCommand>;
  try { command = nativePrismCommand(native, config); }
  finally {
    if (previous === undefined) delete process.env.PRISM_NATIVE_ASSIGNED_INPUT_BYTES;
    else process.env.PRISM_NATIVE_ASSIGNED_INPUT_BYTES = previous;
  }
  assert.equal(command.environment.PRISM_NATIVE_ASSIGNED_INPUT_BYTES, String(maximumInputBytes));
  assert.ok(!('PRISM_NATIVE_MAXIMUM_INPUT_BYTES' in command.environment));
  const environment = { ...command.environment, KUBECLAW_NATIVE_SCOPE: '/parser-test-only' };
  assert.equal(nativePrismHostConfig(environment).maximumInputBytes, maximumInputBytes);
  const overflow = spawnSync(command.executable, command.arguments, { cwd: command.cwd, env: environment,
    input: ' '.repeat(maximumInputBytes + 1), encoding: 'utf8', timeout: 10000 });
  assert.equal(overflow.error, undefined); assert.notEqual(overflow.status, 0);
  assert.match(overflow.stderr, /Error: PRISM_NATIVE_INPUT_LIMIT\n/);
  const accepted = spawnSync(command.executable, command.arguments, { cwd: command.cwd, env: environment,
    input: ' '.repeat(maximumInputBytes), encoding: 'utf8', timeout: 10000 });
  assert.equal(accepted.error, undefined); assert.notEqual(accepted.status, 0);
  assert.match(accepted.stderr, /SyntaxError: Unexpected end of JSON input/);
  assert.doesNotMatch(accepted.stderr, /Error: PRISM_NATIVE_INPUT_LIMIT/);
  assert.throws(() => nativePrismHostConfig({ ...environment, PRISM_NATIVE_MAXIMUM_INPUT_BYTES: String(maximumInputBytes) }), /LEGACY_OVERRIDE/);
  for (const value of ['', '0', '1.5', '2147483648', undefined]) {
    assert.throws(() => nativePrismHostConfig({ ...environment, PRISM_NATIVE_ASSIGNED_INPUT_BYTES: value }), /INPUT_LIMIT_REQUIRED/);
  }
});
