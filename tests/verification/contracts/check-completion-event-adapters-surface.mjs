import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'contracts/check-completion-event-adapters-surface' });
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';

function parseArgs(argv = process.argv.slice(2)) {
  const args = { sourceRoot: process.cwd() };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--source-root') args.sourceRoot = path.resolve(argv[i + 1]);
  }
  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntil(predicate, { timeoutMs = 1000, intervalMs = 5, message = 'condition not met' } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (predicate()) return;
    await sleep(intervalMs);
  }
  throw new Error(message);
}

const { sourceRoot } = parseArgs();
const adapterPath = path.join(sourceRoot, 'skills/nova/pipeline/services/completion-event-adapters.ts');
const eventContractPath = path.join(sourceRoot, 'skills/common/pipeline/services/pipeline-event-contract.ts');
const adapterSource = fs.readFileSync(adapterPath, 'utf8');

assert.equal(adapterSource.includes('export function createRedisCompletionEventAdapter('), true, 'Redis completion event adapter factory must be exported');
assert.equal(adapterSource.includes('export function createDedicatedRedisCompletionClient('), true, 'Redis completion adapter must own dedicated client construction');
assert.equal(adapterSource.includes('loadDedicatedRedisCompletionCtor'), false, 'Redis completion adapter must not keep wrapper-only constructor loaders');
assert.equal(adapterSource.includes('createRedisClient(RedisCtor'), true, 'Redis completion adapter must instantiate clients through the shared secure Redis transport contract');
assert.equal(adapterSource.includes("client.xread('BLOCK'"), true, 'Redis completion adapter must use blocking XREAD');
assert.equal(adapterSource.includes("type: 'completion.evidence'"), true, 'Redis completion adapter must emit completion.evidence events');
assert.equal(adapterSource.includes('fallbackIdentity'), false, 'Redis completion adapter must not backfill completion event identity from active wait context');
assert.equal(adapterSource.includes('baseIdentity'), false, 'Redis completion adapter must derive event identity only from the Redis completion entry');
assert.equal(adapterSource.includes('isIntentionalAbortRedisError(error, signal)'), true, 'Redis completion adapter must silence intentional abort connection errors');
assert.equal(adapterSource.includes('export function createLocalEvidenceEventAdapter('), true, 'local evidence adapter factory must be exported');
assert.equal(adapterSource.includes('fs.watch('), true, 'local evidence adapter must use fs.watch');
assert.equal(adapterSource.includes('DEFAULT_LOCAL_EVIDENCE_DEBOUNCE_MS = 100'), true, 'local evidence adapter must default to a 100ms debounce');
assert.equal(adapterSource.includes("type: 'local.evidence.updated'"), true, 'local evidence adapter must emit local.evidence.updated events');
assert.equal(adapterSource.includes('watcher.close()'), true, 'local evidence adapter stop must close watchers');
assert.equal(adapterSource.includes('clearTimeout(timer)'), true, 'local evidence adapter stop must clear debounce timers');

const adapters = await import(pathToFileURL(adapterPath).href);
const eventContract = await import(pathToFileURL(eventContractPath).href);

{
  const instances = [];
  class FakeRedis {
    constructor(options) {
      this.options = options;
      this.calls = [];
      this.disconnected = false;
      instances.push(this);
    }

    on() {}

    async xread(...args) {
      this.calls.push(args);
      if (this.calls.length === 1) {
        return [[
          'swarm:pipeline:adapter-test:completions',
          [[
            '1-0',
            [
              'schema_version', 'v1',
              'type', 'completion',
              'stream_role', 'completion',
              'project', 'adapter-test',
              'target_kind', 'module',
              'target_id', '01',
              'module', '01',
              'run_id', 'run-adapter',
              'attempt', '2',
              'dispatch_id', 'dispatch-adapter',
              'session_key', 'agent:main:acp:adapter',
              'source', 'buster-pipeline',
              'status', 'PASS',
              'outcome', 'PASS',
              'summary', 'passed',
            ],
          ]],
        ]];
      }
      return new Promise((_resolve, reject) => { this.rejectBlocked = reject; });
    }

    disconnect() {
      this.disconnected = true;
      if (this.rejectBlocked) this.rejectBlocked(new Error('Connection is closed.'));
    }
  }

  const bus = eventContract.createPipelineEventBus();
  const waitController = new AbortController();
  const waiter = bus.waitForEvent('completion.evidence', {
    module_id: '01',
    run_id: 'run-adapter',
    attempt: '2',
    dispatch_id: 'dispatch-adapter',
  }, { signal: waitController.signal, timeoutMs: 1000 });

  const primaryRedisClient = { shared: true };
  const adapter = adapters.createRedisCompletionEventAdapter({ project: 'adapter-test' }, {
    eventBus: bus,
    RedisCtor: FakeRedis,
    primaryRedisClient,
    blockMs: 0,
    redisHost: '127.0.0.1',
    enforceSecureMode: false,
  });
  const done = adapter.start();
  const event = await waiter;

  assert.equal(instances.length, 1, 'adapter should create exactly one dedicated Redis client');
  assert.notEqual(instances[0], primaryRedisClient, 'adapter must not share a primary Redis client');
  assert.deepEqual(instances[0].calls[0], ['BLOCK', '0', 'STREAMS', 'swarm:pipeline:adapter-test:completions', '$']);
  assert.equal(instances[0].options.host, '127.0.0.1', 'explicit local verification Redis host should be passed through the shared transport contract');
  assert.equal(instances[0].options.maxRetriesPerRequest, null, 'dedicated Redis client should disable per-request retry exhaustion for blocking reads');
  assert.equal(instances[0].options.enableReadyCheck, true, 'dedicated Redis client should keep normal ready checks');
  assert.equal(event.type, 'completion.evidence');
  assert.equal(event.source, 'redis');
  assert.equal(event.identity.module_id, '01');
  assert.equal(event.identity.run_id, 'run-adapter');
  assert.equal(event.payload.redis_id, '1-0');
  assert.equal(event.payload.entry.status, 'PASS');

  await waitUntil(() => instances[0].calls.length >= 2, {
    message: 'Redis adapter should issue a second blocking XREAD after emitting the first completion event',
  });
  assert.deepEqual(instances[0].calls[1], ['BLOCK', '0', 'STREAMS', 'swarm:pipeline:adapter-test:completions', '1-0']);

  adapter.stop('test_complete');
  await done;
  assert.equal(instances[0].disconnected, true, 'adapter stop should disconnect the dedicated Redis client to unblock XREAD');
  assert.equal(bus.listenerCount(), 0, 'Redis adapter event wait should not leave bus listeners behind');
}

