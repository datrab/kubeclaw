import readline from 'node:readline';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

function send(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

class ProviderChildSession {
  #pending = new Map();
  #sequence = 0;
  #instance;
  #invocation;
  #context;
  #controller = new AbortController();
  #maximumMemoryBytes;
  #memoryTimer;
  #sampleIntervalMs;
  #lines;

  constructor() {
    // Group TERM may precede IPC abort and may be forwarded more than once.
    // Keep the handler installed; the parent's stop bounds remain authoritative.
    process.on('SIGTERM', () => this.#controller.abort(new Error('TEST_PROVIDER_TERMINATED')));
    this.#maximumMemoryBytes = process.memoryUsage().rss;
    this.#lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
    this.#lines.on('line', (line) => {
      void this.#receive(line).catch((error) => {
        send({ kind: 'error', error: error instanceof Error ? error.message : String(error), resources: this.#resources() });
        this.#finish();
        process.exitCode = 1;
      });
    });
  }

  #finish() {
    clearInterval(this.#memoryTimer);
    this.#lines.close();
    setImmediate(() => process.exit(process.exitCode ?? 0));
  }

  #rpc(capability, request, signal = this.#controller.signal) {
    const combined = AbortSignal.any([this.#controller.signal, signal]);
    if (combined.aborted) return Promise.reject(combined.reason);
    this.#sequence += 1;
    const id = `capability:${this.#sequence}`;
    const operation = new Promise((resolve, reject) => {
      const abort = () => {
        this.#pending.delete(id);
        send({ kind: 'capability-abort', id, reason: String(combined.reason ?? 'TEST_PROVIDER_CAPABILITY_CANCELLED') });
        reject(combined.reason);
      };
      this.#pending.set(id, { resolve, reject, detach: () => combined.removeEventListener('abort', abort) });
      combined.addEventListener('abort', abort, { once: true });
    });
    send({ kind: 'capability', id, capability, request });
    return operation;
  }

  #resources() {
    const usage = process.resourceUsage();
    return {
      cpuTimeMs: (usage.userCPUTime + usage.systemCPUTime) / 1000,
      maximumMemoryBytes: this.#maximumMemoryBytes,
    };
  }

  #configureObservation(observation) {
    if (!observation || typeof observation !== 'object' || Array.isArray(observation)
      || Object.keys(observation).length !== 1
      || !Object.hasOwn(observation, 'resourceSampleIntervalMs')
      || !Number.isSafeInteger(observation.resourceSampleIntervalMs)
      || observation.resourceSampleIntervalMs < 1 || observation.resourceSampleIntervalMs > 2147483647) {
      throw new Error('TEST_PROVIDER_OBSERVATION_INVALID');
    }
    const interval = observation.resourceSampleIntervalMs;
    if (this.#sampleIntervalMs !== undefined) {
      if (this.#sampleIntervalMs !== interval) throw new Error('TEST_PROVIDER_OBSERVATION_CHANGED');
      return;
    }
    this.#sampleIntervalMs = interval;
    this.#memoryTimer = setInterval(() => {
      this.#maximumMemoryBytes = Math.max(this.#maximumMemoryBytes, process.memoryUsage().rss);
    }, interval);
  }

  async #initialize(command) {
    if (!command || command.kind !== 'initialize') throw new Error('TEST_PROVIDER_PROTOCOL_INIT_REQUIRED');
    this.#configureObservation(command.observation);
    this.#invocation = command.invocation;
    const loaded = await import(pathToFileURL(command.modulePath).href);
    const factory = loaded[command.exportName];
    if (typeof factory !== 'function') throw new Error('TEST_PROVIDER_EXPORT_INVALID');
    this.#instance = await factory(this.#invocation);
    if (!this.#instance || typeof this.#instance.execute !== 'function') throw new Error('TEST_PROVIDER_INSTANCE_INVALID');
    this.#context = Object.freeze({
      signal: this.#controller.signal,
      workspaceRoot: command.workspaceRoot,
      log(stream, value) {
        const content = typeof value === 'string' ? value : Buffer.from(value).toString('base64');
        send({ kind: 'log', stream, content, encoding: typeof value === 'string' ? 'utf8' : 'base64' });
      },
      invoke: this.#rpc.bind(this),
    });
    send({ kind: 'initialized', supportsCleanup: typeof this.#instance.cleanup === 'function', resources: this.#resources() });
  }

  async #execute() {
    if (!this.#instance) throw new Error('TEST_PROVIDER_NOT_INITIALIZED');
    const value = await this.#instance.execute(this.#invocation, this.#context);
    if (this.#pending.size) throw new Error('TEST_PROVIDER_UNAWAITED_CAPABILITIES');
    send({ kind: 'result', value, resources: this.#resources() });
  }

  async #cleanup(message) {
    if (message.schemaVersion !== 'provider-cleanup.v1'
      || !['incomplete', 'completed-fixture'].includes(message.disposition)) {
      throw new Error('TEST_PROVIDER_CLEANUP_DISPOSITION_INVALID');
    }
    if (this.#instance?.cleanup) await this.#instance.cleanup(this.#invocation, this.#context, message.disposition);
    send({ kind: 'cleanup-result', resources: this.#resources() });
    this.#finish();
  }

  async #receive(line) {
    const message = JSON.parse(line);
    if (message.kind === 'capability-result') {
      const request = this.#pending.get(message.id);
      if (!request) return;
      this.#pending.delete(message.id);
      request.detach();
      if (message.ok) request.resolve(message.value);
      else request.reject(new Error(String(message.error || 'capability failed')));
      return;
    }
    if (message.kind === 'abort') { this.#controller.abort(new Error(String(message.reason || 'TEST_PROVIDER_CANCELLED'))); return; }
    if (message.kind === 'cleanup') { await this.#cleanup(message); return; }
    if (message.kind === 'execute') { await this.#execute(); return; }
    await this.#initialize(message);
  }
}

new ProviderChildSession();
console.log = (...values) => send({ kind: 'log', stream: 'stdout', content: `${values.map(String).join(' ')}\n`, encoding: 'utf8' });
console.info = console.log;
console.warn = (...values) => send({ kind: 'log', stream: 'stderr', content: `${values.map(String).join(' ')}\n`, encoding: 'utf8' });
console.error = console.warn;
