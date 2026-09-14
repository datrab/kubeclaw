import assert from 'node:assert/strict';
import { Socket } from 'node:net';
import { sha256Digest } from '@kubeclaw/worker-core';
import { NativeWorkerControlChannel } from '../../skills/worker/core/worker/native-control-channel.ts';
import { awaitBusterFixtureTeardown } from '../../skills/buster/engine/test-gates/native-fixture-control.ts';
import type { BusterFixtureAdmission, BusterFixtureReadiness } from '../../skills/buster/engine/test-gates/native-fixture-state.ts';

const channel = new NativeWorkerControlChannel(new Socket({ fd: 3, readable: true, writable: true, allowHalfOpen: true }),
  { maximumMessageBytes: 65536, maximumSessionBytes: 262144 });
let input = '';
for await (const bytes of process.stdin) {
  input += String(bytes);
  if (Buffer.byteLength(input) > 131072) throw new Error('FIXTURE_CONTROL_TEST_INPUT_LIMIT');
}
const vector = JSON.parse(input) as { admission: BusterFixtureAdmission; readiness: BusterFixtureReadiness };
if (process.argv[2] === 'repeat') {
  await channel.send(Buffer.from(JSON.stringify(vector.readiness)));
  // Keep the transport open until the controller rejects the duplicate. Closing
  // before its durable ready ACK races the protocol failure with a broken pipe.
  for await (const bytes of channel.messages()) {
    assert.deepEqual(JSON.parse(String(bytes)), {
      schemaVersion: 'buster-fixture-ready-ack.v1', readinessDigest: sha256Digest(vector.readiness),
    });
    await channel.send(Buffer.from(JSON.stringify(vector.readiness)));
  }
} else {
  try {
    const teardown = await awaitBusterFixtureTeardown(channel, vector.admission, vector.readiness, new AbortController().signal);
    process.stdout.write(JSON.stringify(teardown));
  } catch (error) {
    process.stderr.write(error instanceof Error ? error.message : String(error)); process.exitCode = 1;
  } finally { channel.destroy(); }
}
