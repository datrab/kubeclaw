import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const sha = (bytes: Buffer | string) => crypto.createHash('sha256').update(bytes).digest('hex');
export const json = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'));
export function jsonl(file: string): any[] {
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim() : '';
  if (!text) return [];
  return text.split('\n').filter(Boolean).map((line, index) => {
    try { return JSON.parse(line); }
    catch { throw new Error(`${file}:${index + 1}: invalid JSON`); }
  });
}

export function safeRelative(root: string, reference: string) {
  const target = path.resolve(root, reference);
  if (target !== path.resolve(root) && !target.startsWith(`${path.resolve(root)}${path.sep}`)) {
    throw new Error(`unsafe bundle reference: ${reference}`);
  }
  return target;
}

export function required(file: string, errors: string[], checks: string[], name: string) {
  checks.push(name);
  if (!fs.existsSync(file)) errors.push(`missing ${name}: ${file}`);
  return fs.existsSync(file);
}

export function gitState(repoRoot: string) {
  const commit = execFileSync('git', ['-C', repoRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const clean = execFileSync('git', ['-C', repoRoot, 'status', '--porcelain'], { encoding: 'utf8' }).trim() === '';
  return { commit, clean };
}

export function bundleHash(root: string) {
  const files: string[] = [];
  const walk = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile() && path.relative(root, absolute).split(path.sep).join('/') !== 'bundle-export.json') files.push(absolute);
    }
  };
  walk(root);
  return sha(files.sort((left, right) => path.relative(root, left).localeCompare(path.relative(root, right)))
    .map((file) => `${path.relative(root, file).split(path.sep).join('/')}\0${sha(fs.readFileSync(file))}\n`).join(''));
}
