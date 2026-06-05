import fs from 'fs';
import path from 'path';

import { DEFAULT_TOOL_TIMEOUT } from './constants.ts';
import { safeExec } from './execution.ts';
import {
  discoverPlatformEslintConfigCandidates,
  discoverPlatformSemgrepConfigCandidates,
  findFiles,
  findNearestTsconfigDir,
  listPolicySourceFiles,
} from './discovery.ts';
import { extractPublicExportNames, tryParseJson } from './parsers.ts';
import {
  makeConfigMissingResult,
  makeParseFailureResult,
  makeWarningResult,
} from './report.ts';
import { log } from './output.ts';
import { registerContainerYamlTools } from './container-yaml-tools.ts';

const TOOL_REGISTRY = [];

function registerTool(tool) {
  TOOL_REGISTRY.push({
    timeout: DEFAULT_TOOL_TIMEOUT,
    ...tool,
  });
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

    if (findings.length === 0 && (result.exitCode !== 0 || result.timedOut)) {
      const output = (result.stdout || result.stderr || result.error || '').trim();
      const preview = output ? output.split('\n')[0].slice(0, 200) : 'no output captured';
      findings.push({
        file: path.join(tsconfigDir, 'tsconfig.json'),
        line: null,
        column: null,
        severity: 'error',
        code: result.timedOut ? 'tsc-timeout' : 'tsc-failed',
        message: `tsc failed without file-scoped diagnostics. exitCode=${result.exitCode}; preview=${preview}`,
      });
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

    const comments = Array.isArray(parsed.data) ? parsed.data : (parsed.data?.comments || []);
    const findings = comments.map(item => ({
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
    // Resolution chain for Semgrep config:
    //   1. --semgrep-config CLI flag (passed via ctx)
    //   2. /home/node/.openclaw/.semgrep.yml
    //   3. SWARM_CONFIG-adjacent .semgrep.yml fallback
    // If nothing is found, do not fall back to repo-local, env, or Semgrep registry auto mode; surface an explicit warning instead.
    const candidates = [
      ctx.semgrepConfig,
      ...discoverPlatformSemgrepConfigCandidates(),
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
      const message = 'Semgrep config missing or invalid: expected --semgrep-config, /home/node/.openclaw/.semgrep.yml, or SWARM_CONFIG-adjacent .semgrep.yml fallback. Skipping Semgrep instead of using repo-local, env, or registry auto mode.';
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

registerContainerYamlTools(registerTool);

export { TOOL_REGISTRY };
