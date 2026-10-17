#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const checkOnly = process.argv.includes('--check');
const outputPath = 'docs/blueprint/generated/ap08-repeat-review-scope.json';

const fixedReviewPaths = [
  'docs/blueprint/07-documentation-quality-standard.md',
  'docs/blueprint/AP08-plan.md',
  'docs/site/extend/README.md',
  'docs/site/extend/buster.md',
  'docs/site/extend/contracts.md',
  'docs/site/extend/effectful-plugin.md',
  'docs/site/extend/first-plugin.md',
  'docs/site/extend/host-and-engine.md',
  'docs/site/extend/nova.md',
  'docs/site/extend/testing.md',
];

const cataloguePaths = fs.readdirSync(path.join(root, 'docs/site/extend/plugin-catalogue'))
  .filter(name => name.endsWith('.md'))
  .sort()
  .map(name => `docs/site/extend/plugin-catalogue/${name}`);
const examplePaths = [
  'docs/site/extend/examples/minimal-stage/package.json',
  'docs/site/extend/examples/minimal-stage/plugin.json',
  'docs/site/extend/examples/minimal-stage/schemas/config.schema.json',
  'docs/site/extend/examples/minimal-stage/schemas/input.schema.json',
  'docs/site/extend/examples/minimal-stage/schemas/result.schema.json',
  'docs/site/extend/examples/minimal-stage/src/stage.js',
  'docs/site/extend/examples/minimal-stage/tests/stage.test.mjs',
];
const reviewPaths = [...fixedReviewPaths, ...cataloguePaths, ...examplePaths].sort();

const evidence = new Map();
const sourceLink = /https:\/\/github\.com\/datrab\/kubeclaw\/blob\/([0-9a-f]{40})\/([^\s)#]+)(?:#L\d+(?:-L\d+)?)?/gu;
for (const reviewPath of reviewPaths) {
  const text = fs.readFileSync(path.join(root, reviewPath), 'utf8');
  for (const match of text.matchAll(sourceLink)) {
    const sourcePath = decodeURIComponent(match[2]);
    evidence.set(`${match[1]}:${sourcePath}`, { revision: match[1], path: sourcePath });
  }
}

const scope = {
  schemaVersion: 'ap08-repeat-review-scope.v1',
  purpose: 'Closed path allowlist for the AP08 read-only repeat review.',
  rules: {
    repositoryWrites: 'forbidden',
    unlistedReads: 'forbidden',
    linkTraversal: 'Only evidenceObjects below can be opened. Do not follow other local or external links.',
    commandExpansion: 'Only commands listed in permittedCommands can run. Do not replace them with aggregates.',
  },
  reviewPaths,
  evidenceObjects: [...evidence.values()].sort((a, b) => `${a.revision}:${a.path}`.localeCompare(`${b.revision}:${b.path}`)),
  permittedCommands: [
    'npm run docs:ap08:inventory:check',
    'npm run docs:ap08:choice:check',
    'npm run docs:ap08:minimal-plugin:check',
    'npm run docs:ap08:advanced-guides:check',
    'npm run docs:ap08:effectful:check',
    'npm run docs:ap08:host-lifecycle-catalogue:check',
  ],
  outputBoundary: 'Return the report in chat. Do not create, edit, generate, format, stage, commit, or push files.',
};
const expected = `${JSON.stringify(scope, null, 2)}\n`;
const target = path.join(root, outputPath);

if (checkOnly) {
  if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== expected) {
    console.error(`AP08 repeat-review scope is stale: ${outputPath}`);
    process.exit(1);
  }
  console.log(`AP08 repeat-review scope is current (${reviewPaths.length} review paths, ${scope.evidenceObjects.length} evidence objects)`);
} else {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, expected);
  console.log(`wrote ${outputPath} (${reviewPaths.length} review paths, ${scope.evidenceObjects.length} evidence objects)`);
}
