/** Private negative control: exact production child bytes minus its SIGTERM hook. */
import childProcess from 'node:child_process';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import path from 'node:path';
const originalChild = path.resolve('skills/buster/engine/test-gates/provider-child.mjs');
const launcher = path.resolve('skills/common/plugin-runtime/foundation/isolation/plugin-sandbox');
const replacement = process.env.PC_CONTROL_CHILD;
const log = process.env.PC_CONTROL_LOG;
if (!replacement || !log || !fs.statSync(replacement).isFile()) throw Error('PC_CONTROL_CONFIGURATION_REQUIRED');
const spawn = childProcess.spawn;
childProcess.spawn = function(file, args, ...options) {
  if (file !== launcher || !args.includes(originalChild)) return Reflect.apply(spawn, this, [file, args, ...options]);
  if (!args.includes(`--allow-fs-read=${originalChild}`)) throw Error('PC_CONTROL_PERMISSION_BINDING_MISSING');
  const translated = args.map(arg => arg === originalChild ? replacement
    : arg === `--allow-fs-read=${originalChild}` ? `--allow-fs-read=${replacement}` : arg);
  fs.appendFileSync(log, JSON.stringify({ launcher, originalChild, replacement, originalArguments: args,
    actualArguments: translated, optionsUnchanged: true }) + '\n');
  return Reflect.apply(spawn, this, [file, translated, ...options]);
};
syncBuiltinESMExports();
