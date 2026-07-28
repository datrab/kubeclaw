import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { buildInventory } from './plugin-system-inventory-build.mjs';
import { renderMarkdown } from './plugin-system-inventory-markdown.mjs';

const root = path.resolve(import.meta.dirname, '..');
const rulesPath = path.join(root, 'docs/architecture/plugin-system-inventory.rules.json');
const coveragePath = path.join(root, 'docs/architecture/plugin-system-inventory.coverage.json');
const jsonOutputPath = path.join(root, 'docs/generated/inventory/plugin-system.json');
const markdownOutputPath = path.join(root, 'docs/architecture/plugin-system-current-inventory.md');
const checkMode = process.argv.includes('--check');
const acceptCoverage = process.argv.includes('--accept-coverage');

function relative(filePath) {
  return path.relative(root, filePath).split(path.sep).join('/');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function listFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(entryPath));
    else if (entry.isFile()) files.push(entryPath);
  }
  return files;
}

function shouldExclude(relPath, scan) {
  const normalized = `/${relPath}`;
  return scan.excludePaths.includes(relPath)
    || scan.excludeSuffixes.some((suffix) => relPath.endsWith(suffix))
    || scan.excludeSegments.some((segment) => normalized.includes(segment));
}

function inventoryPaths(scan) {
  const paths = new Set();
  for (const rootPath of scan.roots) {
    const absoluteRoot = path.join(root, rootPath);
    if (!fs.existsSync(absoluteRoot)) throw new Error(`Inventory root does not exist: ${rootPath}`);
    for (const filePath of listFiles(absoluteRoot)) {
      const relPath = relative(filePath);
      if (!shouldExclude(relPath, scan)) paths.add(relPath);
    }
  }
  for (const relPath of scan.files) {
    const absolutePath = path.join(root, relPath);
    if (!fs.existsSync(absolutePath)) throw new Error(`Inventory file does not exist: ${relPath}`);
    if (!shouldExclude(relPath, scan)) paths.add(relPath);
  }
  return [...paths].sort();
}

function coverageDifference(paths, approvedPaths) {
  const discovered = new Set(paths);
  const accepted = new Set(approvedPaths);
  return [
    ...paths.filter((item) => !accepted.has(item)).map((item) => `+ ${item}`),
    ...approvedPaths.filter((item) => !discovered.has(item)).map((item) => `- ${item}`),
  ];
}

function verifyCoverage(paths) {
  const expected = { schemaVersion: 'plugin-system-inventory-coverage-v1', paths };
  if (acceptCoverage) {
    fs.writeFileSync(coveragePath, `${JSON.stringify(expected, null, 2)}\n`);
    return;
  }
  if (!fs.existsSync(coveragePath)) {
    throw new Error('Plugin-system inventory coverage is missing. Review discovered files, then run: npm run plugin-system:inventory:accept-coverage');
  }
  const approved = readJson(coveragePath);
  const approvedPaths = Array.isArray(approved.paths) ? approved.paths : [];
  const differences = coverageDifference(paths, approvedPaths);
  if (!differences.length) return;
  throw new Error(
    `Plugin-system inventory coverage changed. Classify and review every path before accepting coverage:\n${differences.join('\n')}\n`
    + 'Then run: npm run plugin-system:inventory:accept-coverage',
  );
}

function ruleMatches(relPath, rule) {
  const checks = [];
  if (rule.prefixes?.length) checks.push(rule.prefixes.some((prefix) => relPath.startsWith(prefix)));
  if (rule.includesAny?.length) checks.push(rule.includesAny.some((value) => relPath.includes(value)));
  if (rule.pattern) checks.push(new RegExp(rule.pattern).test(relPath));
  if (checks.length === 0) throw new Error(`Classification rule ${rule.id} has no matcher`);
  return rule.match === 'all' ? checks.every(Boolean) : checks.some(Boolean);
}

function classify(relPath, rules) {
  const matched = rules.filter((candidate) => ruleMatches(relPath, candidate));
  const rule = matched[0];
  if (!rule) return null;
  return {
    ...rule.target,
    ruleId: rule.id,
    shadowedRuleIds: matched.slice(1).map((candidate) => candidate.id),
  };
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function verifyOrWrite(filePath, expected) {
  if (checkMode) {
    if (!fs.existsSync(filePath) || fs.readFileSync(filePath, 'utf8') !== expected) {
      throw new Error(`Plugin-system inventory is stale: ${relative(filePath)}. Run: npm run plugin-system:inventory`);
    }
    return;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, expected);
}

try {
  const inventory = buildInventory({
    root,
    rulesPath,
    readJson,
    inventoryPaths,
    verifyCoverage,
    classify,
    relative,
  });
  verifyOrWrite(jsonOutputPath, stableJson(inventory));
  verifyOrWrite(markdownOutputPath, renderMarkdown(inventory));
  console.log(checkMode
    ? `plugin-system inventory is current (${inventory.summary.files} files, ${inventory.summary.unclassified} unclassified)`
    : `generated plugin-system inventory (${inventory.summary.files} files, ${inventory.summary.unclassified} unclassified)`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
