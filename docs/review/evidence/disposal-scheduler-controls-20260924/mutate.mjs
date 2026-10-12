import assert from 'node:assert/strict';
import fs from 'node:fs';
import process from 'node:process';
import { createHash } from 'node:crypto';
import { registerHooks } from 'node:module';
const specs = JSON.parse(fs.readFileSync(new URL('./specs.json', import.meta.url), 'utf8'));
const name = process.env.BUSTER_SEMANTIC_MUTATION;
assert(Object.hasOwn(specs, name));
const selected = specs[name];
const target = new URL(selected.file, new URL('../../../../', import.meta.url)).href;
const digest = value => createHash('sha256').update(value).digest('hex');
registerHooks({ load(url, context, next) {
  const result = next(url, context);
  if (url !== target) return result;
  const source = fs.readFileSync(new URL(url), 'utf8');
  assert.equal(digest(source), selected.sha256, 'exact reviewed source required');
  let replacement;
  if (selected.fullReplacement) {
    replacement = fs.readFileSync(new URL(selected.fullReplacement, import.meta.url), 'utf8');
    assert.equal(digest(replacement), selected.replacementSha256);
  } else {
    assert.equal(source.split(selected.anchor).length, 2, 'one actual semantic decision');
    replacement = source.replace(selected.anchor, selected.replacement);
  }
  assert(process.env.BUSTER_SEMANTIC_APPLICATION_LOG);
  fs.appendFileSync(process.env.BUSTER_SEMANTIC_APPLICATION_LOG,
    JSON.stringify({ name, pid: process.pid, url, sourceSha256: digest(source), replacementSha256: digest(replacement) }) + '\n');
  return { ...result, source: replacement };
} });
