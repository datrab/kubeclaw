import fs from 'fs';
import path from 'path';
import assert from 'assert';

function parseArgs(argv = process.argv.slice(2)) {
  const args = { sourceRoot: process.cwd() };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--source-root') args.sourceRoot = path.resolve(argv[i + 1]);
  }
  return args;
}

function countOccurrences(text, needle) {
  if (!needle) return 0;
  return text.split(needle).length - 1;
}

const { sourceRoot } = parseArgs();
const busterPipelinePath = path.join(sourceRoot, 'skills/buster/buster-pipeline.js');
const source = fs.readFileSync(busterPipelinePath, 'utf8');

const canonicalSurfaces = [
  'buildSuiteResultsEmbed',
  'buildSessionSpawnEmbed',
  'buildSessionCompleteEmbed',
  'buildTaskFailureEmbed',
  'buildTimeoutEmbed',
];

for (const symbol of canonicalSurfaces) {
  assert.equal(source.includes(symbol), true, `${symbol} should remain on the canonical Buster operator surface`);
}

const retiredLegacySurfaces = [
  'buildLegacyTaskDispatchMessage',
  'buildLegacySuiteResultsEmbed',
  'buildLegacySessionSpawnEmbed',
  'buildLegacySessionCompleteEmbed',
  'buildLegacyTaskFailureEmbed',
  'Buster Pipeline v1.1',
  'legacy compatibility',
  'discord(buildLegacy',
];

for (const marker of retiredLegacySurfaces) {
  assert.equal(source.includes(marker), false, `legacy Buster operator marker should be removed: ${marker}`);
}

assert.equal(countOccurrences(source, 'discord(buildSuiteResultsEmbed('), 1, 'suite results should emit exactly one canonical Discord surface');
assert.equal(countOccurrences(source, 'discord(buildSessionSpawnEmbed('), 1, 'session spawn should emit exactly one canonical Discord surface');
assert.equal(countOccurrences(source, 'discord(buildSessionCompleteEmbed('), 1, 'session completion should emit exactly one canonical Discord surface');
assert.equal(countOccurrences(source, 'discord(buildTaskFailureEmbed('), 1, 'task failure should emit exactly one canonical Discord surface');
assert.equal(countOccurrences(source, 'discord(buildTimeoutEmbed('), 1, 'session timeout should emit exactly one canonical Discord surface');

console.log(JSON.stringify({ ok: true, checked: 13 }));
