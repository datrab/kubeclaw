import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'contracts/check-phase10-final-reference-surface' });
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

function walkFiles(dir, predicate, output = []) {
  if (!fs.existsSync(dir)) return output;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      walkFiles(absPath, predicate, output);
    } else if (entry.isFile() && predicate(absPath)) {
      output.push(absPath);
    }
  }
  return output;
}

function toRepoPath(sourceRoot, absPath) {
  return path.relative(sourceRoot, absPath).split(path.sep).join('/');
}

function collectActiveReferenceFiles(sourceRoot) {
  const files = [];
  const textExts = new Set(['.md', '.json', '.yaml', '.yml', '.mjs', '.js', '.ts']);
  const roots = ['docs', 'skills', 'charts', 'my-values', 'plugins'];
  for (const root of roots) {
    files.push(...walkFiles(path.join(sourceRoot, root), (absPath) => {
      const relativePath = toRepoPath(sourceRoot, absPath);
      if (relativePath.startsWith('docs/archive/')) return false;
      if (relativePath.startsWith('docs/archive/ts-migration/')) return false;
      if (relativePath === 'docs/open-issues.md') return false;
      if (relativePath.startsWith('tests/verification/contracts/')) return false;
      return textExts.has(path.extname(absPath));
    }));
  }
  return files;
}

const { sourceRoot } = parseArgs();
const activeFiles = collectActiveReferenceFiles(sourceRoot);

const violations = [];
for (const absPath of activeFiles) {
  const source = fs.readFileSync(absPath, 'utf8');
  const relativePath = toRepoPath(sourceRoot, absPath);
  const activeJsReferences = source.match(/(?:\/app\/skills\/(?:pipeline|buster-pipeline|discord-purge)|skills\/(?:[A-Za-z0-9_-]+\/)+[A-Za-z0-9_.-]+)\.js\b/g) || [];
  for (const forbidden of activeJsReferences) {
    violations.push({ file: relativePath, forbidden });
  }
  const isReviewDoc = relativePath.startsWith('docs/archive/reviews/') || relativePath.startsWith('docs/archive/reviews2/');
  if (!isReviewDoc && relativePath.startsWith('docs/')) {
    for (const forbidden of source.match(/\b_(?:logDir|runLogDir|pluginRegistry)\b/g) || []) violations.push({ file: relativePath, forbidden });
  }
}

assert.deepEqual(violations, [], 'active docs/deployment/source files must not reference JavaScript skill paths or deleted runtime mirror fields');

for (const retained of [
  'skills/buster/buster-pipeline.ts',
  'skills/nova/pipeline.ts',
  'skills/nova/pipeline/cli.ts',
  'skills/nova/pipeline/tools/lint-report.ts',
  'skills/nova/pipeline/tools/project-summary.ts',
  'skills/nova/pipeline/tools/redis.ts',
]) {
  assert.equal(fs.existsSync(path.join(sourceRoot, retained)), true, `${retained} must exist as a retained runtime/operator adapter`);
}

const skillJsFiles = walkFiles(path.join(sourceRoot, 'skills'), (absPath) => absPath.endsWith('.js'))
  .map((absPath) => toRepoPath(sourceRoot, absPath));
assert.deepEqual(skillJsFiles, [], 'skills/* must contain zero JavaScript files');

quietConsole.restore();
console.log(JSON.stringify({ ok: true, checkedFiles: activeFiles.length, forbiddenReferences: violations.length }));
