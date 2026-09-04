import fs from 'node:fs';
import path from 'node:path';

export function resolveExecutable(name: string, searchPath = process.env.PATH ?? ''): string {
  if (!name || path.basename(name) !== name) throw new Error('EXECUTABLE_NAME_INVALID');
  if (!searchPath) throw new Error(`EXECUTABLE_NOT_FOUND:${name}`);
  for (const directory of searchPath.split(path.delimiter)) {
    const candidate = path.join(directory || '.', name);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      if (!fs.statSync(candidate).isFile()) continue;
      return fs.realpathSync(candidate);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'EACCES' || code === 'ENOTDIR') continue;
      throw error;
    }
  }
  throw new Error(`EXECUTABLE_NOT_FOUND:${name}`);
}
