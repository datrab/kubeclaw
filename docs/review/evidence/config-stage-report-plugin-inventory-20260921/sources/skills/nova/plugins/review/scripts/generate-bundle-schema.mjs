import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { reviewBundleSchema, portableReviewBundleSchema } from '../src/review-bundle-contract.ts';
import { PORTABLE_REVIEW_REPORT_VERSION, PORTABLE_REVIEW_GOVERNOR_VERSION } from '../src/review-semantics.ts';

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

const report = JSON.parse(fs.readFileSync(path.join(root, 'schemas', 'review-report.v2.schema.json'), 'utf8'));
report.$id = 'https://kubeclaw.dev/contracts/review-report.v3.schema.json';
report.properties.schemaVersion.const = PORTABLE_REVIEW_REPORT_VERSION;
report.$defs.governor.properties.schemaVersion.const = PORTABLE_REVIEW_GOVERNOR_VERSION;
const additional = [
  ['review-bundle.v2.schema.json', {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://kubeclaw.dev/schemas/review-bundle.v2.schema.json', ...portableReviewBundleSchema,
  }],
  ['review-report.v3.schema.json', report],
];
for (const [name, schema] of additional) {
  const target = path.join(root, 'schemas', name);
  const text = `${JSON.stringify(schema, null, 2)}\n`;
  if (process.argv.includes('--check')) {
    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== text) throw new Error(`${name} schema is stale`);
  } else fs.writeFileSync(target, text);
}
