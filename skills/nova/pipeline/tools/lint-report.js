#!/usr/bin/env node

// =============================================================================
// LINT-REPORT.JS — Deterministic Static Analysis Aggregator
// =============================================================================
//
// Runs applicable static analysis tools against a project or module scope,
// aggregates findings into a structured JSON report. Two tiers:
//
//   Tier 1 (pre-check): tsc + ruff + shellcheck — fast (<10s), after every Forge
//   Tier 2 (full):       All applicable tools — before Review Gates
//
// Usage:
//   node lint-report.js --repo /workspace/forgestack --tier full --output /tmp/lint-report.json
//   node lint-report.js --repo /workspace/forgestack --tier pre-check --module-path Projects/kubecommand/src/modules/06
//   node lint-report.js --repo /workspace/forgestack --tier full --changed-files "src/handler.ts,src/auth.ts"
//   node lint-report.js --help
//
// Output: JSON file with per-tool status, findings, and summary.
// Every tool is wrapped with timeout and error handling — a single tool failure
// never crashes the entire report.
//
// Design principle: same as pipeline.js — deterministic, no LLM involvement,
// scripts don't forget instructions.
//
// =============================================================================

import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

// ─── Constants ──────────────────────────────────────────────────────────────

const VERSION = '1.0.0';
const DEFAULT_TOOL_TIMEOUT = 30000; // 30s per tool
const DEFAULT_TIER = 'full';
const SOURCE_SWARM_CONFIG = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../charts/kubeclaw/files/config/swarm.config.json'
);

const TIERS = {
  'pre-check': 'Pre-check: fast type/lint checks only (tsc, ruff, shellcheck)',
  'full': 'Full report: all applicable tools',
};

function discoverPlatformSwarmConfigCandidates() {
  return [...new Set([
    path.join(os.homedir(), '.openclaw', 'swarm.config.json'),
    '/app/config/swarm.config.json',
    SOURCE_SWARM_CONFIG,
  ].filter(Boolean).map(candidate => path.resolve(candidate)))];
}

function discoverPlatformSemgrepConfigCandidates() {
  const candidates = [
    ...discoverPlatformSwarmConfigCandidates().map(swarmConfigPath => path.join(path.dirname(swarmConfigPath), '.semgrep.yml')),
    path.join(os.homedir(), '.openclaw', '.semgrep.yml'),
  ];

  return [...new Set(candidates.filter(Boolean))];
}

function discoverPlatformEslintConfigCandidates() {
  const candidates = [
    ...discoverPlatformSwarmConfigCandidates().map(swarmConfigPath => path.join(path.dirname(swarmConfigPath), 'eslint.config.mjs')),
    path.join(os.homedir(), '.openclaw', 'eslint.config.mjs'),
  ];

  return [...new Set(candidates.filter(Boolean))];
}

// ─── Tool Registry ──────────────────────────────────────────────────────────
//
// Each tool is registered with:
//   id          — unique key in the report
//   name        — human-readable label
//   tier        — minimum tier to run ('pre-check' runs in both tiers, 'full' only in full)
//   detect      — function(ctx) → boolean: should this tool run for this project?
//   run         — function(ctx) → { errors, warnings, findings[] }: execute and parse output
//   timeout     — per-tool timeout in ms (optional, defaults to DEFAULT_TOOL_TIMEOUT)

const TOOL_REGISTRY = [];

function registerTool(tool) {
  TOOL_REGISTRY.push({
    timeout: DEFAULT_TOOL_TIMEOUT,
    ...tool,
  });
}

// ─── Logging ────────────────────────────────────────────────────────────────

let _lintLogPath = null;  // Set via --log-path CLI arg — dual-write execution trace

function log(level, msg, data = null) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    component: 'lint-report',
    msg,
    ...(data !== null && { data }),
  };
  console.error(JSON.stringify(entry));
  if (_lintLogPath) {
    try { fs.appendFileSync(_lintLogPath, JSON.stringify(entry) + '\n'); } catch { /* non-critical */ }
  }
}

// ─── Tool Execution Helpers ─────────────────────────────────────────────────

/**
 * Run an external command safely. Returns { ok, stdout, stderr, exitCode }.
 * Never throws — all errors are captured in the return value.
 */
