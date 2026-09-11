import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const [baselineRoot, candidateRoot] = process.argv.slice(2);
assert(baselineRoot && candidateRoot, 'baseline and candidate checkouts are required');
const enginePath = 'skills/prism/engine/index.ts';
const hash = value => createHash('sha256').update(value).digest('hex');
const beforeSource = fs.readFileSync(path.join(baselineRoot, enginePath));
assert.equal(hash(beforeSource), '7d56bea02ca1cdcffeb0b6ddfc0eb993a479ef98a3dfe94a7a073d89b191d8ba',
  'baseline must match the original c71134a engine, not a rewritten substitute');
const before = await import(pathToFileURL(path.join(baselineRoot, enginePath)).href);
const after = await import(pathToFileURL(path.join(candidateRoot, enginePath)).href);
const document = JSON.parse(fs.readFileSync(path.join(baselineRoot, 'contracts/prism/v1/fixtures/minimal-web.json'), 'utf8'));
const request = (operation, input) => ({ contract: 'kubeclaw.prism-design-engine@1', operation, input });
const cases = [
  ...['compact', 'regular', 'wide'].map(viewport => request('render', { document, view: 'home', state: 'default', viewport })),
  request('evaluate', { document }),
  request('publish', { document, approved: true }),
  request('publish', { document, approved: false }),
  request('render', { document, view: 'missing', state: 'default', viewport: 'wide' }),
  request('render', { document, view: 'home', state: 'default', viewport: 'wide', foreign: true }),
  request('generate', { document, instruction: 'Preserve original deterministic operation behavior', mode: 'refine' }),
  request('ingest', { text: 'Actual original deterministic embedding implementation' }),
  request('ingest', { text: '' }),
  request('evaluate', { document: { ...document, schemaVersion: 'foreign' } }),
];
async function execute(module, value, index) {
  const engine = new module.PrismEngine(new module.DeterministicDesignProvider());
  try { return { result: await engine.execute({ ...structuredClone(value), idempotencyKey: `parity:${index}` }) }; }
  catch (error) { return { error: { name: error.name, message: error.message } }; }
}
for (const [index, value] of cases.entries()) {
  const original = await execute(before, value, index);
  const candidate = await execute(after, value, index);
  assert.deepEqual(candidate, original);
  assert.equal(JSON.stringify(candidate), JSON.stringify(original), 'stored JSON order and original HTML bytes must match');
  console.log(JSON.stringify({ index, operation: value.operation, outcome: original.error ? 'rejected' : 'completed',
    originalOutputSha256: hash(JSON.stringify(original)), candidateOutputSha256: hash(JSON.stringify(candidate)) }));
}
console.log(JSON.stringify({ cases: cases.length, matched: cases.length, originalSourceSha256: hash(beforeSource),
  modelExecution: false, browserExecution: false, provider: 'original DeterministicDesignProvider (test-only)' }));
