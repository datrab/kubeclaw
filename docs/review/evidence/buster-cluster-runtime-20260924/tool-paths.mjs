/** Path translation for actual native tools, preserving Node callback and custom Promise contracts. */
import childProcess from 'node:child_process';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { promisify } from 'node:util';
const executable = process.env.LC_GNU_FLOCK;
const log = process.env.LC_TOOL_MAPPING_LOG;
if (!executable || !log || !fs.statSync(executable).isFile()) throw Error('LC_TOOL_MAPPING_CONFIGURATION_REQUIRED');
function mappedFile(file, argumentsAndOptions, method) {
  const target = file === '/usr/bin/flock' ? executable : file === '/usr/bin/tar' ? process.env.KUBECLAW_TEST_TAR : undefined;
  if (!target) return file;
  if (!fs.statSync(target).isFile()) throw Error('LC_MAPPED_TOOL_REQUIRED');
  fs.appendFileSync(log, JSON.stringify({ pid: process.pid, method, requested: file, executable: target,
    arguments: argumentsAndOptions[0], optionsUnchanged: true }) + '\n');
  return target;
}
for (const method of ['spawn', 'spawnSync', 'execFile', 'execFileSync']) {
  const original = childProcess[method];
  const wrapper = function(file, ...argumentsAndOptions) {
    return Reflect.apply(original, this, [mappedFile(file, argumentsAndOptions, method), ...argumentsAndOptions]);
  };
  const custom = Object.getOwnPropertyDescriptor(original, promisify.custom);
  if (custom) Object.defineProperty(wrapper, promisify.custom, { ...custom,
    value: function(file, ...argumentsAndOptions) {
      return Reflect.apply(custom.value, this,
        [mappedFile(file, argumentsAndOptions, `${method}:promisify`), ...argumentsAndOptions]);
    } });
  childProcess[method] = wrapper;
}
syncBuiltinESMExports();
