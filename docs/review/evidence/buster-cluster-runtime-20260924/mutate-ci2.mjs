import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { registerHooks } from 'node:module';

const root = new URL('../../../../', import.meta.url);
const digest = value => createHash('sha256').update(value).digest('hex');
const specs = JSON.parse(fs.readFileSync(process.env.BUSTER_CI2_CONTROL_SPECS, 'utf8'));
const selected = specs.controls.find(row => row.name === process.env.BUSTER_CLUSTER_MUTATION);
assert(selected, 'explicit known control required');
const manifest = JSON.parse(fs.readFileSync(process.env.BUSTER_CLUSTER_MUTATION_MANIFEST, 'utf8'));
const entry = manifest.files.find(row => row.path === selected.path);
assert(entry, 'mutation target must be bound by integrated manifest');
assert.equal(entry.sha256, selected.sourceSha256);
const target = new URL(selected.path, root).href;
registerHooks({ load(url, context, next) {
  const result = next(url, context);
  if (url !== target) return result;
  const before = fs.readFileSync(new URL(url), 'utf8');
  assert.equal(digest(before), selected.sourceSha256);
  const count = before.split(selected.old).length - 1;
  assert.equal(count, 1, 'one exact reviewed mutation anchor required');
  const source = before.replace(selected.old, selected.new);
  assert.notEqual(source, before);
  process.stderr.write('CI2_MUTATION_APPLIED ' + JSON.stringify({
    mutation: selected.name, pid: process.pid, url,
    beforeSha256: digest(before), afterSha256: digest(source),
    replacements: [{ from: selected.old, to: selected.new, count }],
  }) + '\n');
  return { ...result, source };
} });
