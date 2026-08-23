import { canonicalJson, sha256Text } from '@kubeclaw/plugin-sdk';

import type { ReviewSnapshotInventory } from './review-snapshot-inventory.ts';

export interface ReviewMapRelation {
  readonly type: string;
  readonly from: string;
  readonly to: string;
  readonly extractor: string;
  readonly confidence: 'exact' | 'derived' | 'uncertain';
  readonly provenance: string;
}

export interface ReviewMapSliceRecord {
  readonly id: string;
  readonly files: readonly string[];
  readonly componentIds: readonly string[];
  readonly digest: string;
}

export interface ReviewMapBoundaryRecord {
  readonly id: string;
  readonly fromSlice: string;
  readonly toSlice: string;
  readonly relationKeys: readonly string[];
  readonly digest: string;
}

interface ReviewMapStreamManifest {
  readonly count: number;
  readonly digest: string;
}

export interface ReviewMapManifest {
  readonly schemaVersion: 'repository-review-map.v1';
  readonly head: string;
  readonly snapshotDigest: string;
  readonly streams: Readonly<Record<'files' | 'relations' | 'exclusions' | 'slices' | 'boundaries', ReviewMapStreamManifest>>;
  readonly digest: string;
}

export interface ReviewMapArtifacts {
  readonly manifest: ReviewMapManifest;
  readonly filesJsonl: string;
  readonly relationsJsonl: string;
  readonly exclusionsJsonl: string;
  readonly slicesJsonl: string;
  readonly boundariesJsonl: string;
}

function lineKey(value: unknown): string { return canonicalJson(value); }
function jsonl(values: readonly unknown[]): string {
  return [...values].map(lineKey).sort().map((line) => `${line}\n`).join('');
}
function stream(value: string): ReviewMapStreamManifest {
  return Object.freeze({ count: value === '' ? 0 : value.split('\n').length - 1, digest: sha256Text(value) });
}

export function relationKey(relation: ReviewMapRelation): string {
  return `${relation.type}\0${relation.from}\0${relation.to}\0${relation.extractor}\0${relation.provenance}\0${relation.confidence}`;
}

export function buildReviewMapArtifacts(
  snapshot: ReviewSnapshotInventory,
  values: {
    readonly relations?: readonly ReviewMapRelation[];
    readonly slices?: readonly ReviewMapSliceRecord[];
    readonly boundaries?: readonly ReviewMapBoundaryRecord[];
  } = {},
): ReviewMapArtifacts {
  const filesJsonl = jsonl(snapshot.files.map(({ exclusionReason: _excluded, ...file }) => file));
  const exclusionsJsonl = jsonl(snapshot.files.filter(({ included }) => !included)
    .map(({ path, role, exclusionReason }) => ({ path, role, reason: exclusionReason })));
  const relationsJsonl = jsonl(values.relations ?? []);
  const slicesJsonl = jsonl(values.slices ?? []);
  const boundariesJsonl = jsonl(values.boundaries ?? []);
  const streams = Object.freeze({
    files: stream(filesJsonl), relations: stream(relationsJsonl), exclusions: stream(exclusionsJsonl),
    slices: stream(slicesJsonl), boundaries: stream(boundariesJsonl),
  });
  const unsigned = {
    schemaVersion: 'repository-review-map.v1' as const,
    head: snapshot.head, snapshotDigest: snapshot.digest, streams,
  };
  const manifest = Object.freeze({ ...unsigned, digest: sha256Text(canonicalJson(unsigned)) });
  return Object.freeze({ manifest, filesJsonl, relationsJsonl, exclusionsJsonl, slicesJsonl, boundariesJsonl });
}

function validateJsonl(name: string, value: string, expected: ReviewMapStreamManifest): void {
  if (sha256Text(value) !== expected.digest) throw new Error(`review map ${name} digest is invalid`);
  if (value !== '' && !value.endsWith('\n')) throw new Error(`review map ${name} is not newline terminated`);
  const lines = value === '' ? [] : value.slice(0, -1).split('\n');
  if (lines.length !== expected.count) throw new Error(`review map ${name} count is invalid`);
  if ([...lines].sort().some((line, index) => line !== lines[index])) throw new Error(`review map ${name} order is invalid`);
  for (const line of lines) if (canonicalJson(JSON.parse(line)) !== line) throw new Error(`review map ${name} line is not canonical`);
}

export function validateReviewMapArtifacts(artifacts: ReviewMapArtifacts): void {
  const { digest: _digest, ...unsigned } = artifacts.manifest;
  if (artifacts.manifest.schemaVersion !== 'repository-review-map.v1'
    || sha256Text(canonicalJson(unsigned)) !== artifacts.manifest.digest) {
    throw new Error('review map manifest is invalid');
  }
  validateJsonl('files', artifacts.filesJsonl, artifacts.manifest.streams.files);
  validateJsonl('relations', artifacts.relationsJsonl, artifacts.manifest.streams.relations);
  validateJsonl('exclusions', artifacts.exclusionsJsonl, artifacts.manifest.streams.exclusions);
  validateJsonl('slices', artifacts.slicesJsonl, artifacts.manifest.streams.slices);
  validateJsonl('boundaries', artifacts.boundariesJsonl, artifacts.manifest.streams.boundaries);
}
