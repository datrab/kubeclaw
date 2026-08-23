import readline from 'node:readline';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const pending = new Map();

function createInitialization() {
  let resolveCommand;
  const command = new Promise((resolve) => { resolveCommand = resolve; });
  return Object.freeze({
    command,
    accept(message) { resolveCommand(message); },
  });
}

function createRpcIdFactory() {
  let sequence = 0;
  return () => {
    sequence += 1;
    return `rpc:${sequence}`;
  };
}

const initialization = createInitialization();
const nextRpcId = createRpcIdFactory();
const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

function send(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

lines.on('line', (line) => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    send({ kind: 'fatal', error: 'ISOLATION_PROTOCOL_INVALID_JSON' });
    process.exit(70);
    return;
  }
  if (message.kind === 'response') {
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.ok) request.resolve(message.value);
    else request.reject(new Error(String(message.error || 'isolated capability failed')));
    return;
  }
  initialization.accept(message);
});

function rpc(kind, payload) {
  const id = nextRpcId();
  send({ kind, id, ...payload });
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

function contextProxy(contract) {
  const artifacts = new Map(contract.artifacts.map((artifact) => [artifact.artifactId, artifact]));
  return Object.freeze({
    contract: Object.freeze(contract),
    invoke(capability, request) {
      return rpc('capability', { capability, request });
    },
    emit(type, identity, payload) {
      return rpc('event', { type, identity, payload });
    },
    artifact(id) {
      return artifacts.get(id);
    },
  });
}

console.log = (...values) => process.stderr.write(`${values.map(String).join(' ')}\n`);
console.info = console.log;
console.warn = console.log;
console.error = console.log;

try {
  const command = await initialization.command;
  if (!command || command.kind !== 'invoke') throw new Error('ISOLATION_PROTOCOL_INIT_REQUIRED');
  if (!['stage', 'observer'].includes(command.surface)) throw new Error('ISOLATION_SURFACE_UNSUPPORTED');
  const module = await import(pathToFileURL(command.modulePath).href);
  const execute = module[command.exportName];
  if (typeof execute !== 'function') throw new Error('ISOLATION_EXPORT_INVALID');
  const value = await execute(command.argument, contextProxy(command.context));
  send({ kind: 'result', value });
} catch (error) {
  send({
    kind: 'error',
    error: error instanceof Error
      ? { name: error.name, message: error.message }
      : { name: 'Error', message: String(error) },
  });
  process.exitCode = 1;
} finally {
  lines.close();
}
