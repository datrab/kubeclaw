import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-command-runner-'));
const workingRoot = path.join(temporary, 'workspace');
const deniedRoot = path.join(temporary, 'denied');
fs.mkdirSync(workingRoot);
fs.mkdirSync(deniedRoot);
const executable = fs.realpathSync(process.execPath);

const { activate } = await import(pathToFileURL(path.resolve('dist/adapter.js')).href);
function createAdapter(overrides = {}) {
  return activate({
    registration: {},
    config: {
      allowedExecutables: [executable],
      allowedWorkingRoots: [workingRoot],
      maxOutputBytes: 128,
      maxExecutionMs: 2_000,
      terminationGraceMs: 25,
      ...overrides,
    },
    async emit() {},
    async invoke() { throw new Error('unexpected dependency'); },
  });
}

const attempt = {
  runId: 'run:test',
  stageId: 'stage:test',
  attemptId: 'attempt:test',
  attemptNumber: 1,
};
let requestSequence = 0;
function run(adapter, args, {
  command = executable,
  cwd = workingRoot,
  capability = 'command.execute',
  operation = 'run',
  type = 'command.executable',
  signal = new AbortController().signal,
} = {}) {
  requestSequence += 1;
  return adapter.invoke({
    request: {
      requestId: `request:${requestSequence}`,
      idempotencyKey: `command:${requestSequence}`,
      attempt,
      capability,
      operation,
      resource: { type, canonicalId: command },
      payload: { args, workingDirectory: cwd },
    },
    signal,
  });
}

const adapter = createAdapter();
try {
  await adapter.ready();
  const success = await run(adapter, [
    '-e',
    'process.stdout.write(process.cwd());process.stderr.write(String(Object.keys(process.env).length))',
  ]);
  assert.equal(success.exitCode, 0);
  assert.equal(success.signal, null);
  assert.equal(success.stdout, fs.realpathSync(workingRoot));
  assert.equal(success.stderr, '0');

  const failed = await run(adapter, ['-e', 'process.stderr.write("failure");process.exit(7)']);
  assert.equal(failed.exitCode, 7);
  assert.equal(failed.stderr, 'failure');

  await assert.rejects(
    run(adapter, [], { command: fs.realpathSync('/bin/echo') }),
    /COMMAND_EXECUTABLE_DENIED/,
  );
  await assert.rejects(run(adapter, [], { cwd: deniedRoot }), /COMMAND_WORKING_DIRECTORY_DENIED/);
  await assert.rejects(run(adapter, [], { capability: 'network.http' }), /COMMAND_OPERATION_UNSUPPORTED/);
  await assert.rejects(run(adapter, [], { operation: 'shell' }), /COMMAND_OPERATION_UNSUPPORTED/);
  await assert.rejects(run(adapter, [], { type: 'command.shell' }), /COMMAND_RESOURCE_INVALID/);
  await assert.rejects(run(adapter, ['bad\0argument']), /COMMAND_ARGUMENTS_INVALID/);
} finally {
  await adapter.shutdown(new AbortController().signal);
}

const limited = createAdapter({ maxOutputBytes: 8 });
try {
  await limited.ready();
  await assert.rejects(
    run(limited, ['-e', 'process.stdout.write("0123456789")']),
    /COMMAND_OUTPUT_LIMIT_EXCEEDED/,
  );
} finally {
  await limited.shutdown(new AbortController().signal);
}

const timed = createAdapter({ maxExecutionMs: 20 });
try {
  await timed.ready();
  await assert.rejects(
    run(timed, ['-e', 'setTimeout(() => {}, 10_000)']),
    /COMMAND_TIMEOUT/,
  );
} finally {
  await timed.shutdown(new AbortController().signal);
}

const cancellable = createAdapter();
try {
  await cancellable.ready();
  const controller = new AbortController();
  const pending = run(
    cancellable,
    ['-e', 'setTimeout(() => {}, 10_000)'],
    { signal: controller.signal },
  );
  setTimeout(() => controller.abort(), 20);
  await assert.rejects(pending, /ADAPTER_CANCELLED/);
} finally {
  await cancellable.shutdown(new AbortController().signal);
}

const shutdownAdapter = createAdapter();
await shutdownAdapter.ready();
const running = run(shutdownAdapter, [
  '-e',
  'process.on("SIGTERM", () => {});setInterval(() => {}, 10_000)',
]);
await new Promise((resolve) => setTimeout(resolve, 20));
await shutdownAdapter.shutdown(new AbortController().signal);
const shutdownResult = await running;
assert.equal(shutdownResult.exitCode, null);
assert.equal(shutdownResult.signal, 'SIGKILL');
await assert.rejects(run(shutdownAdapter, []), /ADAPTER_SHUTTING_DOWN/);

fs.rmSync(temporary, { recursive: true, force: true });
console.log(JSON.stringify({
  ok: true,
  plugin: 'kubeclaw.command-runner',
  suite: 'live-function',
}));
