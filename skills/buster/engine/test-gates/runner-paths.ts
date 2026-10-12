import fs from 'node:fs';
import path from 'node:path';
export function containedRelative(
  rootValue: string,
  childValue: string,
  label: string,
): string {
  const root = fs.realpathSync(rootValue);
  const child = fs.realpathSync(childValue);
  const relative = path.relative(root, child).split(path.sep).join("/");
  if (relative === "" || relative === ".." || relative.startsWith("../"))
    throw new Error(`${label}_OUTSIDE_WORKSPACE`);
  return relative;
}

export function secureDirectory(rootValue: string, label: string): string {
  const resolved = path.resolve(rootValue);
  const filesystemRoot = path.parse(resolved).root;
  let current = filesystemRoot;
  for (const part of path
    .relative(filesystemRoot, resolved)
    .split(path.sep)
    .filter(Boolean)) {
    current = path.join(current, part);
    try {
      const stat = fs.lstatSync(current);
      if (stat.isSymbolicLink()) throw new Error(`${label}_SYMLINK`);
      if (!stat.isDirectory()) throw new Error(`${label}_NOT_DIRECTORY`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      fs.mkdirSync(current);
      const created = fs.lstatSync(current);
      if (created.isSymbolicLink()) throw new Error(`${label}_SYMLINK`);
    }
  }
  return fs.realpathSync(resolved);
}

