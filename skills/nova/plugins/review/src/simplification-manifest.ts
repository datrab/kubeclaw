import { PORTABLE_JSON_ENCODING, sha256Text } from '@kubeclaw/plugin-sdk';
import { reviewSemanticJson, type ReviewSemanticEncoding } from './review-semantics.ts';

import {
  SIMPLIFICATION_CANDIDATES_EVIDENCE_KIND,
  SIMPLIFICATION_CANDIDATE_MANIFEST_SCHEMA_VERSION,
  type SimplificationCandidateManifest,
} from './simplification-contract.ts';
import { mineSimplificationCandidates, type SimplificationMiningInput } from './simplification-miner.ts';
import { parseSimplificationCandidateManifest } from './simplification-parser.ts';
import { SIMPLIFICATION_REGISTRY_VERSION } from './review-policy-contract.ts';
import type { ReviewBundleEvidence } from './review-bundle-contract.ts';
import { assertVerifiedReviewPolicy, isVerifiedReviewPolicy, type ResolvedReviewPolicy } from './review-policy-resolver.ts';

export interface CertifiedSimplificationManifest {
  readonly manifest: SimplificationCandidateManifest;
  readonly evidence: ReviewBundleEvidence & { readonly kind: typeof SIMPLIFICATION_CANDIDATES_EVIDENCE_KIND };
}

interface ManifestProof {
  readonly encoding: ReviewSemanticEncoding | undefined;
  readonly revision: SimplificationMiningInput['revision'];
  readonly policy: ResolvedReviewPolicy;
  readonly digest: `sha256:${string}`;
}

const CERTIFIED_MANIFESTS = new WeakMap<object, ManifestProof>();

export function isCertifiedSimplificationManifest(
  value: unknown,
  revision: SimplificationMiningInput['revision'],
  policy: ResolvedReviewPolicy,
  encoding?: ReviewSemanticEncoding,
): value is SimplificationCandidateManifest {
  if (!value || typeof value !== 'object') return false;
  const proof = CERTIFIED_MANIFESTS.get(value);
  return proof?.revision === revision && proof.policy === policy && proof.encoding === encoding
    && isVerifiedReviewPolicy(policy, encoding)
    && Object.isFrozen(value) && sha256Text(reviewSemanticJson(value, encoding)) === proof.digest;
}

export function buildSimplificationCandidateManifest(input: SimplificationMiningInput, encoding?: ReviewSemanticEncoding): CertifiedSimplificationManifest | undefined {
  assertVerifiedReviewPolicy(input.policy, encoding);
  if (!input.policy.policy.simplification.enabled) return undefined;
  const mined = mineSimplificationCandidates(input, encoding);
  const parsed = parseSimplificationCandidateManifest({
    schemaVersion: SIMPLIFICATION_CANDIDATE_MANIFEST_SCHEMA_VERSION,
    registryVersion: SIMPLIFICATION_REGISTRY_VERSION,
    revision: input.revision,
    candidates: mined.candidates,
    diagnostics: mined.diagnostics,
  });
  if (!parsed.ok) throw new Error(`plugin-authored Simplification manifest is invalid: ${parsed.error}`);
  const content = reviewSemanticJson(parsed.value, encoding);
  const digest = sha256Text(content);
  CERTIFIED_MANIFESTS.set(parsed.value, Object.freeze({
    revision: input.revision, policy: input.policy, digest, encoding,
  }));
  return Object.freeze({
    manifest: parsed.value,
    evidence: Object.freeze({ kind: SIMPLIFICATION_CANDIDATES_EVIDENCE_KIND, digest, content,
      ...(encoding === undefined ? {} : { encoding: PORTABLE_JSON_ENCODING }) }),
  });
}
