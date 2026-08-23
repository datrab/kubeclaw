#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '../../..');
const core = await import(pathToFileURL(
  path.join(root, 'skills/nova/core/src/index.ts'),
).href);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-plugin-crash-matrix-'));
const pluginRoots = ['common', 'nova', 'buster']
  .map((role) => path.join(root, 'skills', role, 'plugins'));

function schemaValue(schema) {
  if (schema.const !== undefined) return schema.const;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
  const variant = Array.isArray(schema.oneOf) && schema.oneOf.length > 0
    ? schema.oneOf[0]
    : Array.isArray(schema.anyOf) && schema.anyOf.length > 0
      ? schema.anyOf[0]
      : null;
  if (variant) {
    const { oneOf: _oneOf, anyOf: _anyOf, ...base } = schema;
    const mergedProperties = { ...(base.properties ?? {}) };
    for (const [key, value] of Object.entries(variant.properties ?? {})) {
      mergedProperties[key] = {
        ...(base.properties?.[key] ?? {}),
        ...value,
      };
    }
    const merged = {
      ...base,
      ...variant,
      required: [...new Set([...(base.required ?? []), ...(variant.required ?? [])])],
    };
    if (Object.keys(mergedProperties).length > 0) merged.properties = mergedProperties;
    return schemaValue(merged);
  }
  if (schema.default !== undefined) return schema.default;
  if (schema.type === 'null') return null;
  if (schema.type === 'boolean') return false;
  if (schema.type === 'integer' || schema.type === 'number') return schema.minimum ?? 1;
  if (schema.type === 'array') {
    const count = Math.max(schema.minItems ?? 0, 1);
    return Array.from({ length: count }, () => schemaValue(schema.items ?? { type: 'string' }));
  }
  if (schema.type === 'object' || schema.properties) {
    const value = {};
    for (const key of schema.required ?? []) {
      value[key] = schemaValue(schema.properties?.[key] ?? { type: 'string' });
    }
    if ((schema.minProperties ?? 0) > Object.keys(value).length) {
      const entrySchema = typeof schema.additionalProperties === 'object'
        ? schema.additionalProperties
        : Object.values(schema.patternProperties ?? {})[0];
      if (!entrySchema) throw new Error(`LIVE_CRASH_SCHEMA_OBJECT_UNSUPPORTED:${JSON.stringify(schema)}`);
      value.test = schemaValue(entrySchema);
    }
    return value;
  }
  if (schema.type === 'string' || schema.pattern || schema.minLength) {
    const formatCandidates = {
      uri: 'https://example.invalid',
      hostname: 'example.invalid',
      'date-time': '2026-07-28T00:00:00.000Z',
    };
    if (schema.format && formatCandidates[schema.format]) return formatCandidates[schema.format];
    const candidates = [
      'value',
      'redis://127.0.0.1:6379',
      'a'.repeat(64),
      `sha256:${'a'.repeat(64)}`,
      'artifact:test',
      '/tmp/kubeclaw-live-test',
    ];
    const pattern = typeof schema.pattern === 'string' ? new RegExp(schema.pattern) : null;
    const minimum = schema.minLength ?? 1;
    const maximum = schema.maxLength ?? Number.POSITIVE_INFINITY;
    const candidate = candidates.find(
      (entry) => entry.length >= minimum && entry.length <= maximum && (!pattern || pattern.test(entry)),
    );
    if (candidate) return candidate;
    throw new Error(`LIVE_CRASH_SCHEMA_STRING_UNSUPPORTED:${JSON.stringify(schema)}`);
  }
  return {};
}

function referencedValue(entry, schemaName) {
  return schemaValue(JSON.parse(fs.readFileSync(
    path.join(entry.package.root, entry.registration[schemaName]),
    'utf8',
  )));
}

function granted(snapshot, registrationId) {
  return {
    snapshot,
    grants: new Map([[registrationId, []]]),
    selectedProviders: new Map(),
    availableCapabilities: new Map(),
    enabledRegistrations: new Set([registrationId]),
  };
}

function activated(snapshot, surface, key) {
  // ActivatedRegistry normalizes the manifest's stage/observer/adapter export
  // names to one `execute` function; each runtime casts that function to its
  // surface-specific handler or factory contract.
  return {
    snapshot,
    stages: new Map(surface === 'stage' ? [[key, { async execute() {
      throw new Error(`LIVE_TEST_CRASH:${key}`);
    } }]] : []),
    observers: new Map(surface === 'observer' ? [[key, { async execute() {
      throw new Error(`LIVE_TEST_CRASH:${key}`);
    } }]] : []),
    adapters: new Map(surface === 'adapter' ? [[key, { async execute() {
      throw new Error(`LIVE_TEST_CRASH:${key}`);
    } }]] : []),
  };
}

const snapshot = core.buildRegistry(core.discoverPackages({
  installationRoots: pluginRoots,
  trustPolicy: {
    trustedBuiltinRoots: pluginRoots,
    allowedSourceDigests: new Map(),
    verifiedAttestations: new Map(),
    verifierId: 'test:plugin-live-crash-matrix',
  },
  now: () => new Date('2026-07-28T00:00:00Z'),
}));

