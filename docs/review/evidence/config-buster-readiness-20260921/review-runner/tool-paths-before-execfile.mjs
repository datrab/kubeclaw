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
  const target = file === '/usr/bin/flock' ? executable : file === '/usr/bin/tar' ? process.env.KUBECLAW_TEST_TAR : undefined;
  if (!target) return Reflect.apply(original, this, [file, ...argumentsAndOptions]);
  if (!fs.statSync(target).isFile()) throw Error('LC_MAPPED_TOOL_REQUIRED');
  fs.appendFileSync(log, JSON.stringify({ pid: process.pid, method, requested: file, executable: target,
    arguments: argumentsAndOptions[0], optionsUnchanged: true }) + '\n');
  return Reflect.apply(original, this, [target, ...argumentsAndOptions]);
};
}
syncBuiltinESMExports();
