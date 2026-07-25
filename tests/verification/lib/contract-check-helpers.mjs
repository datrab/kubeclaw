import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export function parseSourceRootArgs(argv = process.argv.slice(2)) {
  let sourceRoot = process.cwd();
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== '--source-root') continue;
    sourceRoot = path.resolve(argv[index + 1]);
    index += 1;
  }
  return { sourceRoot };
}

export function walkFiles(dir, predicate, output = [], { skipDirectories = [] } = {}) {
  if (!fs.existsSync(dir)) return output;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!skipDirectories.includes(entry.name)) walkFiles(absolutePath, predicate, output, { skipDirectories });
    } else if (entry.isFile() && predicate(absolutePath)) {
      output.push(absolutePath);
    }
  }
  return output;
}

export function toRepoPath(sourceRoot, absolutePath) {
  return path.relative(sourceRoot, absolutePath).split(path.sep).join('/');
}

export function runNode(args, options = {}) {
  return spawnSync(process.execPath, args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    encoding: 'utf8',
    timeout: options.timeout ?? 10000,
  });
}
