import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectEventSourceVector } from './lib/docs-event-contracts.mjs';
import { collectBoundEventReference } from './lib/docs-event-reference-collector.mjs';
import { renderEventReference, replaceEventReference } from './lib/docs-event-reference.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.some((arg) => arg !== '--check') || new Set(args).size !== args.length) {
  process.stderr.write('Usage: node scripts/docs-event-contracts.mjs [--check]\n');
  process.exitCode = 2;
} else {
  try {
    const check = args.includes('--check');
    const bindingPath = 'docs/config/event-reference-bindings.json';
    const inventoryPath = 'docs/generated/inventory/event-contracts.json';
    const pagePath = 'docs/site/reference/events.md';
    const bindings = JSON.parse(fs.readFileSync(path.join(root, bindingPath), 'utf8'));
    const census = collectEventSourceVector(root);
    if (typeof bindings.qualifiedSourceVectorSha256 !== 'string'
      || bindings.qualifiedSourceVectorSha256 !== census.sourceSetSha256) {
      throw new Error(`EVENT_SOURCE_SEMANTIC_DISPOSITION_REQUIRED:source-vector:${census.sourceSetSha256}`);
    }
    const inventory = collectBoundEventReference(root, census, bindings);
    const outputs = new Map([
      [inventoryPath, JSON.stringify(inventory, null, 2) + '\n'],
      [pagePath, replaceEventReference(fs.readFileSync(path.join(root, pagePath), 'utf8'), renderEventReference(inventory))],
    ]);
    // All discovery, semantic responsibility checks and rendering finish before
    // any write. --check takes only this comparison branch and never creates a
    // directory, temporary checkout or output file.
    const stale = [...outputs].filter(([file, content]) => !fs.existsSync(path.join(root, file))
      || fs.readFileSync(path.join(root, file), 'utf8') !== content).map(([file]) => file);
    if (check && stale.length) throw new Error(`DOC_DRIFT_EVENT_CONTRACT:${stale.join(',')}`);
    if (!check) for (const [file, content] of outputs) {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      fs.writeFileSync(path.join(root, file), content);
    }
    process.stdout.write(`${JSON.stringify({ ok: true, mode: check ? 'check' : 'generate', families: inventory.families.length, sources: census.sources.length })}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
