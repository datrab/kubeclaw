import { canonicalJson, sha256Text } from '@kubeclaw/plugin-sdk';

export function streamIdentity(prefix: string, kind: 'publisher' | 'telemetry', target: string, idempotencyKey: string): { stream: string; dedup: string } {
  if (!target || !target.isWellFormed()) throw new Error('REDIS_TARGET_INVALID');
  const stream = `${prefix}:v2:${kind}:${encodeURIComponent(target)}`;
  const dedup = `${stream}:dedup:${sha256Text(canonicalJson(idempotencyKey)).slice(7)}`;
  return { stream, dedup };
}
