import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'contracts/check-redis-log-ownership' });
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
const observabilityPath = path.join(sourceRoot, 'skills/nova/pipeline/services/observability.ts');
const redisLogPath = path.join(sourceRoot, 'skills/nova/pipeline/services/redis-log.ts');

const observabilitySource = fs.readFileSync(observabilityPath, 'utf8');
const redisLogSource = fs.readFileSync(redisLogPath, 'utf8');

assert.equal(observabilitySource.includes('export function logRedisExchange('), false, 'observability.ts must not own a Redis exchange logging helper');
assert.equal(redisLogSource.includes('export function logRedisExchange('), true, 'redis-log.js must remain the canonical Redis exchange logging owner');
assert.equal(redisLogSource.includes('export function logRedisSent('), true, 'redis-log.js should keep the canonical sent helper');
assert.equal(redisLogSource.includes('export function logRedisReceived('), true, 'redis-log.js should keep the canonical received helper');

const observabilityMod = await import(pathToFileURL(observabilityPath).href);
const redisLogMod = await import(pathToFileURL(redisLogPath).href);

assert.equal(Object.prototype.hasOwnProperty.call(observabilityMod, 'logRedisExchange'), false, 'observability module exports must not expose a duplicate Redis exchange helper');
assert.equal(typeof redisLogMod.logRedisExchange, 'function', 'redis-log module should export the canonical Redis exchange helper');
assert.equal(typeof redisLogMod.logRedisSent, 'function', 'redis-log module should export the canonical sent helper');
assert.equal(typeof redisLogMod.logRedisReceived, 'function', 'redis-log module should export the canonical received helper');

quietConsole.restore();
console.log(JSON.stringify({ ok: true, checked: 8 }));
