import readline from 'node:readline';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const pending = new Map();
let sequence = 0;
let instance;
let invocation;
let context;
const contextController = new AbortController();
let maximumMemoryBytes = process.memoryUsage().rss;
const memoryTimer = setInterval(() => { maximumMemoryBytes = Math.max(maximumMemoryBytes, process.memoryUsage().rss); }, 10);
const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

function send(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function finish() {
  clearInterval(memoryTimer);
  lines.close();
  setImmediate(() => process.exit(process.exitCode ?? 0));
}

function rpc(capability, request) {
  sequence += 1;
  const id = `capability:${sequence}`;
  send({ kind: 'capability', id, capability, request });
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

function resources() {
  const usage = process.resourceUsage();
  return {
    cpuTimeMs: (usage.userCPUTime + usage.systemCPUTime) / 1000,
    maximumMemoryBytes,
  };
}

async function initialize(command) {
  if (!command || command.kind !== 'initialize') throw new Error('TEST_PROVIDER_PROTOCOL_INIT_REQUIRED');
  invocation = command.invocation;
  const loaded = await import(pathToFileURL(command.modulePath).href);
  const factory = loaded[command.exportName];
  if (typeof factory !== 'function') throw new Error('TEST_PROVIDER_EXPORT_INVALID');
  instance = await factory(invocation);
  if (!instance || typeof instance.execute !== 'function') throw new Error('TEST_PROVIDER_INSTANCE_INVALID');
  context = Object.freeze({
    signal: contextController.signal,
    workspaceRoot: command.workspaceRoot,
    log(stream, value) {
      const content = typeof value === 'string' ? value : Buffer.from(value).toString('base64');
      send({ kind: 'log', stream, content, encoding: typeof value === 'string' ? 'utf8' : 'base64' });
    },
    invoke: rpc,
  });
  send({ kind: 'initialized', supportsCleanup: typeof instance.cleanup === 'function', resources: resources() });
}

async function execute() {
  if (!instance) throw new Error('TEST_PROVIDER_NOT_INITIALIZED');
  const value = await instance.execute(invocation, context);
  send({ kind: 'result', value, resources: resources() });
}

async function cleanup() {
  if (instance?.cleanup) await instance.cleanup(invocation, context);
  send({ kind: 'cleanup-result', resources: resources() });
  finish();
}

lines.on('line', (line) => {
  void (async () => {
    const message = JSON.parse(line);
    if (message.kind === 'capability-result') {
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      if (message.ok) request.resolve(message.value);
      else request.reject(new Error(String(message.error || 'capability failed')));
      return;
    }
    if (message.kind === 'abort') { contextController.abort(new Error(String(message.reason || 'TEST_PROVIDER_CANCELLED'))); return; }
    if (message.kind === 'cleanup') { await cleanup(); return; }
    if (message.kind === 'execute') { await execute(); return; }
    await initialize(message);
  })().catch((error) => {
    send({ kind: 'error', error: error instanceof Error ? error.message : String(error), resources: resources() });
    finish();
    process.exitCode = 1;
  });
});

console.log = (...values) => send({ kind: 'log', stream: 'stdout', content: `${values.map(String).join(' ')}\n`, encoding: 'utf8' });
console.info = console.log;
console.warn = (...values) => send({ kind: 'log', stream: 'stderr', content: `${values.map(String).join(' ')}\n`, encoding: 'utf8' });
console.error = console.warn;
