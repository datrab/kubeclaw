/** Test harness pathname mapping only. Arguments/options and real kernel effects are untouched. */
import childProcess from 'node:child_process';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const executable = process.env.LC_GNU_FLOCK;
const log = process.env.LC_TOOL_MAPPING_LOG;
if (!executable || !log || !fs.statSync(executable).isFile()) throw Error('LC_TOOL_MAPPING_CONFIGURATION_REQUIRED');
for (const method of ['spawn', 'spawnSync']) {
const original = childProcess[method];
childProcess[method] = function(file, ...argumentsAndOptions) {
  if (file !== '/usr/bin/flock') return Reflect.apply(original, this, [file, ...argumentsAndOptions]);
  fs.appendFileSync(log, JSON.stringify({ pid: process.pid, method, requested: file, executable,
    arguments: argumentsAndOptions[0], optionsUnchanged: true }) + '\n');
  return Reflect.apply(original, this, [executable, ...argumentsAndOptions]);
};
}
syncBuiltinESMExports();
