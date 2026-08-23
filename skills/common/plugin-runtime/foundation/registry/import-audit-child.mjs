import { createRequire, syncBuiltinESMExports } from 'node:module';
import { pathToFileURL } from 'node:url';

const modulePath = process.argv[2];
const exportName = process.argv[3];
if (!modulePath) throw new Error('REGISTRY_IMPORT_AUDIT_MODULE_REQUIRED');
if (!exportName) throw new Error('REGISTRY_IMPORT_AUDIT_EXPORT_REQUIRED');

const deny = (operation) => () => {
  throw new Error(`REGISTRY_IMPORT_SIDE_EFFECT:${operation}`);
};
const require = createRequire(import.meta.url);
for (const [name, operations] of Object.entries({
  'node:child_process': ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork'],
  'node:dgram': ['createSocket'],
  'node:dns': [
    'getDefaultResultOrder', 'getServers', 'lookup', 'lookupService', 'resolve',
    'resolve4', 'resolve6', 'resolveAny', 'resolveCaa', 'resolveCname', 'resolveMx',
    'resolveNaptr', 'resolveNs', 'resolvePtr', 'resolveSoa', 'resolveSrv',
    'resolveTxt', 'reverse', 'setDefaultResultOrder', 'setServers',
  ],
  'node:cluster': ['fork', 'setupMaster', 'setupPrimary'],
  'node:http2': ['connect', 'createServer', 'createSecureServer'],
  'node:http': ['createServer', 'request', 'get'],
  'node:https': ['createServer', 'request', 'get'],
  'node:net': ['createConnection', 'connect', 'createServer'],
  'node:timers': ['setImmediate', 'setInterval', 'setTimeout'],
  'node:tls': ['connect', 'createServer'],
  'node:worker_threads': ['Worker'],
})) {
  const builtin = require(name);
  for (const operation of operations) builtin[operation] = deny(`${name}.${operation}`);
}
for (const [name, operations] of Object.entries({
  'node:fs': [
    'appendFile', 'appendFileSync', 'chmod', 'chmodSync', 'chown', 'chownSync',
    'copyFile', 'copyFileSync', 'cp', 'cpSync', 'createWriteStream', 'fchmod',
    'fchmodSync', 'fchown', 'fchownSync', 'fdatasync', 'fdatasyncSync', 'fsync',
    'fsyncSync', 'ftruncate', 'ftruncateSync', 'futimes', 'futimesSync', 'link',
    'linkSync', 'lchmod', 'lchmodSync', 'lchown', 'lchownSync', 'lutimes',
    'lutimesSync', 'mkdir', 'mkdirSync', 'mkdtemp', 'mkdtempSync', 'openAsBlob',
    'rename', 'renameSync', 'rm', 'rmSync', 'rmdir', 'rmdirSync', 'symlink',
    'symlinkSync', 'truncate', 'truncateSync', 'unlink', 'unlinkSync', 'utimes',
    'utimesSync', 'watch', 'watchFile', 'write', 'writeFile', 'writeFileSync',
    'writeSync', 'writev', 'writevSync',
  ],
})) {
  const builtin = require(name);
  for (const operation of operations) {
    if (typeof builtin[operation] === 'function') builtin[operation] = deny(`${name}.${operation}`);
  }
}
for (const [name, operations] of Object.entries({
  'node:fs/promises': [
    'appendFile', 'chmod', 'chown', 'copyFile', 'cp', 'lchmod', 'lchown',
    'link', 'lutimes', 'mkdir', 'mkdtemp', 'open', 'rename', 'rm', 'rmdir',
    'symlink', 'truncate', 'unlink', 'utimes', 'writeFile',
  ],
  'node:dns/promises': [
    'getDefaultResultOrder', 'getServers', 'lookup', 'lookupService', 'resolve',
    'resolve4', 'resolve6', 'resolveAny', 'resolveCaa', 'resolveCname', 'resolveMx',
    'resolveNaptr', 'resolveNs', 'resolvePtr', 'resolveSoa', 'resolveSrv',
    'resolveTxt', 'reverse', 'setDefaultResultOrder', 'setServers',
  ],
  'node:timers/promises': ['setImmediate', 'setInterval', 'setTimeout'],
})) {
  const builtin = require(name);
  for (const operation of operations) {
    if (typeof builtin[operation] === 'function') builtin[operation] = deny(`${name}.${operation}`);
  }
}
for (const name of ['node:dns', 'node:dns/promises']) {
  const prototype = require(name).Resolver?.prototype;
  if (!prototype) continue;
  for (const operation of Object.getOwnPropertyNames(prototype)) {
    if (operation === 'constructor' || typeof prototype[operation] !== 'function') continue;
    prototype[operation] = deny(`${name}.Resolver.${operation}`);
  }
}
globalThis.fetch = deny('fetch');
if ('WebSocket' in globalThis) globalThis.WebSocket = deny('WebSocket');
globalThis.setImmediate = deny('setImmediate');
globalThis.setInterval = deny('setInterval');
globalThis.setTimeout = deny('setTimeout');
globalThis.queueMicrotask = deny('queueMicrotask');

for (const operation of [
  'abort', 'addListener', 'chdir', 'exit', 'kill', 'nextTick', 'on',
  'prependListener', 'prependOnceListener', 'reallyExit',
  'setUncaughtExceptionCaptureCallback',
]) {
  if (typeof process[operation] === 'function') process[operation] = deny(`process.${operation}`);
}
syncBuiltinESMExports();

const globalsBefore = new Map(
  Object.getOwnPropertyNames(globalThis).map((name) => [name, globalThis[name]]),
);
const cwdBefore = process.cwd();
const envBefore = { ...process.env };
const titleBefore = process.title;
const umaskBefore = process.umask();
const imported = await import(pathToFileURL(modulePath).href);
if (typeof imported[exportName] !== 'function') {
  throw new Error(`REGISTRY_EXECUTOR_INVALID:${exportName}`);
}
for (const name of Object.getOwnPropertyNames(globalThis)) {
  if (!globalsBefore.has(name) || !Object.is(globalsBefore.get(name), globalThis[name])) {
    throw new Error(`REGISTRY_IMPORT_SIDE_EFFECT:globalThis.${name}`);
  }
}
if (
  process.cwd() !== cwdBefore
  || process.title !== titleBefore
  || process.umask() !== umaskBefore
  || Object.keys(process.env).length !== Object.keys(envBefore).length
  || Object.entries(envBefore).some(([name, value]) => process.env[name] !== value)
) {
  throw new Error('REGISTRY_IMPORT_SIDE_EFFECT:process-global');
}
process.stdout.write(`REGISTRY_IMPORT_AUDIT_OK:${exportName}\n`);
