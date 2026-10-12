import { registerHooks } from 'node:module';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
const specification = JSON.parse(fs.readFileSync(process.env.LC_MUTANT_SPEC, 'utf8'));
const target = pathToFileURL(specification.file).href;
registerHooks({ load(url, context, nextLoad) {
  const loaded = nextLoad(url, context);
  if (url !== target) return loaded;
  const original = Buffer.from(loaded.source).toString('utf8');
  if (crypto.createHash('sha256').update(original).digest('hex') !== specification.sha256) throw Error('LC_MUTANT_SOURCE_CHANGED');
  if (original.split(specification.from).length !== 2) throw Error('LC_MUTANT_TARGET_NOT_UNIQUE');
  fs.appendFileSync(specification.log, JSON.stringify({ file: specification.file, from: specification.from, to: specification.to }) + '\n');
  return { ...loaded, source: original.replace(specification.from, specification.to) };
} });
