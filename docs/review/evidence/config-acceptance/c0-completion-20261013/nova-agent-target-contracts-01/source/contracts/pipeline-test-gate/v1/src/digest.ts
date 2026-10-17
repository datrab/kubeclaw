import crypto from 'node:crypto';
import { canonicalJson } from '@kubeclaw/pipeline-observability-contract/canonical-json';

export function remotePlanDigest(value: unknown): string {
  return `sha256:${crypto.createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}
