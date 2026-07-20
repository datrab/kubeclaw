import fs from 'fs';
import os from 'os';
import path from 'path';

import { requireToolExecution, safeExec } from './execution.ts';
import {
  configuredTargetPaths,
  findFiles,
  listConfiguredTargetFiles,
} from './discovery.ts';
import { tryParseJson } from './parsers.ts';
import {
  failConfigMissing,
  failParse,
  notApplicable,
} from './report.ts';
import { log } from './output.ts';
import { registerContainerYamlTools } from './container-yaml-tools.ts';
import { registerKubernetesSecurityTools } from './kubernetes-security-tools.ts';
import { registerGoTools, registerTerraformTools } from './go-terraform-tools.ts';
import { registerArchitectureTools } from './architecture-tools.ts';

import { selectDefinedValue, selectTruthyValue } from '../../optional-absence.ts';
const TOOL_ADAPTERS = [];
const TOOL_OUTPUT_EMPTY = '';
const TOOL_OUTPUT_PREVIEW_MISSING = 'no output captured';
const LINT_VULNERABILITY_FOUND = 'vulnerability found';

function textValue(value) {
  return typeof value === 'string' ? value : TOOL_OUTPUT_EMPTY;
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function recordValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function selectPresentValue(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return TOOL_OUTPUT_EMPTY;
}

function eslintFindingSeed(ctx, fileResult, message, occurrences) {
  const file = path.relative(ctx.repoRoot, fileResult.filePath).split(path.sep).join('/');
  const sourceLine = textValue(fileResult.source).split('\n')[Math.max(0, (message.line || 1) - 1)]?.trim() || '';
  const key = JSON.stringify({ code: message.ruleId || 'eslint', file, message: message.message, source_line: sourceLine });
  const occurrence = (occurrences.get(key) || 0) + 1;
  occurrences.set(key, occurrence);
  return { code: message.ruleId || 'eslint', file, message: message.message, source_line: sourceLine, occurrence };
}

function requireString(value, label) {
  if (selectTruthyValue(() => (typeof value !== 'string'), () => (!value.trim()))) throw new Error(`${label}: required non-empty string`);
  return value.trim();
}

function requireNumber(value, label) {
  if (selectTruthyValue(() => (typeof value !== 'number'), () => (!Number.isFinite(value)))) throw new Error(`${label}: required number`);
  return value;
}

function isJavaScriptOrTypeScriptProject(ctx) {
  return selectTruthyValue(() => (ctx.projectTypes.has('javascript')), () => (ctx.projectTypes.has('typescript')));
}

function pathContains(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function affectedTypeScriptConfigs(ctx) {
  const configs = configuredTargetPaths(ctx);
  if (ctx.changedFilesRequested) {
    const changes = ctx.changedFiles.map(file => path.resolve(ctx.repoRoot, file));
    return configs.filter(config => changes.some(change => pathContains(path.dirname(config), change)));
  }
  if (ctx.requestedModulePath) {
    const requested = path.resolve(ctx.repoRoot, ctx.requestedModulePath);
    return configs.filter(config => pathContains(path.dirname(config), requested) || pathContains(requested, path.dirname(config)));
  }
  return configs;
}

function npmAuditSeverity(severity) {
  return selectTruthyValue(() => (severity === 'critical'), () => (severity === 'high')) ? 'error' : 'warning';
}

function registerTool(tool) {
  TOOL_ADAPTERS.push(tool);
}

function buildToolRegistry(policy, projectTypes) {
  const adapters = new Map(TOOL_ADAPTERS.map(adapter => [adapter.id, adapter]));
  const configured = policy.tools.map((settings) => {
    const adapter = adapters.get(settings.id);
    if (!adapter) throw Object.assign(new Error(`No lint adapter exists for configured tool '${settings.id}'`), { code: 'LINT_POLICY_ADAPTER_MISSING' });
    return {
      id: adapter.id,
      name: adapter.name,
      binary: adapter.binary,
      run: adapter.run,
      ...settings,
      detect: () => settings.languages.length === 0 || settings.languages.some(language => projectTypes.has(language)),
    };
  });
  const configuredIds = new Set(policy.tools.map(tool => tool.id));
  const unconfigured = TOOL_ADAPTERS.filter(adapter => !configuredIds.has(adapter.id)).map(adapter => adapter.id);
  if (unconfigured.length > 0) throw Object.assign(new Error(`Lint adapters missing canonical policy: ${unconfigured.join(', ')}`), { code: 'LINT_POLICY_TOOL_MISSING' });
  return configured;
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
    const findings = [];
    const configs = affectedTypeScriptConfigs(ctx);
    if (configs.length === 0) return notApplicable('No configured TypeScript project is affected by the requested scope.');
    for (const config of configs) {
      const result = requireToolExecution(safeExec('tsc', ['--noEmit', '--pretty', 'false', '--project', config], { cwd: ctx.repoRoot, timeout: ctx.tool.timeout_ms }), 'tsc');
      const lines = textValue(result.stdout).split('\n').filter(Boolean);
      const findingsBefore = findings.length;
      for (const line of lines) {
        const match = line.match(/^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.+)$/);
        if (match) {
          findings.push({ file: match[1], line: parseInt(match[2], 10), column: parseInt(match[3], 10), severity: match[4], code: match[5], message: match[6] });
        }
      }
      if (findings.length === findingsBefore && result.exitCode !== 0) {
        const output = selectPresentValue(result.stdout, result.stderr, result.error).trim();
        const preview = output ? output.split('\n')[0].slice(0, 200) : TOOL_OUTPUT_PREVIEW_MISSING;
        throw Object.assign(new Error(`tsc failed without file-scoped diagnostics for ${config}. exitCode=${result.exitCode}; preview=${preview}`), { code: 'tsc-output-invalid' });
      }
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
    if (ctx.changedFilesRequested) {
      const pyFiles = ctx.changedFiles.filter(f => f.endsWith('.py'));
      if (pyFiles.length === 0) return { errors: 0, warnings: 0, findings: [] };
      args.length = 0;
      args.push('check', '--output-format', 'json', ...pyFiles.map(f => path.join(ctx.repoRoot, f)));
    }

    const result = requireToolExecution(safeExec('ruff', args, { cwd: ctx.repoRoot, timeout: ctx.tool.timeout_ms }), 'ruff');
    const parsed = tryParseJson(result.stdout);
    if (!parsed.ok) return failParse(ctx, 'ruff', parsed, result, target);

    const findings = arrayValue(parsed.data).map(item => ({
      file: requireString(item.filename, 'ruff finding filename'),
      line: requireNumber(item.location?.row, 'ruff finding location.row'),
      column: requireNumber(item.location?.column, 'ruff finding location.column'),
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
    let shellFiles;

    if (ctx.changedFilesRequested) {
      shellFiles = ctx.changedFiles
        .filter(f => f.endsWith('.sh'))
        .map(f => path.join(ctx.repoRoot, f));
    } else {
      shellFiles = listConfiguredTargetFiles(ctx, file => file.endsWith('.sh'));
    }

    if (shellFiles.length === 0) return { errors: 0, warnings: 0, findings: [] };

    const result = requireToolExecution(safeExec('shellcheck', ['--format', 'json', ...ctx.tool.arguments, ...shellFiles], { cwd: ctx.repoRoot, timeout: ctx.tool.timeout_ms }), 'shellcheck');
    const parsed = tryParseJson(result.stdout);
    if (!parsed.ok) return failParse(ctx, 'shellcheck', parsed, result, ctx.repoRoot);

    const comments = Array.isArray(parsed.data) ? parsed.data : arrayValue(parsed.data?.comments);
    const findings = comments.map(item => ({
      file: item.file,
      line: item.line,
      column: item.column,
      severity: item.level === 'error' ? 'error' : 'warning',
      code: `SC${item.code}`,
      message: item.message,
    }));
    if (result.exitCode !== 0 && findings.length === 0) return failParse(ctx, 'shellcheck', { error: 'non-zero exit without diagnostics' }, result, ctx.repoRoot);

    return {
      errors: findings.filter(f => f.severity === 'error').length,
      warnings: findings.filter(f => f.severity === 'warning').length,
      findings,
    };
  },
});

// ── shfmt (canonical shell formatting) ──
registerTool({
  id: 'shfmt',
  name: 'shfmt',
  binary: 'shfmt',
  tier: 'pre-check',
  detect: (ctx) => ctx.projectTypes.has('shell'),
  run: (ctx) => {
    const shellFiles = ctx.changedFilesRequested
      ? ctx.changedFiles.filter(file => file.endsWith('.sh')).map(file => path.join(ctx.repoRoot, file))
      : listConfiguredTargetFiles(ctx, file => file.endsWith('.sh'));
    if (shellFiles.length === 0) return { errors: 0, warnings: 0, findings: [] };
    const findings = [];
    for (const file of shellFiles) {
      const result = requireToolExecution(safeExec('shfmt', ['-d', ...ctx.tool.arguments, file], { cwd: ctx.repoRoot, timeout: ctx.tool.timeout_ms }), 'shfmt');
      if (result.exitCode === 1 && result.stdout.trim()) {
        findings.push({ file, line: null, column: null, severity: 'error', code: 'shell-format', message: `Shell file is not in canonical shfmt format. Run shfmt -w ${ctx.tool.arguments.join(' ')} on this file.` });
      } else if (result.exitCode !== 0) {
        return failParse(ctx, 'shfmt', { error: 'unexpected exit without a format diff' }, result, file);
      }
    }
    return { errors: findings.length, warnings: 0, findings };
  },
});

// ── eslint (JS/TS linting) ──
registerTool({
  id: 'eslint',
  name: 'ESLint',
  binary: 'eslint',
  tier: 'full',
  detect: isJavaScriptOrTypeScriptProject,
  run: (ctx) => {
    const target = ctx.modulePath ? path.join(ctx.repoRoot, ctx.modulePath) : ctx.repoRoot;
    const args = ['--format', 'json', '--no-error-on-unmatched-pattern'];

    // The caller owns one exact ESLint config path. Missing config is an execution failure.
    const config = ctx.tool.config_path;
    if (!config || !fs.existsSync(config)) {
      failConfigMissing('eslint-config-missing', `Configured ESLint config does not exist: ${config || '<missing --eslint-config>'}`);
    }
    log('INFO', `ESLint using config: ${config}`);
    args.push('--config', config);

    if (ctx.changedFilesRequested) {
      const jsFiles = ctx.changedFiles.filter(f => /\.(js|ts|jsx|tsx|mjs|cjs)$/.test(f));
      if (jsFiles.length === 0) return { errors: 0, warnings: 0, findings: [] };
      args.push(...jsFiles.map(f => path.join(ctx.repoRoot, f)));
    } else {
      args.push(...configuredTargetPaths(ctx));
    }

    const result = requireToolExecution(safeExec('eslint', args, { cwd: ctx.repoRoot, timeout: ctx.tool.timeout_ms }), 'eslint');
    const parsed = tryParseJson(result.stdout);
    if (!parsed.ok) return failParse(ctx, 'eslint', parsed, result, target);

    const findings = [];
    for (const fileResult of arrayValue(parsed.data)) {
      const occurrences = new Map();
      for (const msg of arrayValue(fileResult.messages)) {
        findings.push({
          file: fileResult.filePath,
          line: msg.line,
          column: msg.column,
          severity: msg.severity === 2 ? 'error' : 'warning',
          code: selectTruthyValue(() => (msg.ruleId), () => ('eslint')),
          message: msg.message,
          fingerprint_seed: eslintFindingSeed(ctx, fileResult, msg, occurrences),
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

// ── npm audit (Dependency security) ──
registerTool({
  id: 'npm-audit',
  name: 'npm audit',
  binary: 'npm',
  tier: 'full',
  detect: isJavaScriptOrTypeScriptProject,
  run: (ctx) => {
    const packageRoot = path.dirname(configuredTargetPaths(ctx)[0]);
    const result = requireToolExecution(safeExec('npm', ['audit', '--json', '--omit=dev'], {
      cwd: packageRoot,
      timeout: ctx.tool.timeout_ms,
    }), 'npm-audit');

    const parsed = tryParseJson(result.stdout);
    if (!parsed.ok) return failParse(ctx, 'npm-audit', parsed, result, path.join(ctx.repoRoot, 'package.json'));
    if (parsed.data?.error) {
      const auditError = recordValue(parsed.data.error);
      const message = selectPresentValue(auditError.summary, auditError.message, typeof parsed.data.error === 'string' ? parsed.data.error : '', 'npm audit returned an operational error');
      throw Object.assign(new Error(message), { code: 'npm-audit-execution-failed' });
    }

    const findings = [];
    const vulns = recordValue(parsed.data?.vulnerabilities);
    for (const [name, vuln] of Object.entries(vulns)) {
      findings.push({
        file: path.join(packageRoot, 'package.json'),
        line: null,
        column: null,
        severity: npmAuditSeverity(vuln.severity),
        code: `npm:${vuln.severity}`,
        message: `${name}: ${selectPresentValue(vuln.title, vuln.via?.[0]?.title, LINT_VULNERABILITY_FOUND)} (${vuln.severity})`,
      });
    }
    if (result.exitCode !== 0 && findings.length === 0) return failParse(ctx, 'npm-audit', { error: 'non-zero exit without vulnerability findings' }, result, path.join(packageRoot, 'package.json'));

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

    if (ctx.changedFilesRequested) {
      const pyFiles = ctx.changedFiles.filter(f => f.endsWith('.py'));
      if (pyFiles.length === 0) return { errors: 0, warnings: 0, findings: [] };
      args.length = 0;
      args.push('--output', 'json', '--no-color-output', ...pyFiles.map(f => path.join(ctx.repoRoot, f)));
    }

    const result = requireToolExecution(safeExec('mypy', args, { cwd: ctx.repoRoot, timeout: ctx.tool.timeout_ms }), 'mypy');

    // mypy JSON output: one JSON object per line
    const findings = [];
    let parseFailure = null;
    const lines = textValue(result.stdout).split('\n').filter(Boolean);
    for (const line of lines) {
      const parsed = tryParseJson(line);
      if (!parsed.ok) {
        if (!parseFailure) parseFailure = { parsed, line };
        continue;
      }
      const item = parsed.data;
      findings.push({
        file: item.file,
        line: item.line,
        column: item.column,
        severity: item.severity === 'error' ? 'error' : 'warning',
        code: selectTruthyValue(() => (item.code), () => ('mypy')),
        message: item.message,
      });
    }

    if (parseFailure) {
      return failParse(ctx, 'mypy', parseFailure.parsed, result, target);
    }
    if (findings.length === 0 && result.exitCode !== 0) {
      return failParse(ctx, 'mypy', { error: 'non-zero exit without JSON findings' }, result, target);
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
    const result = requireToolExecution(safeExec('pip-audit', ['--format', 'json'], {
      cwd: ctx.repoRoot,
      timeout: ctx.tool.timeout_ms,
    }), 'pip-audit');

    const parsed = tryParseJson(result.stdout);
    if (!parsed.ok) return failParse(ctx, 'pip-audit', parsed, result, path.join(ctx.repoRoot, 'requirements.txt'));

    const dependencyEntries = Array.isArray(parsed.data?.dependencies)
      ? parsed.data.dependencies
      : (Array.isArray(parsed.data) ? parsed.data : []);
    const findings = dependencyEntries
      .filter(dep => dep.vulns?.length > 0)
      .flatMap(dep => dep.vulns.map(vuln => ({
        file: 'requirements.txt',
        line: null,
        column: null,
        severity: 'error',
        code: selectTruthyValue(() => (vuln.id), () => ('pip-audit')),
        message: `${dep.name} ${dep.version}: ${requireString(vuln.description, 'pip-audit vulnerability description')}`,
      })));

    return {
      errors: findings.length,
      warnings: 0,
      findings,
    };
  },
});

function semgrepArgs(ctx, config) {
  const exclusions = (ctx.tool.exclude ?? []).flatMap(pattern => ['--exclude', pattern]);
  const targets = ctx.changedFilesRequested
    ? ctx.changedFiles.map(file => path.join(ctx.repoRoot, file))
    : configuredTargetPaths(ctx);
  return ['scan', '--json', '--disable-version-check', '--metrics=off', '--config', config, '--quiet', ...exclusions, ...targets];
}

function parseSemgrepResult(ctx, result, target) {
  const parsed = tryParseJson(result.stdout);
  if (!parsed.ok) return failParse(ctx, 'semgrep', parsed, result, target);
  const semgrepErrors = arrayValue(parsed.data?.errors);
  if (semgrepErrors.length > 0) {
    const message = selectPresentValue(semgrepErrors[0]?.message, semgrepErrors[0]?.type, 'Semgrep reported an execution error');
    throw Object.assign(new Error(message), { code: 'semgrep-execution-failed' });
  }
  if (result.exitCode !== 0) return failParse(ctx, 'semgrep', { error: 'non-zero execution status' }, result, target);
  const findings = arrayValue(parsed.data?.results).map(item => ({
    file: item.path,
    line: item.start?.line,
    column: item.start?.col,
    severity: item.extra?.severity === 'ERROR' ? 'error' : 'warning',
    code: selectTruthyValue(() => (item.check_id), () => ('semgrep')),
    message: requireString(item.extra?.message, 'semgrep finding message'),
  }));
  return {
    errors: findings.filter(f => f.severity === 'error').length,
    warnings: findings.filter(f => f.severity === 'warning').length,
    findings,
  };
}

// ── semgrep (Pattern-based static analysis) ──
registerTool({
  id: 'semgrep',
  name: 'Semgrep',
  binary: 'semgrep',
  tier: 'full',
  detect: () => true, // Multi-language — always applicable
  run: (ctx) => {
    const target = ctx.modulePath ? path.join(ctx.repoRoot, ctx.modulePath) : ctx.repoRoot;
    // The caller owns one exact Semgrep config path. Missing config is an execution failure.
    const config = ctx.tool.config_path;
    if (!config || !fs.existsSync(config)) {
      failConfigMissing('semgrep-config-missing', `Configured Semgrep config does not exist: ${config || '<missing --semgrep-config>'}`);
    }
    log('INFO', `Semgrep using config: ${config}`);

    const result = requireToolExecution(safeExec('semgrep', semgrepArgs(ctx, config), {
      cwd: ctx.repoRoot,
      timeout: ctx.tool.timeout_ms,
      env: { SEMGREP_LOG_FILE: path.join(os.tmpdir(), `kubeclaw-semgrep-${process.pid}.log`) },
    }), 'semgrep');
    return parseSemgrepResult(ctx, result, target);
  },
});

registerContainerYamlTools(registerTool);
registerKubernetesSecurityTools(registerTool);
registerArchitectureTools(registerTool);
registerGoTools(registerTool);
registerTerraformTools(registerTool);

export { buildToolRegistry, TOOL_ADAPTERS, TOOL_ADAPTERS as TOOL_REGISTRY };
