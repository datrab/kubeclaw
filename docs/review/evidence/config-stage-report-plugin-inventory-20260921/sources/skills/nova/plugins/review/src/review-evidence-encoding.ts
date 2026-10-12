import { canonicalJson, portableJson, PORTABLE_JSON_ENCODING } from '@kubeclaw/plugin-sdk';

export function reviewEvidenceEncoding(value: unknown): typeof PORTABLE_JSON_ENCODING | undefined {
  if (value !== undefined && value !== PORTABLE_JSON_ENCODING) throw new Error('review evidence encoding is unsupported');
  return value;
}

/** Untagged evidence retains its exact historical canonicalization contract. */
export function reviewEvidenceJson(value: unknown, encoding?: unknown): string {
  return reviewEvidenceEncoding(encoding) === PORTABLE_JSON_ENCODING ? portableJson(value) : canonicalJson(value);
}
