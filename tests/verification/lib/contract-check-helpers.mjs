import fs from 'node:fs';
import path from 'node:path';

export function parseSourceRootArgs(argv = process.argv.slice(2)) {
  let sourceRoot = process.cwd();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument !== '--source-root') throw new Error(`UNKNOWN_ARGUMENT:${argument}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error('SOURCE_ROOT_ARGUMENT_MISSING');
    sourceRoot = value;
    index += 1;
  }
  const resolved = fs.realpathSync(path.resolve(sourceRoot));
  if (!fs.statSync(resolved).isDirectory()) throw new Error(`SOURCE_ROOT_NOT_DIRECTORY:${resolved}`);
  return Object.freeze({ sourceRoot: resolved });
}
