import { registerHooks } from 'node:module';
registerHooks({ load(url, context, nextLoad) {
  const result = nextLoad(url, context);
  if (!url.endsWith('/skills/worker/core/worker/ownership-children.ts')) return result;
  const source = String(result.source);
  const marker = 'export function validateChildLimits(value: unknown): asserts value is NativeWorkerScopeLimits {';
  if (!source.includes(marker)) throw new Error('Mutation target missing');
  return { ...result, source: source.replace(marker, marker + '\n  return; // intentional private negative control') };
} });