const evidence = [];
try {
  for (const [stageType, entry] of snapshot.stages) {
    const registrationId = `${entry.package.manifest.id}:${entry.registration.id}`;
    const runtime = granted(snapshot, registrationId);
    const journal = new core.FileJournal(path.join(
      temporary,
      `${entry.package.manifest.id}-${entry.registration.id}-stage.jsonl`,
    ));
    const runner = new core.PipelineRunner({
      definition: {
        schemaVersion: 'pipeline-definition.v2',
        id: `pipeline:crash:${entry.package.manifest.id}:${entry.registration.id}`,
        maxConcurrency: 1,
        stages: [{
          id: 'subject',
          type: stageType,
          dependsOn: [],
          config: referencedValue(entry, 'configSchema'),
          input: referencedValue(entry, 'inputSchema'),
          execution: { maxAttempts: 1, maxRemediationCycles: 0, timeoutMs: 1000 },
        }],
      },
      registry: runtime,
      activated: activated(snapshot, 'stage', stageType),
      adapters: { async invoke() { throw new Error('UNEXPECTED_CAPABILITY_INVOCATION'); } },
      journal,
      orchestratorIssuerId: 'test:plugin-live-crash-matrix',
    });
    const result = await runner.run(`run:crash:${entry.package.manifest.id}:${entry.registration.id}`);
    assert.equal(result.status, 'blocked', registrationId);
    const completed = journal.records().findLast(({ entry: event }) => event.type === 'attempt.completed');
    assert.equal(completed?.entry.payload.reason?.code, 'core.plugin_runtime_failed', registrationId);
    evidence.push({ registrationId, surface: 'stage', contained: true });
  }

  for (const [observerId, entry] of snapshot.observers) {
    const events = new core.FileJournal(path.join(temporary, `${observerId}-events.jsonl`));
    events.append({
      schemaVersion: 'lifecycle-event.v2',
      eventId: `event:${observerId}`,
      sequence: 1,
      type: entry.registration.subscriptions[0],
      identity: { runId: `run:${observerId}` },
      occurredAt: '2026-07-28T00:00:00.000Z',
      causationId: null,
      payload: {},
    });
    const observerEntry = {
      ...entry,
      registration: {
        ...entry.registration,
        failurePolicy: {
          ...entry.registration.failurePolicy,
          mode: 'best_effort',
          maxAttempts: 1,
          backoffMs: 0,
        },
      },
    };
    const observerSnapshot = { ...snapshot, observers: new Map([[observerId, observerEntry]]) };
    const runtime = new core.ObserverRuntime({
      registry: granted(observerSnapshot, observerId),
      activated: activated(observerSnapshot, 'observer', observerId),
      adapters: { async invoke() { throw new Error('UNEXPECTED_CAPABILITY_INVOCATION'); } },
      events,
      checkpoints: new core.FileJournal(path.join(temporary, `${observerId}-checkpoints.jsonl`)),
      deliveries: new core.FileJournal(path.join(temporary, `${observerId}-deliveries.jsonl`)),
      configs: new Map([[observerId, referencedValue(entry, 'configSchema')]]),
      wait: async () => {},
    });
    const result = await runtime.drain();
    assert.equal(result.delivered, 0, observerId);
    assert.equal(result.failures.length, 1, observerId);
    assert.match(result.failures[0].error, /LIVE_TEST_CRASH/, observerId);
    evidence.push({ registrationId: observerId, surface: 'observer', contained: true });
  }

  for (const [adapterId, entry] of snapshot.adapters) {
    const adapterEntry = {
      ...entry,
      registration: { ...entry.registration, requiredCapabilities: [] },
    };
    const adapterSnapshot = { ...snapshot, adapters: new Map([[adapterId, adapterEntry]]) };
    const runtime = new core.AdapterRuntime({
      granted: granted(adapterSnapshot, adapterId),
      activated: activated(adapterSnapshot, 'adapter', adapterId),
      configs: new Map([[adapterId, referencedValue(entry, 'configSchema')]]),
      effects: new core.EffectCoordinator(
        new core.MemoryEffectJournal(),
        undefined,
        undefined,
        new core.MemoryResourceLockManager(),
      ),
      shutdownTimeoutMs: 1000,
      async emitDomainEvent() {},
    });
    await assert.rejects(runtime.start(), new RegExp(`LIVE_TEST_CRASH:${adapterId}`), adapterId);
    await runtime.shutdown();
    evidence.push({ registrationId: adapterId, surface: 'adapter', contained: true });
  }
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}

const expectedRegistrations = snapshot.stages.size
  + snapshot.observers.size
  + snapshot.adapters.size;
assert.equal(evidence.length, expectedRegistrations);
console.log(JSON.stringify({
  ok: true,
  gate: 'plugin-live-crash-matrix',
  registrations: evidence,
  count: evidence.length,
}));
