import { canonicalJson, sha256Text } from '@kubeclaw/plugin-sdk';

import {
  SIMPLIFICATION_CANDIDATES_EVIDENCE_KIND,
  SIMPLIFICATION_CANDIDATE_MANIFEST_SCHEMA_VERSION,
  type SimplificationCandidateManifest,
} from './simplification-contract.ts';
import { mineSimplificationCandidates, type SimplificationMiningInput } from './simplification-miner.ts';
import { parseSimplificationCandidateManifest } from './simplification-parser.ts';
import { SIMPLIFICATION_REGISTRY_VERSION } from './review-policy-contract.ts';
import type { ReviewBundleEvidence } from './review-bundle-contract.ts';
import type { ResolvedReviewPolicy } from './review-policy-resolver.ts';

export interface CertifiedSimplificationManifest {
  readonly manifest: SimplificationCandidateManifest;
  readonly evidence: ReviewBundleEvidence & { readonly kind: typeof SIMPLIFICATION_CANDIDATES_EVIDENCE_KIND };
}

interface ManifestProof {
  readonly revision: SimplificationMiningInput['revision'];
  readonly policy: ResolvedReviewPolicy;
  readonly digest: `sha256:${string}`;
}

const CERTIFIED_MANIFESTS = new WeakMap<object, ManifestProof>();

export function isCertifiedSimplificationManifest(
  value: unknown,
  revision: SimplificationMiningInput['revision'],
  policy: ResolvedReviewPolicy,
): value is SimplificationCandidateManifest {
  if (!value || typeof value !== 'object') return false;
  const proof = CERTIFIED_MANIFESTS.get(value);
  return proof?.revision === revision && proof.policy === policy
    && Object.isFrozen(value) && sha256Text(canonicalJson(value)) === proof.digest;
}

export function buildSimplificationCandidateManifest(input: SimplificationMiningInput): CertifiedSimplificationManifest | undefined {
  if (!input.policy.policy.simplification.enabled) return undefined;
  const mined = mineSimplificationCandidates(input);
  const parsed = parseSimplificationCandidateManifest({
    schemaVersion: SIMPLIFICATION_CANDIDATE_MANIFEST_SCHEMA_VERSION,
    registryVersion: SIMPLIFICATION_REGISTRY_VERSION,
    revision: input.revision,
    candidates: mined.candidates,
    diagnostics: mined.diagnostics,
  });
  if (!parsed.ok) throw new Error(`plugin-authored Simplification manifest is invalid: ${parsed.error}`);
  const content = canonicalJson(parsed.value);
  const digest = sha256Text(content);
  CERTIFIED_MANIFESTS.set(parsed.value, Object.freeze({
    revision: input.revision, policy: input.policy, digest,
  }));
  return Object.freeze({
    manifest: parsed.value,
    evidence: Object.freeze({ kind: SIMPLIFICATION_CANDIDATES_EVIDENCE_KIND, digest, content }),
  });
}
