#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const [sourceArgument, targetArgument] = process.argv.slice(2);
if (!sourceArgument || !targetArgument) {
  throw new Error('usage: check-materialized-tree.mjs <canonical-directory> <materialized-directory>');
}

function files(directory) {
  const root = fs.realpathSync(directory);
  const discovered = [];
  const visit = (current, relative) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const childRelative = path.posix.join(relative, entry.name);
      const child = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`materialized trees must not contain symlinks: ${childRelative}`);
      if (entry.isDirectory()) visit(child, childRelative);
      else if (entry.isFile()) discovered.push(childRelative);
      else throw new Error(`materialized trees must contain only files and directories: ${childRelative}`);
    }
  };
  visit(root, '');
  return { root, files: discovered.sort() };
}

const source = files(sourceArgument);
const target = files(targetArgument);
assert.deepEqual(target.files, source.files, 'materialized file set differs from canonical source');
for (const relative of source.files) {
  assert.ok(
    fs.readFileSync(path.join(target.root, relative)).equals(fs.readFileSync(path.join(source.root, relative))),
    `materialized file differs from canonical source: ${relative}`,
  );
}

console.log(JSON.stringify({ ok: true, files: source.files.length }));
