import { registerHooks } from 'node:module';
registerHooks({ load(url, context, nextLoad) {
  const result = nextLoad(url, context);
  if (!url.endsWith('/skills/worker/core/worker/native-worker-process.ts')) return result;
  const source = String(result.source);
  const original = 'options.owner.allocate(options.identity, { memoryBytes: limits.memoryBytes, tasks: limits.tasks })';
  if (!source.includes(original)) throw new Error('MUTATION_TARGET_NOT_FOUND');
  return { ...result, source: source.replace(original, 'options.owner.allocate(options.identity, limits)') };
} });
