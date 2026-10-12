import { registerHooks } from 'node:module';
registerHooks({ load(url, context, next) {
  const loaded = next(url, context);
  if (!url.endsWith('/native-cleanup-reconciliation.ts')) return loaded;
  const source = String(loaded.source);
  const target = "record.phase !== 'disposed'";
  if (!source.includes(target)) throw new Error('target missing');
  return { ...loaded, source: source.replace(target, 'false') };
} });
