#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { acquireDependencyAggregate, aggregateBytes, checkAggregate } from './plugin-dependency-aggregate.mjs';

const root = path.resolve(import.meta.dirname, '..');
const run = args => execFileSync(process.execPath, args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
// Mandatory fresh-discovery predecessor, before authority report acquisition.
run(['scripts/ap08-extension-inventory.mjs', '--check']);
// Import executes the unchanged ownership assertions before exposing classification.
const { ownerForAbsoluteFile } = await import('./check-runtime-package-ownership.mjs');
const report = JSON.parse(run(['scripts/docs-publication.mjs', 'dependency-authority-report']));
const canonical = 'skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json';
const id = JSON.parse(fs.readFileSync(path.join(root, canonical), 'utf8')).$id;
const aggregate = acquireDependencyAggregate({ root, report,
  sourceOwner: source => ownerForAbsoluteFile(path.join(root, source)), bindings: { [id]: canonical } });
const bytes = aggregateBytes(aggregate);
const target = path.join(root, 'docs/blueprint/generated/plugin-dependency-aggregate.json');
if (process.argv.includes('--check')) checkAggregate(target, bytes);
else fs.writeFileSync(target, bytes);
console.log(`${process.argv.includes('--check') ? 'checked' : 'generated'} dependency aggregate`);
