import { registerHooks } from 'node:module';
registerHooks({ load(url, context, next) {
  const result = next(url, context);
  if (!url.endsWith('/skills/worker/core/worker/native-cleanup-reconciliation.ts')) return result;
  const source = String(result.source);
  const target = 'if (recovered.resultDigest !== result.resultDigest)';
  if (!source.includes(target)) throw new Error('MUTATION_TARGET_MISSING');
  return { ...result, source: source.replace(target, 'if (false)') };
} });
