import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncBuiltinESMExports } from 'node:module';

const manifest = process.env.COMPONENT_REVIEW_PROTECTED_SOURCES;
const violationLog = process.env.COMPONENT_REVIEW_WRITE_VIOLATIONS;
if (!manifest || !violationLog) throw Error('REVIEW_SOURCE_GUARD_CONFIGURATION_REQUIRED');
const append = fs.appendFileSync.bind(fs);
const rows = JSON.parse(fs.readFileSync(manifest, 'utf8'));
const names = new Set(rows.map(row => path.resolve(row.path)));
const identities = new Set(rows.map(row => `${row.dev}:${row.ino}`));

function absolute(value) {
  if (typeof value === 'number') return fs.readlinkSync(`/proc/self/fd/${value}`);
  return path.resolve(value instanceof URL ? fileURLToPath(value) : Buffer.isBuffer(value) ? value.toString() : value);
}
function denied(operation, file) {
  append(violationLog, `${JSON.stringify({ pid: process.pid, operation, file })}\n`);
  throw Error(`REVIEW_PROTECTED_SOURCE_WRITE:${operation}:${file}`);
}
function guardWrite(operation, value) {
  const file = absolute(value);
  if (names.has(file)) denied(operation, file);
  let stat;
  try { stat = fs.statSync(file, { bigint: true }); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (stat && identities.has(`${stat.dev}:${stat.ino}`)) denied(operation, file);
  let resolved;
  try { resolved = fs.realpathSync(file); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (resolved && names.has(resolved)) denied(operation, file);
}
function guardRemoval(operation, value) {
  const file = absolute(value);
  // Unlinking a temporary symlink is allowed: this is precisely how a fixture
  // safely detaches an alias. Removing the actual source or ancestor is not.
  if ([...names].some(name => name === file || name.startsWith(`${file}${path.sep}`))) denied(operation, file);
}
function wrap(object, name, check) {
  const original = object[name].bind(object);
  object[name] = function (...args) { check(...args); return original(...args); };
}
for (const suffix of ['', 'Sync']) {
  for (const name of ['writeFile', 'appendFile', 'truncate', 'chmod', 'chown', 'utimes']) {
    wrap(fs, name + suffix, file => guardWrite(name + suffix, file));
  }
  wrap(fs, 'copyFile' + suffix, (_source, destination) => guardWrite('copyFile' + suffix, destination));
  for (const name of ['unlink', 'rm', 'rmdir']) wrap(fs, name + suffix, file => guardRemoval(name + suffix, file));
  wrap(fs, 'rename' + suffix, (source, destination) => { guardRemoval('rename' + suffix, source); guardWrite('rename' + suffix, destination); });
  wrap(fs, 'open' + suffix, (file, flags) => {
    const writable = typeof flags === 'string' ? /[wa+]/.test(flags)
      : (flags & (fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_TRUNC | fs.constants.O_APPEND)) !== 0;
    if (writable) guardWrite('open' + suffix, file);
  });
}
for (const name of ['writeFile', 'appendFile', 'truncate', 'chmod', 'chown', 'utimes']) {
  wrap(fs.promises, name, file => guardWrite(`promises.${name}`, file));
}
wrap(fs.promises, 'copyFile', (_source, destination) => guardWrite('promises.copyFile', destination));
for (const name of ['unlink', 'rm', 'rmdir']) wrap(fs.promises, name, file => guardRemoval(`promises.${name}`, file));
wrap(fs.promises, 'rename', (source, destination) => { guardRemoval('promises.rename', source); guardWrite('promises.rename', destination); });
wrap(fs.promises, 'open', (file, flags) => {
  const writable = typeof flags === 'string' ? /[wa+]/.test(flags)
    : (flags & (fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_TRUNC | fs.constants.O_APPEND)) !== 0;
  if (writable) guardWrite('promises.open', file);
});

syncBuiltinESMExports();
