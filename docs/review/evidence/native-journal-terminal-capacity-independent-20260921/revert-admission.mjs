import { registerHooks } from 'node:module';
registerHooks({ load(url, context, next) {
 const result = next(url, context);
 if (!url.endsWith('/skills/worker/core/worker/native-attempt-journal.ts')) return result;
 const source = String(result.source);
 const target = 'await reserveNativeJournalMetadata(path.join(this.#root, \'metadata\', \'records\', \'store.json\'),\n        payload, journalKey(envelope), owner, this.#limits);';
 if (!source.includes(target)) throw new Error('MUTATION_TARGET_MISSING');
 return { ...result, source: source.replace(target, '/* private negative control: omitted reservation */') };
} });
