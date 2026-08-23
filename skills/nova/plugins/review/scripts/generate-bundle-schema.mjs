import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { reviewBundleSchema } from '../src/review-bundle-contract.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'schemas', 'review-bundle.v1.schema.json');
const rendered = `${JSON.stringify({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://kubeclaw.dev/schemas/review-bundle.v1.schema.json',
  ...reviewBundleSchema,
}, null, 2)}\n`;

if (process.argv.includes('--check')) {
  if (!fs.existsSync(output) || fs.readFileSync(output, 'utf8') !== rendered) {
    throw new Error('review-bundle.v1 schema is stale; run npm run schema:generate');
  }
} else {
  fs.writeFileSync(output, rendered);
}
