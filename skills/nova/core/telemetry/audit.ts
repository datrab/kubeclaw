import fs from 'node:fs';
import path from 'node:path';
import { canonicalJson, sha256Text, type LifecycleEvent, type PluginDomainEvent } from '@kubeclaw/plugin-sdk';
import { FileJournal } from '../state/journal.ts';

const sensitive = /(?:authorization|cookie|password|secret|token|api[_-]?key|credential)/iu;
function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .map(([key, item]) => [key, sensitive.test(key) ? '[redacted]' : redact(item)]));
  return value;
}

/** Rebuild the audit projection from the authoritative, hash-verified journal. */
export function readPipelineAudit(runRoot: string, runId: string) {
  const file = path.join(runRoot, 'events.jsonl');
  if (!fs.existsSync(file)) throw new Error('AUDIT_JOURNAL_MISSING');
  const records = new FileJournal<LifecycleEvent | PluginDomainEvent>(file).records();
  const selected = records.filter(({ entry }) => entry.identity.runId === runId);
  if (!selected.length) throw new Error('AUDIT_RUN_MISSING');
  const events = selected.map(({ entry, hash }) => ({
    eventId: entry.eventId, sequence: entry.sequence, type: entry.type,
    identity: redact(entry.identity), occurredAt: entry.occurredAt, causationId: entry.causationId,
    payload: redact(entry.payload), sourceRecordHash: hash,
  }));
  const audit = { schemaVersion: 'pipeline-audit.v1', runId, journalHead: records.at(-1)!.hash, events };
  return { ...audit, digest: sha256Text(canonicalJson(audit)) };
}