{
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'completion-event-adapter-'));
  const evidenceDir = path.join(tempRoot, '.swarm', 'modules', '01');
  const evidencePath = path.join(evidenceDir, 'buster-output.json');
  fs.mkdirSync(evidenceDir, { recursive: true });

  const bus = eventContract.createPipelineEventBus();
  let localEventCount = 0;
  const rawEmit = bus.emit.bind(bus);
  bus.emit = (event) => {
    if (event?.type === 'local.evidence.updated') localEventCount += 1;
    return rawEmit(event);
  };
  const adapter = adapters.createLocalEvidenceEventAdapter({}, {
    eventBus: bus,
    paths: [evidencePath],
    identity: { module_id: '01', run_id: 'run-local' },
    debounceMs: 50,
  });
  const started = adapter.start();
  assert.equal(started.watching, 1, 'local adapter should watch the parent directory for a missing leaf file');
  assert.equal(adapter.watcherCount, 1);

  const waitController = new AbortController();
  const waiter = bus.waitForEvent('local.evidence.updated', {
    module_id: '01',
    run_id: 'run-local',
  }, { signal: waitController.signal, timeoutMs: 1000 });

  fs.writeFileSync(evidencePath, JSON.stringify({ status: 'PASS', summary: 'first' }));
  fs.writeFileSync(evidencePath, JSON.stringify({ status: 'PASS', summary: 'second' }));

  const event = await waiter;
  assert.equal(event.type, 'local.evidence.updated');
  assert.equal(event.source, 'local_fs');
  assert.deepEqual(event.identity, { module_id: '01', run_id: 'run-local' });
  assert.equal(event.payload.debounce_ms, 50);
  assert.equal(event.payload.paths.includes(evidencePath), true);
  assert.equal(event.payload.watched_paths.includes(evidencePath), true);
  await sleep(125);
  assert.equal(localEventCount, 1, 'local adapter should debounce burst writes into one emitted event');

  adapter.stop('test_complete');
  assert.equal(adapter.watcherCount, 0, 'local adapter stop should close watchers');
  assert.equal(bus.listenerCount(), 0, 'local adapter event wait should not leave bus listeners behind');
  fs.writeFileSync(evidencePath, JSON.stringify({ status: 'PASS', summary: 'after stop' }));
  await sleep(125);
  assert.equal(localEventCount, 1, 'stopped local adapter should not emit events after watcher cleanup');
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

{
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'completion-event-adapter-stop-'));
  const evidenceDir = path.join(tempRoot, '.swarm', 'modules', '02');
  const evidencePath = path.join(evidenceDir, 'buster-output.json');
  fs.mkdirSync(evidenceDir, { recursive: true });
  const bus = eventContract.createPipelineEventBus();
  let emitted = false;
  const rawEmit = bus.emit.bind(bus);
  bus.emit = (event) => {
    if (event?.type === 'local.evidence.updated') emitted = true;
    return rawEmit(event);
  };
  const adapter = adapters.createLocalEvidenceEventAdapter({}, {
    eventBus: bus,
    paths: [evidencePath],
    identity: { module_id: '02', run_id: 'run-stop' },
    debounceMs: 100,
  });
  adapter.start();
  fs.writeFileSync(evidencePath, JSON.stringify({ status: 'PASS', summary: 'pending' }));
  adapter.stop('before_debounce_fires');
  await sleep(150);
  assert.equal(adapter.watcherCount, 0, 'local adapter stop should close watchers even with a pending debounce');
  assert.equal(emitted, false, 'local adapter stop should clear pending debounce events');
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

quietConsole.restore();
console.log(JSON.stringify({ ok: true, checked: 48 }));
