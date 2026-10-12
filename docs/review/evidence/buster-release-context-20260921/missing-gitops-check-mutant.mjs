import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
const before = 'nativeBusterDeploymentSelection(busterResources, buster.namespace, policy);';
registerHooks({ load(url, context, nextLoad) {
  if (!url.endsWith('/scripts/gitops.mjs')) return nextLoad(url, context);
  const source = readFileSync(new URL(url), 'utf8');
  if (!source.includes(before)) throw new Error('MUTATION_TARGET_NOT_FOUND');
  process.stderr.write('MUTATION_APPLIED: remove Buster committed-resource preflight only\n');
  return { format: 'module', shortCircuit: true, source: source.replace(before, 'void busterResources;') };
} });
