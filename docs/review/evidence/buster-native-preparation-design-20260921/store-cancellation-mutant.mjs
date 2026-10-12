import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
const suffix = '/skills/buster/engine/test-gates/prepared-plan-store.ts';
const before = 'await withDurableStoreLock(this.#admissionLock, () => this.#attachSource(captured));';
let applied = false;
registerHooks({ load(url, context, nextLoad) {
  if (!url.endsWith(suffix)) return nextLoad(url, context);
  const source = readFileSync(new URL(url), 'utf8');
  if (!source.includes(before)) throw new Error('MUTATION_TARGET_NOT_FOUND');
  applied = true;
  return { format: 'module-typescript', source: source.replace(before, 'await this.#attachSource(captured);'), shortCircuit: true };
} });
process.on('exit', () => { if (!applied) process.exitCode = 91; });
