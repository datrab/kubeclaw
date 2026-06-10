import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'contracts/check-pipeline-complexity-budgets' });
import assert from 'assert';
import fs from 'fs';
import path from 'path';

function parseArgs(argv = process.argv.slice(2)) {
  const args = { sourceRoot: process.cwd() };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--source-root') args.sourceRoot = path.resolve(argv[i + 1]);
  }
  return args;
}

const { sourceRoot } = parseArgs();
const DEFAULT_MAX_LINES = 780;

const ROOTS = [
  'skills/nova/pipeline',
  'skills/buster/pipeline',
  'skills/common/pipeline',
];

function listRuntimeTsFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...listRuntimeTsFiles(fullPath));
    else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) results.push(fullPath);
  }
  return results;
}

function countLines(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  if (!text) return 0;
  return text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
}

const checked = [];
const violations = [];

for (const root of ROOTS) {
  const absRoot = path.join(sourceRoot, root);
  if (!fs.existsSync(absRoot)) continue;
  for (const filePath of listRuntimeTsFiles(absRoot)) {
    const relativePath = path.relative(sourceRoot, filePath).replace(/\\/g, '/');
    const lineCount = countLines(filePath);
    const maxLines = DEFAULT_MAX_LINES;
    checked.push({ path: relativePath, lines: lineCount, maxLines });
    if (lineCount > maxLines) {
      violations.push({ path: relativePath, lines: lineCount, maxLines });
    }
  }
}

const sortedLargest = [...checked]
  .sort((a, b) => b.lines - a.lines)
  .slice(0, 10);

assert.deepEqual(violations, [], `Pipeline complexity budget exceeded:\n${violations.map((v) => `- ${v.path}: ${v.lines}/${v.maxLines} lines`).join('\n')}`);

quietConsole.restore();
console.log(JSON.stringify({
  ok: true,
  defaultMaxLines: DEFAULT_MAX_LINES,
  checked: checked.length,
  extension: '.ts',
  largest: sortedLargest,
}));
