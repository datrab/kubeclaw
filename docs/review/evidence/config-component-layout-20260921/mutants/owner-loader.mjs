/** In-memory negative control only. No production file is modified. */
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = process.cwd();
const definitions = {
  owner: ['skills/common/plugin-runtime/foundation/config/swarm-bundle.ts', '(value as Component).owner !== owner', 'false'],
  required: ['skills/common/plugin-runtime/foundation/config/swarm-bundle.ts', 'if (!validateComponent(value) ||', 'if (false ||'],
  legacy: ['skills/common/plugin-runtime/foundation/config/swarm.ts', '  rejectLegacyAuthors(environment);', '  // private mutant removes legacy-author rejection'],
  generation: ['skills/common/plugin-runtime/foundation/config/swarm-bundle.ts', 'path.join(generationDirectory, references[owner])', 'path.join(path.dirname(file), references[owner])'],
  output: ['skills/prism/server/native-worker-execution.ts', 'maximumInputBytes: native.maximumInputBytes, maximumOutputBytes: native.maximumOutputBytes,', 'maximumInputBytes: native.maximumInputBytes, maximumOutputBytes: 1,'],
  poll: ['skills/prism/server/native-worker-execution.ts', 'pollIntervalMs: native.pollIntervalMs, closeTimeoutMs:', 'pollIntervalMs: 1, closeTimeoutMs:'],
  close: ['skills/prism/server/native-worker-execution.ts', 'closeTimeoutMs: native.closeTimeoutMs },', 'closeTimeoutMs: 1 },'],
};
const selected = definitions[process.env.CONFIG_MUTANT];
if (!selected) throw new Error('CONFIG_MUTANT_REQUIRED');
registerHooks({
  load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    if (!url.startsWith('file:') || fileURLToPath(url) !== path.join(root, selected[0])) return result;
    const source = typeof result.source === 'string' ? result.source : Buffer.from(result.source).toString('utf8');
    if (source.split(selected[1]).length !== 2) throw new Error('CONFIG_MUTANT_ANCHOR_CHANGED');
    process.stderr.write(`CONFIG_MUTANT_APPLIED:${process.env.CONFIG_MUTANT}\n`);
    return { ...result, source: source.replace(selected[1], selected[2]) };
  },
});
