import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { stableJson } from './observability-contract.ts';

type ArtifactConfig = {
  _runId?: string;
  run_id?: string;
  pipeline_dir?: string;
  paths?: {
    swarm_dir?: string;
  };
  _emitCanonicalEvidence?: (type: string, value: unknown, options: { sourceEventId: string }) => unknown;
};

type ArtifactInput = {
  logical_id: string;
  kind: string;
  media_type: string;
  bytes?: string | Uint8Array;
  encoding?: BufferEncoding;
  content_class?: string;
  producer: string;
  correlation?: unknown;
  completeness?: string;
  original_byte_length?: number;
  original_sha256?: string;
  transformation?: unknown;
};

type ArtifactPaths = Record<'root' | 'blobs' | 'catalog' | 'quarantine' | 'manifest' | 'closure' | 'archive' | 'health' | 'evaluation', string>;
type ArtifactRecord = Record<string, unknown>;

const COMPLETENESS_VALUES = new Set(['full', 'truncated', 'summarized', 'transformed', 'unavailable', 'reference_only']);

function required(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required`);
  return value.trim();
}

function appendJsonl(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(value)}\n`, { encoding: 'utf8', mode: 0o600 });
}

function writeAtomic(file: string, value: string | Uint8Array): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, value, { mode: 0o600 });
  fs.renameSync(temporary, file);
}

function readJsonLines(file: string): ArtifactRecord[] {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

export function runEvidenceRoot(config: ArtifactConfig): string {
  const runId = required(config._runId ?? config.run_id, 'run_id');
  const pipelineDirectory = config.pipeline_dir
    ? required(config.pipeline_dir, 'pipeline log directory')
    : path.join(required(config.paths?.swarm_dir, 'swarm directory'), 'logs', 'pipeline');
  return path.join(pipelineDirectory, 'runs', runId);
}

export function artifactPaths(config: ArtifactConfig): ArtifactPaths {
  const root = runEvidenceRoot(config);
  return {
    root,
    blobs: path.join(root, 'blobs', 'sha256'),
    catalog: path.join(root, 'artifacts.jsonl'),
    quarantine: path.join(root, 'quarantine.jsonl'),
    manifest: path.join(root, 'run-manifest.json'),
    closure: path.join(root, 'terminal-closure.json'),
    archive: path.join(root, 'archive-manifest.json'),
    health: path.join(root, 'producer-health.json'),
    evaluation: path.join(root, 'evaluation-facts.jsonl'),
  };
}

function artifactBytes(input: ArtifactInput): Buffer {
  if (Buffer.isBuffer(input.bytes)) return input.bytes;
  if (input.bytes instanceof Uint8Array) return Buffer.from(input.bytes);
  return Buffer.from(input.bytes ?? '', input.encoding ?? 'utf8');
}

function validateCompleteness(input: ArtifactInput): string {
  const completeness = input.completeness ?? 'full';
  if (!COMPLETENESS_VALUES.has(completeness)) throw new Error(`invalid artifact completeness: ${completeness}`);
  if (completeness === 'full' && input.transformation) {
    throw new Error('full artifact evidence cannot declare transformation');
  }
  return completeness;
}

function buildArtifactRecord(input: ArtifactInput, bytes: Buffer, hash: string, reference: string): ArtifactRecord {
  const logicalId = required(input.logical_id, 'logical_id');
  return {
    schema_version: 'artifact_published.v1',
    artifact_id: `artifact_${crypto.createHash('sha256').update(`${logicalId}\0${hash}`).digest('hex')}`,
    logical_id: logicalId,
    kind: required(input.kind, 'kind'),
    media_type: required(input.media_type, 'media_type'),
    byte_length: bytes.length,
    sha256: hash,
    content_class: required(input.content_class ?? 'artifact', 'content_class'),
    producer: required(input.producer, 'producer'),
    reference,
    correlation: input.correlation,
    completeness: validateCompleteness(input),
    original_byte_length: input.original_byte_length ?? bytes.length,
    original_sha256: input.original_sha256 ?? hash,
    transformation: input.transformation ?? null,
    published_at: new Date().toISOString(),
  };
}

export function publishArtifact(config: ArtifactConfig, input: ArtifactInput): ArtifactRecord {
  const paths = artifactPaths(config);
  const bytes = artifactBytes(input);
  const hash = crypto.createHash('sha256').update(bytes).digest('hex');
  const target = path.join(paths.blobs, hash.slice(0, 2), hash.slice(2));
  if (!fs.existsSync(target)) writeAtomic(target, bytes);
  const record = buildArtifactRecord(input, bytes, hash, path.relative(paths.root, target).split(path.sep).join('/'));
  const existing = readJsonLines(paths.catalog).find((item) => item.artifact_id === record.artifact_id);
  if (existing) return existing;
  appendJsonl(paths.catalog, record);
  if (config._emitCanonicalEvidence) {
    void Promise.resolve(config._emitCanonicalEvidence('artifact.published', record, {
      sourceEventId: `artifact/${record.artifact_id}`,
    }));
  }
  return record;
}

export function quarantinePayload(config: ArtifactConfig, input: Record<string, unknown>): ArtifactRecord {
  const record = {
    schema_version: 'quarantined_payload.v1',
    quarantine_id: `quarantine_${crypto.randomUUID()}`,
    quarantined_at: new Date().toISOString(),
    reason_code: required(input.reason_code, 'reason_code'),
    producer: required(input.producer, 'producer'),
    identity: input.identity ?? null,
    original_byte_length: input.original_byte_length ?? null,
    original_sha256: input.original_sha256 ?? null,
  };
  appendJsonl(artifactPaths(config).quarantine, record);
  return record;
}

export function canonicalFingerprint(value: unknown): string {
  return crypto.createHash('sha256').update(stableJson(value)).digest('hex');
}

export function verifyArtifactCatalog(config: ArtifactConfig): { ok: boolean; count: number; errors: ArtifactRecord[] } {
  const paths = artifactPaths(config);
  const errors: ArtifactRecord[] = [];
  const entries = readJsonLines(paths.catalog);
  for (const item of entries) {
    const target = path.resolve(paths.root, String(item.reference));
    if (!target.startsWith(`${path.resolve(paths.root)}${path.sep}`) || !fs.existsSync(target)) {
      errors.push({ artifact_id: item.artifact_id, reason: 'missing' });
      continue;
    }
    const bytes = fs.readFileSync(target);
    const hash = crypto.createHash('sha256').update(bytes).digest('hex');
    if (hash !== item.sha256 || bytes.length !== item.byte_length) {
      errors.push({ artifact_id: item.artifact_id, reason: 'corrupt' });
    }
  }
  return { ok: errors.length === 0, count: entries.length, errors };
}

export function writeCanonicalJson(file: string, value: unknown): string {
  writeAtomic(file, `${JSON.stringify(value, null, 2)}\n`);
  return file;
}
