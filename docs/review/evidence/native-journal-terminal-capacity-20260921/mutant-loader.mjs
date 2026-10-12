import { registerHooks } from 'node:module';
const field = process.env.JOURNAL_CAPACITY_MUTANT;
if (!['signal', 'fault'].includes(field)) throw new Error('unknown mutation');
registerHooks({ load(url, context, nextLoad) {
  const loaded = nextLoad(url, context);
  if (!url.endsWith('/native-journal-capacity.ts')) return loaded;
  const text = Buffer.isBuffer(loaded.source) ? loaded.source.toString() : String(loaded.source);
  const before = `${field}: diagnostic`;
  if (!text.includes(before)) throw new Error('mutation target missing');
  return { ...loaded, source: text.replace(before, `${field}: 'x'`) };
} });
