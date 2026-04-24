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
const mainPath = path.join(sourceRoot, 'skills/nova/pipeline/services/rate-limit.js');
const buildersPath = path.join(sourceRoot, 'skills/nova/pipeline/services/rate-limit-builders.js');
const exitPath = path.join(sourceRoot, 'skills/nova/pipeline/services/rate-limit-exit.js');

const mainSource = fs.readFileSync(mainPath, 'utf8');
const buildersSource = fs.readFileSync(buildersPath, 'utf8');
const exitSource = fs.readFileSync(exitPath, 'utf8');

assert.equal(mainSource.includes("export * from './rate-limit-builders.js';"), true, 'rate-limit main surface should re-export builder helpers');
assert.equal(mainSource.includes("export * from './rate-limit-exit.js';"), true, 'rate-limit main surface should re-export exit helpers');
assert.equal(mainSource.includes("from './rate-limit-builders.js'"), true, 'rate-limit main surface should import the builder helper module');
assert.equal(mainSource.includes("from './rate-limit-exit.js'"), true, 'rate-limit main surface should import the exit helper module');

for (const marker of [
  'export const STATUS = {',
  'export function buildModuleStatusTelemetry(',
  'export function defaultSessionRateLimitDetail(',
  'export function createTrackedGateSessionRateLimitRecoveryOptions(',
  'export function createSessionRateLimitDiscordNotifier(',
  'export function buildTrackedModuleSessionRateLimitStatus(',
]) {
  assert.equal(buildersSource.includes(marker), true, `rate-limit builders must export ${marker}`);
}

for (const marker of [
  'export function buildSessionRateLimitExitResult(',
  'export function buildModuleTerminalOwnedRedisRateLimitExitResult(',
  'export async function finalizeSummarySessionRateLimitExit(',
  'export async function finalizeGateSessionRateLimitExit(',
  'export async function finalizeModuleSessionRateLimitExit(',
  'export function createModuleSessionRateLimitExhaustionOptions(',
]) {
  assert.equal(exitSource.includes(marker), true, `rate-limit exit helpers must export ${marker}`);
}

for (const disallowed of [
  'export function buildSessionRateLimitExitResult(',
  'export async function finalizeModuleSessionRateLimitExit(',
  'export function createTrackedGateSessionRateLimitRecoveryOptions(',
  'export function createModuleSessionRateLimitExhaustionOptions(',
  'export function buildTrackedGateSessionRateLimitStatus(',
]) {
  assert.equal(mainSource.includes(disallowed), false, `rate-limit main surface must not keep extracted helper ${disallowed}`);
}

const mainMod = await import(pathToFileURL(mainPath).href);
const buildersMod = await import(pathToFileURL(buildersPath).href);
const exitMod = await import(pathToFileURL(exitPath).href);

for (const [mod, name] of [
  [mainMod, 'handleSessionRateLimit'],
  [mainMod, 'withSessionRateLimitRecovery'],
  [mainMod, 'resumeDurableCooldownForStep'],
  [buildersMod, 'createTrackedGateSessionRateLimitRecoveryOptions'],
  [buildersMod, 'buildTrackedModuleSessionRateLimitStatus'],
  [exitMod, 'buildSessionRateLimitExitResult'],
  [exitMod, 'createModuleSessionRateLimitExhaustionOptions'],
  [exitMod, 'finalizeModuleSessionRateLimitExit'],
  [exitMod, 'finalizeGateSessionRateLimitExit'],
]) {
  assert.equal(typeof mod[name], 'function', `${name} should be exported`);
}

console.log(JSON.stringify({ ok: true, checked: 21 }));
