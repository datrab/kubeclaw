import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { pathToFileURL } from 'url';

function parseArgs(argv = process.argv.slice(2)) {
  const args = { sourceRoot: process.cwd() };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--source-root') args.sourceRoot = path.resolve(argv[i + 1]);
  }
  return args;
}

const { sourceRoot } = parseArgs();
const mainPath = path.join(sourceRoot, 'skills/buster/buster-pipeline.js');
const helpersPath = path.join(sourceRoot, 'skills/buster/buster-pipeline-helpers.js');
const monitorPath = path.join(sourceRoot, 'skills/buster/buster-session-monitor.js');

const mainSource = fs.readFileSync(mainPath, 'utf8');
const helpersSource = fs.readFileSync(helpersPath, 'utf8');
const monitorSource = fs.readFileSync(monitorPath, 'utf8');

assert.equal(mainSource.includes("from './buster-pipeline-helpers.js'"), true, 'buster-pipeline should import extracted task/status helpers');
assert.equal(mainSource.includes("from './buster-session-monitor.js'"), true, 'buster-pipeline should import extracted session monitor');
assert.equal(mainSource.includes("export { monitorSession } from './buster-session-monitor.js';"), true, 'buster-pipeline should preserve monitorSession on the main module surface');
assert.equal(mainSource.includes("export {\n  buildSuiteResultsEmbed,"), true, 'buster-pipeline should preserve the operator embed builders on the main module surface');

for (const marker of [
  'export function resolveBusterActiveSessionPath(',
  'export function buildCompletionIdentityFields(',
  'export function resolveStatusJsonPath(',
  'export function markBusterActiveAgent(',
  'export function clearBusterActiveAgent(',
  'export function buildPreTestVerdict(',
  'export function buildSuiteResultsEmbed(',
  'export function buildSessionSpawnEmbed(',
  'export function buildSessionCompleteEmbed(',
  'export function buildTimeoutEmbed(',
  'export function buildTaskFailureEmbed(',
  'export async function doSandboxCleanup(',
]) {
  assert.equal(helpersSource.includes(marker), true, `buster task helper module must export ${marker}`);
}

assert.equal(monitorSource.includes('export async function monitorSession('), true, 'buster session monitor module must export monitorSession');

for (const disallowed of [
  'function resolveBusterActiveSessionPath(',
  'function buildCompletionIdentityFields(',
  'function resolveStatusJsonPath(',
  'function markBusterActiveAgent(',
  'function clearBusterActiveAgent(',
  'function buildPreTestVerdict(',
  'export function buildSuiteResultsEmbed(',
  'export function buildSessionSpawnEmbed(',
  'export function buildSessionCompleteEmbed(',
  'export function buildTimeoutEmbed(',
  'async function doSandboxCleanup(',
  'export async function monitorSession(',
]) {
  assert.equal(mainSource.includes(disallowed), false, `buster-pipeline main surface must not keep extracted helper ${disallowed}`);
}

const mainMod = await import(pathToFileURL(mainPath).href);
const helpersMod = await import(pathToFileURL(helpersPath).href);
const monitorMod = await import(pathToFileURL(monitorPath).href);

for (const [mod, name] of [
  [mainMod, 'processTask'],
  [mainMod, 'monitorSession'],
  [mainMod, 'buildSuiteResultsEmbed'],
  [mainMod, 'buildSessionSpawnEmbed'],
  [mainMod, 'buildSessionCompleteEmbed'],
  [mainMod, 'buildTaskFailureEmbed'],
  [mainMod, 'buildTimeoutEmbed'],
  [helpersMod, 'resolveStatusJsonPath'],
  [helpersMod, 'markBusterActiveAgent'],
  [helpersMod, 'clearBusterActiveAgent'],
  [helpersMod, 'buildPreTestVerdict'],
  [helpersMod, 'doSandboxCleanup'],
  [monitorMod, 'monitorSession'],
]) {
  assert.equal(typeof mod[name], 'function', `${name} should be exported`);
}

console.log(JSON.stringify({ ok: true, checked: 29 }));
