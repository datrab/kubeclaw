import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
const before = "const native = role === 'prism' ? values?.worker?.native : role === 'buster' ? values?.busterNative : undefined;";
registerHooks({ load(url, context, nextLoad) {
  if (!url.endsWith('/scripts/updates/deployment-release.mjs')) return nextLoad(url, context);
  const source = readFileSync(new URL(url), 'utf8');
  if (!source.includes(before)) throw new Error('MUTATION_TARGET_NOT_FOUND');
  process.stderr.write('MUTATION_APPLIED: remove Buster baseline context only\n');
  return { format: 'module', shortCircuit: true,
    source: source.replace(before, "const native = role === 'prism' ? values?.worker?.native : undefined;") };
} });
