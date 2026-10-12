import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
const before = '    validateExtractionSourceBinding(item);';
registerHooks({ load(url, context, nextLoad) {
  if (!url.endsWith('/skills/buster/engine/test-gates/preparation-ledger-state.ts')) return nextLoad(url, context);
  const source = readFileSync(new URL(url), 'utf8');
  if (!source.includes(before)) throw new Error('MUTATION_TARGET_NOT_FOUND');
  process.stderr.write('MUTATION_APPLIED: remove recovered source/header binding\n');
  return { format: 'module-typescript', shortCircuit: true, source: source.replace(before, '') };
} });
