import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { echoReviewVerificationOutputSchema } from '../src/echo-review-verification-contract.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'schemas', 'echo-review-verification.v1.schema.json');
const rendered = `${JSON.stringify({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://kubeclaw.dev/schemas/echo-review-verification.v1.schema.json',
  ...echoReviewVerificationOutputSchema,
}, null, 2)}\n`;

if (process.argv.includes('--check')) {
  if (!fs.existsSync(output) || fs.readFileSync(output, 'utf8') !== rendered) {
    throw new Error('echo-review-verification.v1 schema is stale; run npm run schema:generate');
  }
} else {
  fs.writeFileSync(output, rendered);
}
