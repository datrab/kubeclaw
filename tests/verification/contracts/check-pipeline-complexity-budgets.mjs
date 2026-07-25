import { parseSourceRootArgs } from '../lib/contract-check-helpers.mjs';
import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'contracts/check-pipeline-complexity-budgets' });
import assert from 'assert';
import fs from 'fs';
import path from 'path';


const { sourceRoot } = parseSourceRootArgs();
const DEFAULT_MAX_LINES = 780;
const ACCEPTED_FILE_MAX_LINES = new Map([
  ['skills/nova/pipeline/agents/module-workers.ts', 842],
  ['skills/nova/pipeline/runners/approval-gate-runner.ts', 811],
  ['skills/nova/pipeline/runners/module-runner-forge.ts', 823],
  ['skills/nova/pipeline/runners/pipeline-runner-scheduling.ts', 829],
  ['skills/nova/pipeline/runners/pipeline-runner-terminal.ts', 831],
  ['skills/nova/pipeline/tools/project-summary.ts', 921],
  ['skills/buster/pipeline/suites/k8s.ts', 1170],
  ['skills/common/pipeline/agents/acp-monitor.ts', 810],
  ['skills/common/pipeline/integrations/git-worktree.ts', 794],
]);

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
    const acceptedMaxLines = ACCEPTED_FILE_MAX_LINES.get(relativePath);
    const maxLines = acceptedMaxLines === undefined ? DEFAULT_MAX_LINES : acceptedMaxLines;
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
