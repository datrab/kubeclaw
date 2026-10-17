import fs from 'node:fs';
import yaml from 'js-yaml';

// Generated release values use folded YAML strings for long archive URLs.
// Parse them as YAML instead of treating the first line as the scalar value.
const [base, overlay, field, key] = process.argv.slice(2);
for (const file of [overlay, base].filter(Boolean)) {
  const bundle = yaml.load(fs.readFileSync(file, 'utf8'))?.codeBundle;
  const value = key ? bundle?.[field]?.[key] : bundle?.[field];
  if (value === undefined || value === null || value === '') continue;
  if (typeof value !== 'string') throw new Error('Bundle field must be a string');
  process.stdout.write(`${value}\n`);
  break;
}
