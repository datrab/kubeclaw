import fs from 'fs';
import path from 'path';
import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
import { sanitizeJsonEgress, sanitizeMarkdownText } from '../egress.ts';
import { addDiagnostic, discoverLatestLifecycleReadModels, extToLang, readJsonData, readJsonRecord } from './project-summary-lifecycle.ts';
import { buildCaseStudyBase, buildDiscordEmbeds, buildMarkdown, pct } from './project-summary-formatters.ts';
import * as Core from './project-summary-core.ts';
const { firstDefined, recordOrEmpty, arrayOrEmpty, entriesOf, keysOf, countMatches, numberOrZero, integerTextOrZero, firstNonEmptyLine, requiredNonEmptyConfigString, optionalEnvString, envFlag, projectSummaryDiscordMuted, resolveRepoDir, git, gitText, validateProjectSelector, resolveProjectPaths } = Core;
export function collectCodeStats(repoDir: any, projectRoot: any, diagnostics: any = null) {
  const relProject = path.relative(repoDir, projectRoot);
  let tracked = gitText(repoDir, ['ls-files', '--', relProject], diagnostics)
    .split('\n').filter(Boolean);

  // Fallback: walk filesystem when git ls-files returns no tracked project files.
  if (tracked.length === 0) {
    const walkFiles = (dir: any, base: any) => {
      const results: any[] = [];
      if (!fs.existsSync(dir)) return results;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (['node_modules', '__pycache__', '.git', '.venv', 'venv'].includes(entry.name)) continue;
        const full = path.join(dir, entry.name);
        const rel = path.join(base, entry.name);
        if (entry.isDirectory()) results.push(...walkFiles(full, rel));
        else results.push(rel);
      }
      return results;
    };
    tracked = walkFiles(projectRoot, relProject);
  }

  let totalLines = 0, totalFiles = 0, codeLines = 0;
  const byLang: any = {};
  const binaryExts = new Set(['.png','.jpg','.gif','.ico','.woff','.woff2','.ttf','.eot','.zip','.tar','.gz','.db','.sqlite']);

  for (const file of tracked) {
    const filePath = path.join(repoDir, file);
    if (!fs.existsSync(filePath)) continue;
    try {
      const stat = fs.statSync(filePath);
      if (selectTruthyValue(() => (stat.isDirectory()), () => (stat.size > 2 * 1024 * 1024))) continue;
      const ext = path.extname(file).toLowerCase();
      if (binaryExts.has(ext)) continue;
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n').length;
      totalLines += lines;
      totalFiles++;
      const isSwarm = file.includes('.swarm/');
      const lang = extToLang(ext) ?? 'Other';
      if (!byLang[lang]) byLang[lang] = { total: 0, code: 0, swarm: 0 };
      byLang[lang].total += lines;
      if (isSwarm) byLang[lang].swarm += lines; else { byLang[lang].code += lines; codeLines += lines; }
    } catch (_error: any) { /* INTENTIONAL_NONCRITICAL(fallback_reporting_failed): the authoritative operation must survive failure of this noncritical reporting channel. */ /* skip */ }
  }

  const swarmFiles = tracked.filter((f: any) => f.includes('.swarm/')).length;
  const codeFiles = totalFiles - swarmFiles;
  const commitCount = integerTextOrZero(gitText(repoDir, ['rev-list', '--count', 'HEAD', '--', relProject], diagnostics));
  const authors = [...new Set(gitText(repoDir, ['log', '--format=%aN', '--', relProject], diagnostics).split('\n').filter(Boolean))].sort();
  const firstCommit = firstNonEmptyLine(gitText(repoDir, ['log', '--reverse', '--format=%aI', '--', relProject], diagnostics));
  const lastCommit = gitText(repoDir, ['log', '-1', '--format=%aI', '--', relProject], diagnostics);

  return { totalLines, codeLines, totalFiles, codeFiles, swarmFiles, byLang, commitCount, authors,
    firstCommit, lastCommit: firstNonEmptyLine(lastCommit) };
}

// ── 2. Unit Test Census (from source code) ──────────────────────

export function collectUnitTestCensus(projectRoot: any) {
  const result = {
    python: { files: 0, functions: 0, lines: 0 },
    frontend: { files: 0, functions: 0, lines: 0 },
    totalFunctions: 0,
    totalFiles: 0,
  };
  const skipDirs = new Set(['node_modules', '__pycache__', '.swarm', '.git', '.venv', 'venv', 'dist', 'build', '.next']);

  const walk = (dir: any) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!skipDirs.has(entry.name)) walk(full);
        continue;
      }

      try {
        collectTestFile(entry.name, full, result);
      } catch (_error: any) { /* INTENTIONAL_NONCRITICAL(fallback_reporting_failed): the authoritative operation must survive failure of this noncritical reporting channel. */ /* skip unreadable */ }
    }
  };

  walk(projectRoot);
  result.totalFunctions = result.python.functions + result.frontend.functions;
  result.totalFiles = result.python.files + result.frontend.files;
  return result;
}

function collectTestFile(name: string, filePath: string, result: any): void {
  const content = fs.readFileSync(filePath, 'utf8');
  if (name.startsWith('test_') && name.endsWith('.py')) {
    const functions = countMatches(content, /(?:def|async def) test_/g);
    if (functions <= 0) return;
    result.python.files++;
    result.python.functions += functions;
    result.python.lines += content.split('\n').length;
    return;
  }
  if (!/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(name)) return;
  const blocks = countMatches(content, /\bit\(|\btest\(|\bdescribe\(/g);
  if (blocks <= 0) return;
  result.frontend.files++;
  result.frontend.functions += blocks;
  result.frontend.lines += content.split('\n').length;
}

// ── 3. API Test Spec Census ─────────────────────────────────────

export function collectApiTestCensus(swarmRoot: any, diagnostics: any = null) {
  const specs: any[] = [];
  let totalCases = 0;

  const walk = (dir: any) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (entry.name !== 'test-spec.json') continue;
      const data = readJsonData(full, diagnostics);
      if (!data?.tests) continue;
      const [, modDir = null] = path.relative(swarmRoot, full).split('/');
      if (!modDir) {
        addDiagnostic(diagnostics, {
          source: 'api_test_census',
          status: 'module_dir_missing',
          path: full,
          optional: true,
        });
        continue;
      }
      const count = data.tests.length;
      specs.push({ module: modDir, count });
      totalCases += count;
    }
  };
  walk(swarmRoot);
  return { specs, totalCases };
}

// ── 4. Pipeline Stats (lifecycle read models) ───────────────────
