import {registerHooks} from 'node:module';
import fs from 'node:fs';
const mode = process.env.WORKER_LISTENER_MUTATION;
registerHooks({load(url, context, nextLoad) {
  const result = nextLoad(url, context);
  if (mode === 'fallback' && url.endsWith('/skills/prism/server/worker-config.ts')) {
    return {...result, source: fs.readFileSync(new URL('./before/skills/prism/server/worker-config.ts', import.meta.url), 'utf8')};
  }
  if (mode !== 'fallback' && url.endsWith('/tests/verification/deployment/prism-swarm-config.test.mjs')) {
    const source = result.source.toString();
    const original = "const root = path.resolve(import.meta.dirname, '../../..');";
    if (!source.includes(original)) throw new Error('MUTATION_SOURCE_MISMATCH');
    return {...result, source: source.replace(original, `const root = ${JSON.stringify(process.env.WORKER_MUTANT_ROOT)};`)};
  }
  return result;
}});
