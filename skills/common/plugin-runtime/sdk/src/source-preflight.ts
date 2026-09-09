import {canonicalJson, sha256Text} from './values.ts';
import type { PluginInvocationContext } from './runtime.ts';
import { parseReviewSubject } from './review-subject.ts';
import { readBoundArtifact } from './source-approval.ts';

export interface SourceBinding {
  readonly stageId: string;
  readonly inputDigest: string;
  readonly reviewStageId?: string;
}

export function parseSourceBinding(value: unknown): SourceBinding {
  const binding = value as SourceBinding | undefined;
  if (!binding || Object.keys(binding).some(key => !['stageId', 'inputDigest', 'reviewStageId'].includes(key))
    || typeof binding.stageId !== 'string' || !binding.stageId
    || typeof binding.inputDigest !== 'string' || !/^sha256:[a-f0-9]{64}$/u.test(binding.inputDigest)
    || (binding.reviewStageId !== undefined && (typeof binding.reviewStageId !== 'string' || !binding.reviewStageId))) {
    throw new Error('SOURCE_PREFLIGHT_BINDING_INVALID');
  }
  return binding;
}

/** Only the explicitly selected, immutable ancestor result establishes source admission. */
export async function sourcePreflight(value: unknown, context: PluginInvocationContext) {
  const binding = parseSourceBinding(value);
  const artifacts = context.contract.artifacts.filter(item => item.namespace === 'kubeclaw.preflight-contract'
    && item.artifactId === 'source-preflight' && item.producer.stageId === binding.stageId
    && item.producer.runId === context.contract.lease.attempt.runId);
  const attempt = Math.max(...artifacts.map(item => item.producer.attemptNumber));
  const candidates = artifacts.filter(item => item.producer.attemptNumber === attempt);
  if (candidates.length !== 1) throw new Error('SOURCE_PREFLIGHT_REQUIRED');
  const result = await readBoundArtifact(candidates[0]!, context);
  if (result.schemaVersion !== 'source-preflight.v1' || result.outcome !== 'passed') throw new Error('SOURCE_PREFLIGHT_FAILED');
  const subject = parseReviewSubject(result.subject, context.contract.lease.attempt.runId);
  if (subject.inputDigest !== binding.inputDigest || sha256Text(canonicalJson(result.contract)) !== subject.inputDigest) throw new Error('SOURCE_PREFLIGHT_INPUT_MISMATCH');
  return { binding, subject, contract: result.contract as Readonly<Record<string, unknown>> };
}
