import { canonicalJson, sha256Text } from '@kubeclaw/plugin-sdk';

export interface ReviewRuntimeIdentity {
  readonly targetId: string;
  readonly runtime: 'acp' | 'subagent';
  readonly agentId: string;
  readonly model: string;
  readonly thinking: string;
}

export interface ReviewRuntimeAttestation extends ReviewRuntimeIdentity {
  readonly schemaVersion: 'runtime-agent-attestation.v1';
  readonly identityDigest: `sha256:${string}`;
}

export class ReviewRuntimeAttestationError extends Error {}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() === value && value.length > 0 ? value : undefined;
}

export function reviewRuntimeIdentityDigest(value: ReviewRuntimeIdentity): `sha256:${string}` {
  return sha256Text(canonicalJson(value));
}

// eslint-disable-next-line complexity -- Attestation parsing checks every identity field before one fail-closed return.
export function parseReviewRuntimeAttestation(value: unknown): ReviewRuntimeAttestation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ReviewRuntimeAttestationError('review runtime attestation is missing');
  }
  const record = value as Readonly<Record<string, unknown>>;
  const fields = ['schemaVersion', 'targetId', 'runtime', 'agentId', 'model', 'thinking', 'identityDigest'];
  if (Object.keys(record).some((key) => !fields.includes(key))
    || record.schemaVersion !== 'runtime-agent-attestation.v1'
    || !['acp', 'subagent'].includes(String(record.runtime))) {
    throw new ReviewRuntimeAttestationError('review runtime attestation is invalid');
  }
  const identity: ReviewRuntimeIdentity = {
    targetId: text(record.targetId) ?? '', runtime: record.runtime as ReviewRuntimeIdentity['runtime'],
    agentId: text(record.agentId) ?? '', model: text(record.model) ?? '', thinking: text(record.thinking) ?? '',
  };
  if (Object.values(identity).some((entry) => !entry)
    || record.identityDigest !== reviewRuntimeIdentityDigest(identity)) {
    throw new ReviewRuntimeAttestationError('review runtime attestation identity is invalid');
  }
  return Object.freeze({ schemaVersion: 'runtime-agent-attestation.v1', ...identity,
    identityDigest: record.identityDigest as `sha256:${string}` });
}

export function assertReviewRuntimeIdentity(
  attestation: ReviewRuntimeAttestation, expected: ReviewRuntimeIdentity,
): void {
  if (attestation.identityDigest !== reviewRuntimeIdentityDigest(expected)) {
    throw new ReviewRuntimeAttestationError('review runtime attestation does not match the configured reviewer identity');
  }
}