function safeExec(cmd, args, opts = {}) {
  const timeout = opts.timeout || DEFAULT_TOOL_TIMEOUT;
  try {
    const stdout = execFileSync(cmd, args, {
      encoding: 'utf8',
      timeout,
      maxBuffer: 10 * 1024 * 1024, // 10MB — eslint on large projects can be verbose
      cwd: opts.cwd || undefined,
      env: { ...process.env, ...opts.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { ok: true, stdout: stdout || '', stderr: '', exitCode: 0 };
  } catch (e) {
    // Many lint tools exit non-zero when they find issues — that's not an error,
    // that's the tool working correctly. We capture stdout/stderr regardless.
    return {
      ok: e.status === 0,
      stdout: e.stdout || '',
      stderr: e.stderr || '',
      exitCode: e.status ?? -1,
      timedOut: e.killed || false,
      error: e.killed ? `timeout after ${timeout}ms` : null,
    };
  }
}

/**
 * Check if a command is available in PATH.
 */
function commandExists(cmd) {
  try {
    execFileSync('which', [cmd], { encoding: 'utf8', stdio: 'pipe', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Safe JSON parse with fallback.
 */
function tryParseJson(str) {
  try {
    return { ok: true, data: JSON.parse(str) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function makeWarningResult({ file, code, message }) {
  return {
    errors: 0,
    warnings: 1,
    findings: [{
      file,
      line: null,
      column: null,
      severity: 'warning',
      code,
      message,
    }],
  };
}

function makeConfigMissingResult(ctx, code, message) {
  return makeWarningResult({
    file: ctx.modulePath ? path.join(ctx.repoRoot, ctx.modulePath) : ctx.repoRoot,
    code,
    message,
  });
}

function makeParseFailureResult(ctx, toolId, parsed, result, file = null) {
  const targetFile = file || (ctx.modulePath ? path.join(ctx.repoRoot, ctx.modulePath) : ctx.repoRoot);
  const output = (result.stdout || result.stderr || '').trim();
  const preview = output ? output.split('\n')[0].slice(0, 200) : 'no output captured';
  const message = `${toolId} output could not be parsed. parseError=${parsed.error}; exitCode=${result.exitCode}; preview=${preview}`;
  log('WARN', message, { file: targetFile });
  return makeWarningResult({
    file: targetFile,
    code: `${toolId}-parse-failed`,
    message,
  });
}

function findNearestTsconfigDir(repoRoot, modulePath = null) {
  const cwd = modulePath ? path.join(repoRoot, modulePath) : repoRoot;
  let tsconfigDir = cwd;

  while (tsconfigDir !== repoRoot && !fs.existsSync(path.join(tsconfigDir, 'tsconfig.json'))) {
    tsconfigDir = path.dirname(tsconfigDir);
  }

  if (fs.existsSync(path.join(tsconfigDir, 'tsconfig.json'))) {
    return tsconfigDir;
  }

  return null;
}

function isPolicyIgnoredFile(filePath) {
  const normalized = filePath.split(path.sep).join('/');
  return normalized.includes('/node_modules/')
    || normalized.includes('/dist/')
    || normalized.includes('/build/')
    || normalized.includes('/coverage/')
    || normalized.includes('/plugins/')
    || normalized.includes('/plugin/')
    || normalized.includes('/registry/')
    || normalized.includes('/registries/')
    || normalized.includes('/loader/')
    || normalized.includes('/loaders/')
    || normalized.includes('/migrations/')
    || /\.(test|spec)\.[jt]sx?$/.test(normalized)
    || normalized.includes('/test/')
    || normalized.includes('/tests/')
    || normalized.includes('/__tests__/')
    || /\.min\.(js|mjs|cjs)$/.test(normalized);
}

function listPolicySourceFiles(scanRoot) {
  return findFiles(scanRoot, f => /\.(js|jsx|ts|tsx|mjs|cjs)$/.test(f), 12)
    .filter(file => !isPolicyIgnoredFile(file));
}

function lineNumberFromIndex(text, index) {
  let line = 1;
  for (let i = 0; i < index; i++) {
    if (text[i] === '\n') line += 1;
  }
  return line;
}

function stripComments(sourceText) {
  return sourceText
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|\s+)\/\/.*$/gm, '$1');
}

function extractPublicExportNames(sourceText) {
  const text = stripComments(sourceText);
  const exports = [];
  const seen = new Set();

  const pushExport = (name, index) => {
    if (!name) return;
    const key = `${name}:${index}`;
    if (seen.has(key)) return;
    seen.add(key);
    exports.push({ name, line: lineNumberFromIndex(text, index) });
  };

  const declarationPatterns = [
    /\bexport\s+(?:declare\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
    /\bexport\s+default\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
    /\bexport\s+(?:declare\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/g,
    /\bexport\s+default\s+(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/g,
    /\bexport\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g,
    /\bexport\s+(?:interface|type|enum)\s+([A-Za-z_$][\w$]*)/g,
    /\bexports\.([A-Za-z_$][\w$]*)\s*=/g,
  ];

  for (const regex of declarationPatterns) {
    let match;
    while ((match = regex.exec(text)) !== null) {
      pushExport(match[1], match.index);
    }
  }

  const exportBlockRegex = /\bexport\s*\{([^}]+)\}(?:\s*from\s*['"][^'"]+['"])?/g;
  let blockMatch;
  while ((blockMatch = exportBlockRegex.exec(text)) !== null) {
    const names = blockMatch[1].split(',').map(part => part.trim()).filter(Boolean);
    for (const rawPart of names) {
      const part = rawPart.replace(/^type\s+/, '').trim();
      if (!part) continue;
      const aliasMatch = part.match(/^(.*?)\s+as\s+([A-Za-z_$][\w$]*)$/);
      const name = aliasMatch
        ? aliasMatch[2].trim()
        : (part.match(/^([A-Za-z_$][\w$]*)$/)?.[1] || null);
      pushExport(name, blockMatch.index);
    }
  }

  return exports;
}

// ─── Project Type Detection ─────────────────────────────────────────────────

/**
 * Detect project type(s) by looking for marker files.
 * A project can be multi-type (e.g. Full-Stack: JS + Python + Docker + Helm).
 *
 * @param {string} repoRoot - Repo root path
 * @param {string|null} modulePath - Optional module subdirectory to narrow scope
 * @returns {{ types: Set<string>, markers: object }}
 */
function detectProjectTypes(repoRoot, modulePath) {
  const scanRoot = modulePath ? path.join(repoRoot, modulePath) : repoRoot;
  const types = new Set();
  const markers = {};

  const checks = [
    { file: 'tsconfig.json',       type: 'typescript', search: [scanRoot, repoRoot] },
    { file: 'package.json',        type: 'javascript', search: [scanRoot, repoRoot] },
    { file: 'pyproject.toml',      type: 'python',     search: [scanRoot, repoRoot] },
    { file: 'requirements.txt',    type: 'python',     search: [scanRoot, repoRoot] },
    { file: 'setup.py',            type: 'python',     search: [scanRoot, repoRoot] },
    { file: 'Chart.yaml',          type: 'helm',       search: [scanRoot, repoRoot] },
  ];

  for (const check of checks) {
    for (const dir of check.search) {
      const fullPath = path.join(dir, check.file);
      if (fs.existsSync(fullPath)) {
        types.add(check.type);
        markers[check.type] = fullPath;
        break;
      }
    }
  }

  // Dockerfile detection — can be anywhere in the tree
  const dockerfiles = findFiles(scanRoot, f => /^Dockerfile|\.dockerfile$/i.test(f), 3);
  if (dockerfiles.length > 0) {
    types.add('docker');
    markers.docker = dockerfiles[0];
  }

  // Shell script detection — look for .sh files
  const shellFiles = findFiles(scanRoot, f => f.endsWith('.sh'), 3);
  if (shellFiles.length > 0) {
    types.add('shell');
    markers.shell = shellFiles[0];
  }

  // YAML detection — always true if any .yaml/.yml exists (for yamllint)
  const yamlFiles = findFiles(scanRoot, f => f.endsWith('.yaml') || f.endsWith('.yml'), 2);
  if (yamlFiles.length > 0) {
    types.add('yaml');
  }

  log('INFO', `Detected project types: ${[...types].join(', ')}`, { markers });
  return { types, markers };
}

/**
 * Find files matching a predicate, with max depth.
 * Lightweight alternative to glob — no dependencies.
 */
function findFiles(dir, predicate, maxDepth = 3, _depth = 0) {
  if (_depth > maxDepth || !fs.existsSync(dir)) return [];
  const results = [];

  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return []; }

  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isFile() && predicate(entry.name)) {
      results.push(fullPath);
    } else if (entry.isDirectory()) {
      results.push(...findFiles(fullPath, predicate, maxDepth, _depth + 1));
    }
  }
  return results;
}

// ─── Scope Resolution ───────────────────────────────────────────────────────

/**
 * Resolve the effective file scope for linting.
 * Priority: --changed-files > --module-path > full repo.
 *
 * @param {object} ctx - Run context
 * @returns {string[]} List of files to scope lint to, or empty for full scope
 */
function resolveScope(ctx) {
  if (ctx.changedFiles && ctx.changedFiles.length > 0) {
    // Verify files exist (forge_diff_stat may reference files that were deleted)
    const existing = ctx.changedFiles.filter(f => {
      const abs = path.isAbsolute(f) ? f : path.join(ctx.repoRoot, f);
      return fs.existsSync(abs);
    });
    log('INFO', `Scope: ${existing.length} changed files (${ctx.changedFiles.length} requested)`);
    return existing;
  }

  if (ctx.modulePath) {
    log('INFO', `Scope: module path ${ctx.modulePath}`);
    return []; // Tools will use modulePath as cwd/target
  }

  log('INFO', 'Scope: full repo');
  return [];
}

// ─── Tool Runner ────────────────────────────────────────────────────────────

/**
 * Run a single tool with full error handling.
 * Returns a standardized result object for the report.
 */
async function runTool(tool, ctx) {
  const startTime = Date.now();

  // Check if the tool binary exists
  const binaryName = tool.binary || tool.id;
  if (!commandExists(binaryName)) {
    return {
      status: 'skipped',
      reason: `${binaryName} not found in PATH`,
      duration_ms: 0,
    };
  }

  try {
    const result = await tool.run(ctx);
    const durationMs = Date.now() - startTime;

    return {
      status: 'ok',
      errors: result.errors || 0,
      warnings: result.warnings || 0,
      findings: result.findings || [],
      duration_ms: durationMs,
    };
  } catch (e) {
    const durationMs = Date.now() - startTime;
    log('WARN', `Tool ${tool.id} failed: ${e.message}`);

    return {
      status: 'error',
      error: e.message,
      duration_ms: durationMs,
    };
  }
}

/**
 * Run all applicable tools for the current context.
 * Returns the complete report object.
 */
async function runAllTools(ctx) {
  const tierOrder = ['pre-check', 'full'];
  const tierIndex = tierOrder.indexOf(ctx.tier);

  const applicable = TOOL_REGISTRY.filter(tool => {
    // Tier check: pre-check tools run in both tiers, full-only tools only in full
    const toolTierIndex = tierOrder.indexOf(tool.tier);
    if (toolTierIndex > tierIndex) return false;

    // Project type check
    if (!tool.detect(ctx)) return false;

    return true;
  });

  log('INFO', `Running ${applicable.length} tools (tier: ${ctx.tier})`, {
    tools: applicable.map(t => t.id),
  });

  const toolResults = {};
  for (const tool of applicable) {
    log('STEP', `Running: ${tool.name}`);
    toolResults[tool.id] = await runTool(tool, ctx);

    const r = toolResults[tool.id];
    if (r.status === 'ok') {
      log('OK', `${tool.name}: ${r.errors} errors, ${r.warnings} warnings (${r.duration_ms}ms)`);
    } else if (r.status === 'skipped') {
      log('INFO', `${tool.name}: skipped — ${r.reason}`);
    } else {
      log('WARN', `${tool.name}: error — ${r.error}`);
    }
  }

  // Build summary
  let totalErrors = 0;
  let totalWarnings = 0;
  let toolsOk = 0;
  let toolsSkipped = 0;
  let toolsFailed = 0;

  for (const r of Object.values(toolResults)) {
    if (r.status === 'ok') {
      toolsOk++;
      totalErrors += r.errors;
      totalWarnings += r.warnings;
    } else if (r.status === 'skipped') {
      toolsSkipped++;
    } else {
      toolsFailed++;
    }
  }

  return {
    project: ctx.project || path.basename(ctx.repoRoot),
    scope: ctx.modulePath || 'full',
    timestamp: new Date().toISOString(),
    tier: ctx.tier,
    changed_files: ctx.changedFiles || [],
    detected_types: [...ctx.projectTypes],
    tools: toolResults,
    summary: {
      total_errors: totalErrors,
      total_warnings: totalWarnings,
      tools_ok: toolsOk,
      tools_skipped: toolsSkipped,
      tools_failed: toolsFailed,
    },
  };
}

// ─── Tool Registrations ─────────────────────────────────────────────────────
// Each tool: detect → run → parse. Findings follow a consistent shape:
//   { file, line?, column?, severity: 'error'|'warning', code?, message }

// ── tsc (TypeScript type checking) ──
registerTool({
  id: 'tsc',
  name: 'TypeScript Compiler',
  binary: 'tsc',
  tier: 'pre-check',
  detect: (ctx) => ctx.projectTypes.has('typescript'),
  run: (ctx) => {
    const tsconfigDir = findNearestTsconfigDir(ctx.repoRoot, ctx.modulePath);
    if (!tsconfigDir) {
      const message = 'No tsconfig.json found for TypeScript lint run. Skipping tsc instead of guessing a working directory.';
      log('WARN', message, { repoRoot: ctx.repoRoot, modulePath: ctx.modulePath || null });
      return makeConfigMissingResult(ctx, 'tsconfig-missing', message);
    }

    const result = safeExec('tsc', ['--noEmit', '--pretty', 'false'], { cwd: tsconfigDir, timeout: 60000 });

    // tsc outputs errors to stdout, one per line: file(line,col): error TSxxxx: message
    const findings = [];
    const lines = (result.stdout || '').split('\n').filter(Boolean);
    for (const line of lines) {
      const match = line.match(/^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.+)$/);
      if (match) {
        findings.push({
          file: match[1],
          line: parseInt(match[2], 10),
          column: parseInt(match[3], 10),
          severity: match[4],
          code: match[5],
          message: match[6],
        });
      }
    }

    return {
      errors: findings.filter(f => f.severity === 'error').length,
      warnings: findings.filter(f => f.severity === 'warning').length,
      findings,
    };
  },
});

// ── repo policy (Custom maintainability checks) ──
registerTool({
  id: 'repo-policy',
  name: 'Repo Policy',
  binary: 'node',
  tier: 'full',
  detect: (ctx) => ctx.projectTypes.has('javascript') || ctx.projectTypes.has('typescript'),
  run: (ctx) => {
    const scanRoot = ctx.modulePath ? path.join(ctx.repoRoot, ctx.modulePath) : ctx.repoRoot;
    const findings = [];

    if (ctx.changedFiles.length > 0) {
      const hasRelevantChange = ctx.changedFiles.some(file =>
        /\.(js|jsx|ts|tsx|mjs|cjs)$/.test(file) || path.basename(file) === 'tsconfig.json'
      );
      if (!hasRelevantChange) {
        return { errors: 0, warnings: 0, findings: [] };
      }
    }

    if (ctx.projectTypes.has('typescript')) {
      const tsconfigDir = findNearestTsconfigDir(ctx.repoRoot, ctx.modulePath);
      if (!tsconfigDir) {
        const message = 'No tsconfig.json found for TypeScript policy checks. Skipping erasableSyntaxOnly enforcement.';
        log('WARN', message, { repoRoot: ctx.repoRoot, modulePath: ctx.modulePath || null });
        findings.push(...makeConfigMissingResult(ctx, 'tsconfig-missing', message).findings);
      } else {
        const tsconfigPath = path.join(tsconfigDir, 'tsconfig.json');
        const result = safeExec('tsc', ['--showConfig', '--project', tsconfigPath], {
          cwd: tsconfigDir,
          timeout: 60000,
        });
        const parsed = tryParseJson(result.stdout);
        if (!parsed.ok) {
          findings.push(...makeParseFailureResult(ctx, 'tsconfig-show-config', parsed, result, tsconfigPath).findings);
        } else {
          const erasableSyntaxOnly = parsed.data?.compilerOptions?.erasableSyntaxOnly;
          if (erasableSyntaxOnly !== true) {
            findings.push({
              file: tsconfigPath,
              line: null,
              column: null,
              severity: 'error',
              code: 'tsconfig-erasable-syntax-only-missing',
              message: 'TypeScript policy requires compilerOptions.erasableSyntaxOnly = true.',
            });
          }
        }
      }
    }

    const jsTsFiles = listPolicySourceFiles(scanRoot);
    const exportsByName = new Map();
    for (const file of jsTsFiles) {
      let sourceText;
      try {
        sourceText = fs.readFileSync(file, 'utf8');
      } catch (e) {
        findings.push(...makeWarningResult({
          file,
          code: 'repo-policy-read-failed',
          message: `Could not read file for repo policy checks: ${e.message}`,
        }).findings);
        continue;
      }

      for (const exported of extractPublicExportNames(sourceText)) {
        if (!exportsByName.has(exported.name)) exportsByName.set(exported.name, []);
        exportsByName.get(exported.name).push({ file, line: exported.line });
      }
    }

    for (const [name, occurrences] of exportsByName.entries()) {
      if (occurrences.length < 2) continue;
      const preview = occurrences
        .slice(0, 4)
        .map(({ file, line }) => `${path.relative(ctx.repoRoot, file)}:${line}`)
        .join(', ');
      findings.push({
        file: occurrences[0].file,
        line: occurrences[0].line,
        column: null,
        severity: 'warning',
        code: 'duplicate-public-export-name',
        message: `Public export name '${name}' appears ${occurrences.length} times in the scanned scope. Examples: ${preview}`,
      });
    }

    return {
      errors: findings.filter(f => f.severity === 'error').length,
      warnings: findings.filter(f => f.severity === 'warning').length,
      findings,
    };
  },
});

// ── ruff (Python linting) ──
registerTool({
  id: 'ruff',
  name: 'Ruff (Python Linter)',
  binary: 'ruff',
  tier: 'pre-check',
  detect: (ctx) => ctx.projectTypes.has('python'),
  run: (ctx) => {
    const target = ctx.modulePath ? path.join(ctx.repoRoot, ctx.modulePath) : ctx.repoRoot;
    const args = ['check', '--output-format', 'json', target];
    if (ctx.changedFiles.length > 0) {
      const pyFiles = ctx.changedFiles.filter(f => f.endsWith('.py'));
      if (pyFiles.length === 0) return { errors: 0, warnings: 0, findings: [] };
      args.length = 0;
      args.push('check', '--output-format', 'json', ...pyFiles.map(f => path.join(ctx.repoRoot, f)));
    }

    const result = safeExec('ruff', args, { cwd: ctx.repoRoot });
    const parsed = tryParseJson(result.stdout);
    if (!parsed.ok) return makeParseFailureResult(ctx, 'ruff', parsed, result, target);

    const findings = (parsed.data || []).map(item => ({
      file: item.filename || item.file,
      line: item.location?.row || item.line,
      column: item.location?.column || item.column,
      severity: item.fix ? 'warning' : 'error',
      code: item.code,
      message: item.message,
    }));

    return {
      errors: findings.filter(f => f.severity === 'error').length,
      warnings: findings.filter(f => f.severity === 'warning').length,
      findings,
    };
  },
});

// ── shellcheck (Shell script linting) ──
registerTool({
  id: 'shellcheck',
  name: 'ShellCheck',
  binary: 'shellcheck',
  tier: 'pre-check',
  detect: (ctx) => ctx.projectTypes.has('shell'),
  run: (ctx) => {
    const scanRoot = ctx.modulePath ? path.join(ctx.repoRoot, ctx.modulePath) : ctx.repoRoot;
    let shellFiles;

    if (ctx.changedFiles.length > 0) {
      shellFiles = ctx.changedFiles
        .filter(f => f.endsWith('.sh'))
        .map(f => path.join(ctx.repoRoot, f));
    } else {
      shellFiles = findFiles(scanRoot, f => f.endsWith('.sh'), 5);
    }

    if (shellFiles.length === 0) return { errors: 0, warnings: 0, findings: [] };

    const result = safeExec('shellcheck', ['--format', 'json', ...shellFiles], { cwd: ctx.repoRoot });
    const parsed = tryParseJson(result.stdout);
    if (!parsed.ok) return makeParseFailureResult(ctx, 'shellcheck', parsed, result, scanRoot);

    const findings = (parsed.data || []).map(item => ({
      file: item.file,
      line: item.line,
      column: item.column,
      severity: item.level === 'error' ? 'error' : 'warning',
      code: `SC${item.code}`,
      message: item.message,
    }));

    return {
      errors: findings.filter(f => f.severity === 'error').length,
      warnings: findings.filter(f => f.severity === 'warning').length,
      findings,
    };
  },
});

// ── eslint (JS/TS linting) ──
registerTool({
  id: 'eslint',
  name: 'ESLint',
  binary: 'eslint',
  tier: 'full',
  detect: (ctx) => ctx.projectTypes.has('javascript') || ctx.projectTypes.has('typescript'),
  run: (ctx) => {
    const target = ctx.modulePath ? path.join(ctx.repoRoot, ctx.modulePath) : ctx.repoRoot;
    const args = ['--format', 'json', '--no-error-on-unmatched-pattern'];

    // Resolution chain for ESLint config:
    //   1. --eslint-config CLI flag (passed via ctx)
    //   2. platform-level eslint.config.mjs discovered next to the canonical swarm config path
    // If nothing is found, do not fall back to repo-local or ESLint auto lookup, surface an explicit warning instead.
    const candidates = [
      ctx.eslintConfig,
      ...discoverPlatformEslintConfigCandidates(),
    ].filter(Boolean);

    let config = null;
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        config = candidate;
        break;
      }
    }

    if (config) {
      log('INFO', `ESLint using config: ${config}`);
      args.push('--config', config);
    } else {
      const message = 'No ESLint config found, expected --eslint-config or platform eslint.config.mjs. Skipping ESLint instead of using repo-local or implicit auto lookup.';
      log('WARN', message, { repoRoot: ctx.repoRoot });
      return makeConfigMissingResult(ctx, 'eslint-config-missing', message);
    }

    if (ctx.changedFiles.length > 0) {
      const jsFiles = ctx.changedFiles.filter(f => /\.(js|ts|jsx|tsx|mjs|cjs)$/.test(f));
      if (jsFiles.length === 0) return { errors: 0, warnings: 0, findings: [] };
      args.push(...jsFiles.map(f => path.join(ctx.repoRoot, f)));
    } else {
      args.push(target);
    }

    const result = safeExec('eslint', args, { cwd: ctx.repoRoot, timeout: 60000 });
    const parsed = tryParseJson(result.stdout);
    if (!parsed.ok) return makeParseFailureResult(ctx, 'eslint', parsed, result, target);

    const findings = [];
    for (const fileResult of (parsed.data || [])) {
      for (const msg of (fileResult.messages || [])) {
        findings.push({
          file: fileResult.filePath,
          line: msg.line,
          column: msg.column,
          severity: msg.severity === 2 ? 'error' : 'warning',
          code: msg.ruleId || null,
          message: msg.message,
        });
      }
    }

    return {
      errors: findings.filter(f => f.severity === 'error').length,
      warnings: findings.filter(f => f.severity === 'warning').length,
      findings,
    };
  },
});

// ── knip (Unused exports/deps/files) ──
registerTool({
  id: 'knip',
  name: 'Knip (Unused Code)',
  binary: 'knip',
  tier: 'full',
  detect: (ctx) => ctx.projectTypes.has('javascript') || ctx.projectTypes.has('typescript'),
  run: (ctx) => {
    const result = safeExec('knip', ['--reporter', 'json', '--no-progress'], {
      cwd: ctx.repoRoot,
      timeout: 60000,
    });

    const parsed = tryParseJson(result.stdout);
    if (!parsed.ok) return makeParseFailureResult(ctx, 'knip', parsed, result);

    const findings = [];
    const data = parsed.data || {};

    for (const [category, items] of Object.entries(data)) {
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        findings.push({
          file: item.filePath || item.file || null,
          line: item.line || null,
          column: null,
          severity: 'warning',
          code: `knip:${category}`,
          message: item.name
            ? `Unused ${category}: ${item.name}`
            : `Unused ${category}`,
        });
      }
    }

    return {
      errors: 0,
      warnings: findings.length,
      findings,
    };
  },
});

// ── madge (Circular dependencies) ──
registerTool({
  id: 'madge',
  name: 'Madge (Circular Dependencies)',
  binary: 'madge',
  tier: 'full',
  detect: (ctx) => ctx.projectTypes.has('javascript') || ctx.projectTypes.has('typescript'),
  run: (ctx) => {
    const target = ctx.modulePath ? path.join(ctx.repoRoot, ctx.modulePath) : ctx.repoRoot;
    const args = ['--circular', '--json'];

    if (ctx.projectTypes.has('typescript')) args.push('--ts-config', 'tsconfig.json');
    args.push(target);

    const result = safeExec('madge', args, { cwd: ctx.repoRoot, timeout: 60000 });
    const parsed = tryParseJson(result.stdout);
    if (!parsed.ok) return makeParseFailureResult(ctx, 'madge', parsed, result, target);

    const cycles = parsed.data || [];
    const findings = cycles.map(cycle => ({
      file: cycle[0] || null,
      line: null,
      column: null,
      severity: 'error',
      code: 'circular-dependency',
      message: `Circular dependency: ${cycle.join(' → ')}`,
    }));

    return {
      errors: findings.length,
      warnings: 0,
      findings,
    };
  },
});

// ── npm audit (Dependency security) ──
registerTool({
  id: 'npm-audit',
  name: 'npm audit',
  binary: 'npm',
  tier: 'full',
  detect: (ctx) => ctx.projectTypes.has('javascript') || ctx.projectTypes.has('typescript'),
  run: (ctx) => {
    const result = safeExec('npm', ['audit', '--json', '--omit=dev'], {
      cwd: ctx.repoRoot,
      timeout: 30000,
    });

    const parsed = tryParseJson(result.stdout);
    if (!parsed.ok) return makeParseFailureResult(ctx, 'npm-audit', parsed, result, path.join(ctx.repoRoot, 'package.json'));

    const findings = [];
    const vulns = parsed.data?.vulnerabilities || {};
    for (const [name, vuln] of Object.entries(vulns)) {
      findings.push({
        file: 'package.json',
        line: null,
        column: null,
        severity: vuln.severity === 'critical' || vuln.severity === 'high' ? 'error' : 'warning',
        code: `npm:${vuln.severity}`,
        message: `${name}: ${vuln.title || vuln.via?.[0]?.title || 'vulnerability found'} (${vuln.severity})`,
      });
    }

    return {
      errors: findings.filter(f => f.severity === 'error').length,
      warnings: findings.filter(f => f.severity === 'warning').length,
      findings,
    };
  },
});

// ── mypy (Python type checking) ──
registerTool({
  id: 'mypy',
  name: 'mypy (Python Types)',
  binary: 'mypy',
  tier: 'full',
  detect: (ctx) => ctx.projectTypes.has('python'),
  run: (ctx) => {
    const target = ctx.modulePath ? path.join(ctx.repoRoot, ctx.modulePath) : ctx.repoRoot;
    const args = ['--output', 'json', '--no-color-output', target];

    if (ctx.changedFiles.length > 0) {
      const pyFiles = ctx.changedFiles.filter(f => f.endsWith('.py'));
      if (pyFiles.length === 0) return { errors: 0, warnings: 0, findings: [] };
      args.length = 0;
      args.push('--output', 'json', '--no-color-output', ...pyFiles.map(f => path.join(ctx.repoRoot, f)));
    }

    const result = safeExec('mypy', args, { cwd: ctx.repoRoot, timeout: 60000 });

    // mypy JSON output: one JSON object per line
    const findings = [];
    let parseFailure = null;
    const lines = (result.stdout || '').split('\n').filter(Boolean);
    for (const line of lines) {
      const parsed = tryParseJson(line);
      if (!parsed.ok) {
        parseFailure ||= { parsed, line };
        continue;
      }
      const item = parsed.data;
      findings.push({
        file: item.file,
        line: item.line,
        column: item.column,
        severity: item.severity === 'error' ? 'error' : 'warning',
        code: item.code || null,
        message: item.message,
      });
    }

    if (parseFailure) {
      findings.push(...makeWarningResult({
        file: target,
        code: 'mypy-parse-failed',
        message: `mypy output included unparsable JSON lines. parseError=${parseFailure.parsed.error}; preview=${parseFailure.line.slice(0, 200)}`,
      }).findings);
    }

    return {
      errors: findings.filter(f => f.severity === 'error').length,
      warnings: findings.filter(f => f.severity === 'warning').length,
      findings,
    };
  },
});

// ── pip-audit (Python dependency security) ──
registerTool({
  id: 'pip-audit',
  name: 'pip-audit',
  binary: 'pip-audit',
  tier: 'full',
  detect: (ctx) => ctx.projectTypes.has('python'),
  run: (ctx) => {
    const result = safeExec('pip-audit', ['--format', 'json'], {
      cwd: ctx.repoRoot,
      timeout: 60000,
    });

    const parsed = tryParseJson(result.stdout);
    if (!parsed.ok) return makeParseFailureResult(ctx, 'pip-audit', parsed, result, path.join(ctx.repoRoot, 'requirements.txt'));

    const findings = (parsed.data?.dependencies || parsed.data || [])
      .filter(dep => dep.vulns?.length > 0)
      .flatMap(dep => dep.vulns.map(vuln => ({
        file: 'requirements.txt',
        line: null,
        column: null,
        severity: 'error',
        code: vuln.id || null,
        message: `${dep.name} ${dep.version}: ${vuln.description || vuln.id}`,
      })));

    return {
      errors: findings.length,
      warnings: 0,
      findings,
    };
  },
});

// ── semgrep (Pattern-based static analysis) ──
registerTool({
  id: 'semgrep',
  name: 'Semgrep',
  binary: 'semgrep',
  tier: 'full',
  detect: () => true, // Multi-language — always applicable
  run: (ctx) => {
    const target = ctx.modulePath ? path.join(ctx.repoRoot, ctx.modulePath) : ctx.repoRoot;
    const repoSemgrepConfig = path.join(ctx.repoRoot, '.semgrep.yml');

    // Resolution chain for Semgrep config:
    //   1. --semgrep-config CLI flag (passed via ctx)
    //   2. platform-level .semgrep.yml discovered next to SWARM_CONFIG or under ~/.openclaw/
    //   3. <repo>/.semgrep.yml (legacy repo-level fallback)
    // If nothing is found, do not fall back to env or Semgrep registry auto mode, surface an explicit warning instead.
    const candidates = [
      ctx.semgrepConfig,
      ...discoverPlatformSemgrepConfigCandidates(),
      repoSemgrepConfig,
    ].filter(Boolean);

    let config = null;
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        config = candidate;
        break;
      }
    }

    if (config) {
      log('INFO', `Semgrep using config: ${config}`);
    } else {
      const message = 'No Semgrep config found, expected --semgrep-config, platform .semgrep.yml, or legacy repo .semgrep.yml. Skipping Semgrep instead of using env or registry auto mode.';
      log('WARN', message, { repoRoot: ctx.repoRoot });
      return makeConfigMissingResult(ctx, 'semgrep-config-missing', message);
    }

    const args = ['scan', '--json', '--config', config, '--quiet', target];

    if (ctx.changedFiles.length > 0) {
      args.length = 0;
      args.push('scan', '--json', '--config', config, '--quiet',
        ...ctx.changedFiles.map(f => path.join(ctx.repoRoot, f)));
    }

    const result = safeExec('semgrep', args, { cwd: ctx.repoRoot, timeout: 120000 });
    const parsed = tryParseJson(result.stdout);
    if (!parsed.ok) return makeParseFailureResult(ctx, 'semgrep', parsed, result, target);

    const findings = (parsed.data?.results || []).map(item => ({
      file: item.path,
      line: item.start?.line,
      column: item.start?.col,
      severity: item.extra?.severity === 'ERROR' ? 'error' : 'warning',
      code: item.check_id,
      message: item.extra?.message || item.check_id,
    }));

    return {
      errors: findings.filter(f => f.severity === 'error').length,
      warnings: findings.filter(f => f.severity === 'warning').length,
      findings,
    };
  },
});

// ── hadolint (Dockerfile linting) ──
registerTool({
  id: 'hadolint',
  name: 'Hadolint (Dockerfile)',
  binary: 'hadolint',
  tier: 'full',
  detect: (ctx) => ctx.projectTypes.has('docker'),
  run: (ctx) => {
    const scanRoot = ctx.modulePath ? path.join(ctx.repoRoot, ctx.modulePath) : ctx.repoRoot;
    const dockerfiles = findFiles(scanRoot, f => /^Dockerfile|\.dockerfile$/i.test(f), 3);
    if (dockerfiles.length === 0) return { errors: 0, warnings: 0, findings: [] };

    const allFindings = [];
    for (const dockerfile of dockerfiles) {
      const result = safeExec('hadolint', ['--format', 'json', dockerfile]);
      const parsed = tryParseJson(result.stdout);
      if (!parsed.ok) {
        allFindings.push(...makeParseFailureResult(ctx, 'hadolint', parsed, result, dockerfile).findings);
        continue;
      }

      for (const item of (parsed.data || [])) {
        allFindings.push({
          file: dockerfile,
          line: item.line,
          column: item.column,
          severity: item.level === 'error' ? 'error' : 'warning',
          code: item.code,
          message: item.message,
        });
      }
    }

    return {
      errors: allFindings.filter(f => f.severity === 'error').length,
      warnings: allFindings.filter(f => f.severity === 'warning').length,
      findings: allFindings,
    };
  },
});

// ── helm lint (Helm chart validation) ──
registerTool({
  id: 'helm-lint',
  name: 'Helm Lint',
  binary: 'helm',
  tier: 'full',
  detect: (ctx) => ctx.projectTypes.has('helm'),
  run: (ctx) => {
    const scanRoot = ctx.modulePath ? path.join(ctx.repoRoot, ctx.modulePath) : ctx.repoRoot;

    // Find Chart.yaml and lint from its parent directory
    const chartFiles = findFiles(scanRoot, f => f === 'Chart.yaml', 3);
    if (chartFiles.length === 0) return { errors: 0, warnings: 0, findings: [] };

    const allFindings = [];
    for (const chartFile of chartFiles) {
      const chartDir = path.dirname(chartFile);
      const result = safeExec('helm', ['lint', '--strict', chartDir], { cwd: ctx.repoRoot });
      const output = result.stdout + result.stderr;

      // Parse helm lint output: [ERROR] or [WARNING] lines
      const lines = output.split('\n');
      for (const line of lines) {
        const errorMatch = line.match(/\[ERROR\]\s+(.+)/);
        const warnMatch = line.match(/\[WARNING\]\s+(.+)/);
        if (errorMatch) {
          allFindings.push({
            file: chartDir,
            line: null,
            column: null,
            severity: 'error',
            code: 'helm-lint',
            message: errorMatch[1],
          });
        } else if (warnMatch) {
          allFindings.push({
            file: chartDir,
            line: null,
            column: null,
            severity: 'warning',
            code: 'helm-lint',
            message: warnMatch[1],
          });
        }
      }
    }

    return {
      errors: allFindings.filter(f => f.severity === 'error').length,
      warnings: allFindings.filter(f => f.severity === 'warning').length,
      findings: allFindings,
    };
  },
});

// ── kubeconform (K8s manifest validation) ──
registerTool({
  id: 'kubeconform',
  name: 'Kubeconform',
  binary: 'kubeconform',
  tier: 'full',
  detect: (ctx) => ctx.projectTypes.has('helm'),
  run: (ctx) => {
    const scanRoot = ctx.modulePath ? path.join(ctx.repoRoot, ctx.modulePath) : ctx.repoRoot;
    const yamlFiles = findFiles(scanRoot, f => (f.endsWith('.yaml') || f.endsWith('.yml')) && !f.includes('values'), 4);
    if (yamlFiles.length === 0) return { errors: 0, warnings: 0, findings: [] };

    const result = safeExec('kubeconform', ['-output', 'json', '-summary', ...yamlFiles], {
      cwd: ctx.repoRoot,
    });

    const findings = [];
    let parseFailure = null;
    const lines = (result.stdout || '').split('\n').filter(Boolean);
    for (const line of lines) {
      const parsed = tryParseJson(line);
      if (!parsed.ok) {
        parseFailure ||= { parsed, line };
        continue;
      }
      const item = parsed.data;
      if (item.status === 'statusInvalid' || item.status === 'statusError') {
        findings.push({
          file: item.filename,
          line: null,
          column: null,
          severity: 'error',
          code: 'kubeconform',
          message: item.msg || `Invalid K8s manifest: ${item.filename}`,
        });
      }
    }

    if (parseFailure) {
      findings.push(...makeWarningResult({
        file: scanRoot,
        code: 'kubeconform-parse-failed',
        message: `kubeconform output included unparsable JSON lines. parseError=${parseFailure.parsed.error}; preview=${parseFailure.line.slice(0, 200)}`,
      }).findings);
    }

    return {
      errors: findings.filter(f => f.severity === 'error').length,
      warnings: findings.filter(f => f.severity === 'warning').length,
      findings,
    };
  },
});

// ── yamllint (YAML syntax) ──
registerTool({
  id: 'yamllint',
  name: 'yamllint',
  binary: 'yamllint',
  tier: 'full',
  detect: (ctx) => ctx.projectTypes.has('yaml'),
  run: (ctx) => {
    const scanRoot = ctx.modulePath ? path.join(ctx.repoRoot, ctx.modulePath) : ctx.repoRoot;
    const args = ['-f', 'parsable', '--strict', scanRoot];

    if (ctx.changedFiles.length > 0) {
      const yamlFiles = ctx.changedFiles.filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
      if (yamlFiles.length === 0) return { errors: 0, warnings: 0, findings: [] };
      args.length = 0;
      args.push('-f', 'parsable', '--strict', ...yamlFiles.map(f => path.join(ctx.repoRoot, f)));
    }

    const result = safeExec('yamllint', args, { cwd: ctx.repoRoot, timeout: 30000 });

    // parsable format: file:line:col: [level] message (rule)
    const findings = [];
    const lines = (result.stdout || result.stderr || '').split('\n').filter(Boolean);
    for (const line of lines) {
      const match = line.match(/^(.+?):(\d+):(\d+): \[(error|warning)\] (.+)/);
      if (match) {
        findings.push({
          file: match[1],
          line: parseInt(match[2], 10),
          column: parseInt(match[3], 10),
          severity: match[4],
          code: 'yamllint',
          message: match[5],
        });
      }
    }

    return {
      errors: findings.filter(f => f.severity === 'error').length,
      warnings: findings.filter(f => f.severity === 'warning').length,
      findings,
    };
  },
});

// ─── CLI Entrypoint ─────────────────────────────────────────────────────────

function printHelp() {
  console.error(`
lint-report.js v${VERSION} — Deterministic Static Analysis Aggregator

Usage: node lint-report.js [options]

Required:
  --repo <path>           Git repo root

Optional:
  --tier <tier>           Tool tier: 'pre-check' or 'full' (default: full)
  --module-path <path>    Relative module path to narrow scope (e.g. Projects/kubecommand/src/modules/06)
  --project <name>        Project name for report metadata
  --output <path>         Write JSON report to file (default: stdout)
  --changed-files <list>  Comma-separated list of changed files (repo-relative)
  --semgrep-config <path> Path to .semgrep.yml (default: auto-detect)
  --eslint-config <path>  Path to eslint.config.* (default: auto-detect)
  --help                  Show this help

Tiers:
  pre-check   Fast checks only: tsc + ruff + shellcheck (<10s)
  full        All applicable tools based on project type detection

Examples:
  node lint-report.js --repo /workspace/forgestack --tier full
  node lint-report.js --repo /workspace/forgestack --tier pre-check --project kubecommand
  node lint-report.js --repo /workspace/forgestack --changed-files "src/handler.ts,src/auth.ts"
  `);
}

async function main() {
  const args = process.argv.slice(2);
  const flags = {};

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if      (a === '--repo'          && args[i + 1]) flags.repo = args[++i];
    else if (a === '--tier'          && args[i + 1]) flags.tier = args[++i];
    else if (a === '--module-path'   && args[i + 1]) flags.modulePath = args[++i];
    else if (a === '--project'       && args[i + 1]) flags.project = args[++i];
    else if (a === '--output'        && args[i + 1]) flags.output = args[++i];
    else if (a === '--changed-files' && args[i + 1]) flags.changedFiles = args[++i];
    else if (a === '--semgrep-config' && args[i + 1]) flags.semgrepConfig = args[++i];
    else if (a === '--eslint-config' && args[i + 1]) flags.eslintConfig = args[++i];
    else if (a === '--log-path'       && args[i + 1]) flags.logPath = args[++i];
    else if (a === '--help') { printHelp(); process.exit(0); }
  }

  if (!flags.repo) {
    console.error('ERROR: --repo is required. Use --help for usage.');
    process.exit(1);
  }

  const repoRoot = path.resolve(flags.repo);
  if (!fs.existsSync(repoRoot)) {
    console.error(`ERROR: repo path does not exist: ${repoRoot}`);
    process.exit(1);
  }

  const tier = flags.tier || DEFAULT_TIER;
  if (!TIERS[tier]) {
    console.error(`ERROR: unknown tier '${tier}'. Valid: ${Object.keys(TIERS).join(', ')}`);
    process.exit(1);
  }

  const changedFiles = flags.changedFiles
    ? flags.changedFiles.split(',').map(f => f.trim()).filter(Boolean)
    : [];

  // Detect project types
  const { types: projectTypes } = detectProjectTypes(repoRoot, flags.modulePath);

  // Build context
  const ctx = {
    repoRoot,
    modulePath: flags.modulePath || null,
    project: flags.project || path.basename(repoRoot),
    tier,
    changedFiles,
    projectTypes,
    semgrepConfig: flags.semgrepConfig || null,
    eslintConfig: flags.eslintConfig || null,
  };

  // Enable execution trace logging if --log-path provided
  if (flags.logPath) {
    try { fs.mkdirSync(path.dirname(flags.logPath), { recursive: true }); } catch { /* ok */ }
    _lintLogPath = flags.logPath;
  }

  // Resolve effective scope
  resolveScope(ctx);

  // Run tools
  log('INFO', `Starting lint report (tier: ${tier}, types: ${[...projectTypes].join(', ')})`);
  const report = await runAllTools(ctx);

  // Output
  const json = JSON.stringify(report, null, 2) + '\n';

  if (flags.output) {
    fs.writeFileSync(flags.output, json);
    log('OK', `Report written to ${flags.output}`);
    log('OK', `Summary: ${report.summary.total_errors} errors, ${report.summary.total_warnings} warnings ` +
      `(${report.summary.tools_ok} ok, ${report.summary.tools_skipped} skipped, ${report.summary.tools_failed} failed)`);
  } else {
    process.stdout.write(json);
  }

  // Exit with error code if there are errors (useful for pre-check in pipeline)
  process.exit(report.summary.total_errors > 0 ? 1 : 0);
}

// ─── Exports (for pipeline.js to import directly) ──────────────────────────

export { runAllTools, detectProjectTypes, TOOL_REGISTRY, TIERS };
export default main;

// ─── Direct execution ──────────────────────────────────────────────────────

const __currentPath = fs.realpathSync(fileURLToPath(import.meta.url));
const __entryPath = (process.argv[1] && fs.existsSync(process.argv[1]))
  ? fs.realpathSync(process.argv[1])
  : process.argv[1];

if (__currentPath === __entryPath) {
  main().catch(e => {
    log('ERROR', e.message);
    process.exit(1);
  });
}
