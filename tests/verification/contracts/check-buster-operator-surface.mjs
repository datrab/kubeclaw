import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'contracts/check-buster-operator-surface' });
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
const pipelineHelpersPath = path.join(sourceRoot, 'skills/buster/pipeline/services/pipeline-helpers.ts');
const discordPath = path.join(sourceRoot, 'skills/buster/pipeline/services/discord.ts');
const taskLifecyclePath = path.join(sourceRoot, 'skills/buster/pipeline/services/task-lifecycle.ts');
const taskLifecycleSessionPath = path.join(sourceRoot, 'skills/buster/pipeline/services/task-lifecycle/session.ts');
const source = fs.readFileSync(pipelineHelpersPath, 'utf8');
const discordSource = fs.readFileSync(discordPath, 'utf8');
const taskLifecycleSource = fs.readFileSync(taskLifecyclePath, 'utf8');
const taskLifecycleSessionSource = fs.readFileSync(taskLifecycleSessionPath, 'utf8');
const implementationSurface = `${source}\n${discordSource}\n${taskLifecycleSource}\n${taskLifecycleSessionSource}`;

const canonicalSurfaces = [
  'buildSuiteResultsEmbed',
  'buildSessionSpawnEmbed',
  'buildSessionCompleteEmbed',
  'buildTaskFailureEmbed',
  'buildTimeoutEmbed',
];

for (const symbol of canonicalSurfaces) {
  assert.equal(source.includes(symbol), true, `${symbol} should remain on the owning Buster operator helper surface`);
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
  '_discordWebhookHealth',
  '_discordAuditHealth',
  'context.moduleId',
  'context.gateId',
  'context.gateType',
  'context.runId',
  'context.dispatchId',
  'context.sessionKey',
  'context.webhookUrl',
];

for (const marker of retiredLegacySurfaces) {
  assert.equal(implementationSurface.includes(marker), false, `legacy Buster operator marker should be removed: ${marker}`);
}

assert.equal(countOccurrences(implementationSurface, 'discord(buildSuiteResultsEmbed('), 1, 'suite results should emit exactly one canonical Discord surface');
assert.equal(countOccurrences(implementationSurface, 'discord(buildSessionSpawnEmbed('), 1, 'session spawn should emit exactly one canonical Discord surface');
assert.equal(countOccurrences(implementationSurface, 'discord(buildSessionCompleteEmbed('), 1, 'session completion should emit exactly one canonical Discord surface');
assert.equal(countOccurrences(implementationSurface, 'discord(buildTaskFailureEmbed('), 1, 'task failure should emit exactly one canonical Discord surface');
assert.equal(countOccurrences(implementationSurface, 'discord(buildTimeoutEmbed('), 1, 'session timeout should emit exactly one canonical Discord surface');

quietConsole.restore();
console.log(JSON.stringify({ ok: true, checked: 28 }));
