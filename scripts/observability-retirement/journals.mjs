import path from 'node:path';
import { digest, identityHash } from './files.mjs';
import { canonicalJson } from '../../skills/nova/core/execution/engine-snapshots.ts';

export function journal(inventory, file) {
  const text = inventory.text(file);
  if (text && !text.endsWith('\n')) throw new Error('JOURNAL_INCOMPLETE');
  const records = text ? text.slice(0, -1).split('\n').map(line => JSON.parse(line)) : [];
  let previousHash = null;
  for (const [index, record] of records.entries()) {
    if (record.sequence !== index + 1 || record.previousHash !== previousHash
      || record.hash !== digest(Buffer.from(JSON.stringify({ sequence: record.sequence, previousHash, entry: record.entry })))) {
      throw new Error('JOURNAL_INTEGRITY_INVALID');
    }
    previousHash = record.hash;
  }
  return records;
}

function inspectEffectResult(inventory, root, result, key) {
  const hash = result?.contentDigest;
  const target = typeof hash === 'string' ? path.join(root, 'effect-results/sha256', hash.slice(7, 9), `${hash.slice(9)}.json`) : '';
  const file = inventory.files.get(target);
  if (!file || file.hash !== hash || file.bytes !== result.bytes) {
    inventory.block('EFFECT_RESULT_REFERENCE_UNKNOWN', identityHash(key)); return null;
  }
  return { path: target, digest: hash, bytes: result.bytes };
}

function inspectEffects(inventory, records, root) {
  const pending = new Set();
  const summaries = [];
  for (const { entry } of records) {
    const key = entry.request?.idempotencyKey ?? entry.receipt?.idempotencyKey;
    if (typeof key !== 'string') { inventory.block('EFFECT_IDENTITY_UNKNOWN', root); continue; }
    if (['requested', 'accepted'].includes(entry.type)) pending.add(key);
    else if (['completed', 'completed-reference'].includes(entry.type)) pending.delete(key);
    else inventory.block('EFFECT_STATE_UNKNOWN', identityHash(key));
    const summary = { idempotencyKeyHash: identityHash(key), type: ['requested', 'accepted', 'completed', 'completed-reference'].includes(entry.type) ? entry.type : 'unknown', result: null };
    summaries.push(summary);
    if (entry.type === 'completed-reference') summary.result = inspectEffectResult(inventory, root, entry.result, key);
  }
  for (const key of pending) inventory.block('EXTERNAL_EFFECT_UNCERTAIN', identityHash(key));
  return summaries;
}

function inspectDeliveries(inventory, records) {
  const latest = new Map();
  for (const { entry } of records) latest.set(entry.deliveryId, entry);
  for (const [id, delivery] of latest) {
    if (delivery.status !== 'completed') inventory.block('OBSERVER_DELIVERY_PENDING', identityHash(id));
  }
}

function requireRunSnapshots(inventory, root) {
  const file = path.join(root, 'run-snapshot.json');
  if (!inventory.files.has(file)) { inventory.block('RUN_SNAPSHOT_MISSING', file); return null; }
  const snapshot = inventory.json(file);
  const { digest: expected, ...unsigned } = snapshot;
  if (snapshot.schemaVersion !== 'run-snapshot.v1' || expected !== digest(Buffer.from(canonicalJson(unsigned)))) throw new Error('RUN_SNAPSHOT_INTEGRITY_INVALID');
  return { path: file, digest: expected };
}

export function inspectRun(inventory, root, runId) {
  const file = path.join(root, 'events.jsonl');
  const snapshot = requireRunSnapshots(inventory, root);
  const events = journal(inventory, file);
  if (!events.length || events.some(({ entry }) => entry.identity?.runId !== runId)) throw new Error('RUN_JOURNAL_IDENTITY_UNKNOWN');
  const lifecycle = events.filter(({ entry }) => entry.schemaVersion === 'lifecycle-event.v2');
  const boundary = lifecycle.filter(({ entry }) => ['run.started', 'run.resumed', 'run.succeeded', 'run.failed', 'run.blocked', 'run.cancelled', 'run.waiting'].includes(entry.type)).at(-1)?.entry.type;
  if (!['run.succeeded', 'run.failed', 'run.cancelled'].includes(boundary)) inventory.block('RUN_ACTIVE_OR_WAITING', runId);
  // Every terminal run still needs an explicit operator decision ending reopening.
  inventory.block('RUN_RETIREMENT_AUTHORIZATION_MISSING', runId);
  const summaries = [];
  let effects = [];
  for (const item of inventory.files.values()) {
    if (path.dirname(item.path) !== root || !item.path.endsWith('.jsonl')) continue;
    const records = item.path === file ? events : journal(inventory, item.path);
    summaries.push({ path: item.path, records: records.length, head: records.at(-1)?.hash ?? null, disposition: 'retain' });
    if (path.basename(item.path) === 'effects.jsonl') effects = inspectEffects(inventory, records, root);
    if (path.basename(item.path) === 'observer-deliveries.jsonl') inspectDeliveries(inventory, records);
  }
  return { runId, root, lifecycle: boundary ?? 'unknown', snapshot, journals: summaries, effects };
}
