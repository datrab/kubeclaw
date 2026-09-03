import { sha256Text, type StageResult } from '@kubeclaw/plugin-sdk';

const MAX_REASON_MESSAGE_LENGTH = 4096;
const TRUNCATION_SUFFIX_RESERVE = 96;

export function blockedReviewStage(code: string, message: string): StageResult {
  if (message.length <= MAX_REASON_MESSAGE_LENGTH) {
    return { schemaVersion: 'stage-result.v2', outcome: 'blocked', reason: { code, message }, artifacts: [] };
  }
  const digest = sha256Text(message);
  const suffix = `\n[truncated; full message digest ${digest}]`;
  const prefixLength = Math.min(MAX_REASON_MESSAGE_LENGTH - suffix.length,
    MAX_REASON_MESSAGE_LENGTH - TRUNCATION_SUFFIX_RESERVE);
  return { schemaVersion: 'stage-result.v2', outcome: 'blocked', reason: {
    code, message: `${message.slice(0, prefixLength).trimEnd()}${suffix}`,
    details: { truncated: true, originalLength: message.length, fullMessageDigest: digest },
  }, artifacts: [] };
}
