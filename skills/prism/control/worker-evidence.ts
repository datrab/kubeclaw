import { validateEngineResult } from '@kubeclaw/prism-contracts-v1';
import { acceptWorkerResult, type PrismWorkerAttempt, type PrismWorkerResult } from './worker-results.ts';
import { artifactLocation, type WorkerArtifactClient } from '../server/worker-artifacts.ts';

/** Full binding is checked before the first evidence read, including cache replay. */
export async function hydrateWorkerResult(attempt: PrismWorkerAttempt, raw: unknown,
  artifacts: WorkerArtifactClient): Promise<{ result: PrismWorkerResult; values: Record<string, unknown> }> {
  const result = acceptWorkerResult(attempt, raw);
  const values: Record<string, unknown> = { ...result.specialistResult!.values };
  const seen = new Set<string>();
  let total = 0;
  if (result.evidence.length > attempt.limits.evidenceFiles) throw new Error('PRISM_WORKER_EVIDENCE_FILE_LIMIT');
  const plans = result.evidence.map((item) => {
    if (seen.has(item.evidenceId)) throw new Error('PRISM_WORKER_EVIDENCE_DUPLICATE');
    seen.add(item.evidenceId); total += item.artifact.sizeBytes;
    if (total > attempt.limits.evidenceBytes) throw new Error('PRISM_WORKER_EVIDENCE_BYTE_LIMIT');
    const policy = evidencePolicy(item.evidenceId, String(attempt.operation.values.operation));
    if (item.type !== policy.type || item.artifact.type !== policy.type || item.artifact.mediaType !== policy.mediaType) {
      throw new Error('PRISM_WORKER_EVIDENCE_MEDIA_MISMATCH');
    }
    if (policy.field && policy.field in values) throw new Error('PRISM_WORKER_EVIDENCE_VALUE_CONFLICT');
    artifactLocation(item.artifact, artifacts.origin);
    return { item, policy };
  });
  if (!seen.has('prism-full-log')) throw new Error('PRISM_WORKER_FULL_LOG_MISSING');
  for (const { item, policy } of plans) {
    const bytes = await artifacts.read(item.artifact, AbortSignal.timeout(attempt.limits.cleanupTimeoutMs));
    if (policy.field) values[policy.field] = policy.field === 'screenshotBase64' ? bytes.toString('base64') : new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  }
  validateEngineResult(String(attempt.operation.values.operation), values);
  return { result, values };
}
function evidencePolicy(id: string, operation: string): { type: string; mediaType: string; field?: string } {
  if (id === 'prism-full-log') return { type: 'log', mediaType: 'text/plain' };
  if (operation === 'render' && id === 'render-screenshot') return { type: 'preview', mediaType: 'image/png', field: 'screenshotBase64' };
  if (operation === 'render' && id === 'render-aria') return { type: 'accessibility-tree', mediaType: 'text/plain', field: 'ariaSnapshot' };
  throw new Error(`PRISM_WORKER_EVIDENCE_UNSUPPORTED:${id}`);
}
