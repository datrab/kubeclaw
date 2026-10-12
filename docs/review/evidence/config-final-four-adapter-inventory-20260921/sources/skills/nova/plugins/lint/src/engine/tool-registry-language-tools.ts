import fs from 'fs';
import path from 'path';

import { requireToolExecution, safeExec } from './execution.ts';
import { configuredTargetFilesForScope, configuredTargetPaths } from './discovery.ts';
import { partitionEvidenceFiles } from './evidence-file-partition.ts';
import { tryParseJson } from './parsers.ts';
import { failConfigMissing, failParse, notApplicable } from './report.ts';
import { log } from './output.ts';
import { arrayValue, selectPresentValue, textValue } from '../support/value-boundary.ts';
import { selectTruthyValue } from '../support/optional-absence.ts';
import {
  affectedTypeScriptConfigs,
  eslintFindingSeed,
  isJavaScriptOrTypeScriptProject,
  registerTool,
  requireNumber,
  requireString,
  TOOL_OUTPUT_PREVIEW_MISSING,
  uniqueTypeScriptFindings,
} from './tool-registry-core.ts';

// ── tsc (TypeScript type checking) ──
registerTool({
  id: 'tsc',
  name: 'TypeScript Compiler',
  binary: 'tsc',
  tier: 'pre-check',
  detect: (ctx: any) => ctx.projectTypes.has('typescript'),
  run: async (ctx: any) => {
    const findings: any[] = [];
    const configs = affectedTypeScriptConfigs(ctx);
    if (configs.length === 0) return notApplicable('No configured TypeScript project is affected by the requested scope.');
    for (const config of configs) {
      const result = requireToolExecution(await safeExec('tsc', ['--noEmit', '--pretty', 'false', '--project', config], { signal: ctx.signal, cwd: ctx.repoRoot, timeout: ctx.tool.timeout_ms }), 'tsc');
      const lines = textValue(result.stdout).split('\n').filter(Boolean);
      const findingsBefore = findings.length;
      for (const line of lines) {
        const match = line.match(/^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.+)$/);
        if (match) {
          findings.push({ file: match[1]!, line: parseInt(match[2]!, 10), column: parseInt(match[3]!, 10), severity: match[4], code: match[5], message: match[6] });
        }
      }
      if (findings.length === findingsBefore && result.exitCode !== 0) {
        const output = selectPresentValue(result.stdout, result.stderr, result.error).trim();
        const preview = output ? (output.split('\n')[0] ?? '').slice(0, 200) : TOOL_OUTPUT_PREVIEW_MISSING;
        throw Object.assign(new Error(`tsc failed without file-scoped diagnostics for ${config}. exitCode=${result.exitCode}; preview=${preview}`), { code: 'tsc-output-invalid' });
      }
    }

    const uniqueFindings = uniqueTypeScriptFindings(ctx.repoRoot, findings);
    return {
      errors: uniqueFindings.filter((f: any) => f.severity === 'error').length,
      warnings: uniqueFindings.filter((f: any) => f.severity === 'warning').length,
      findings: uniqueFindings,
    };
  },
});
// ── ruff (Python linting) ──
registerTool({
  id: 'ruff',
  name: 'Ruff (Python Linter)',
  binary: 'ruff',
  tier: 'pre-check',
  detect: (ctx: any) => ctx.projectTypes.has('python'),
  run: async (ctx: any) => {
    const target = ctx.modulePath ? path.join(ctx.repoRoot, ctx.modulePath) : ctx.repoRoot;
    const args = ['check', '--output-format', 'json', target];
    if (ctx.changedFilesRequested) {
      const pyFiles = ctx.changedFiles.filter((f: any) => f.endsWith('.py'));
      if (pyFiles.length === 0) return { errors: 0, warnings: 0, findings: [] };
      args.length = 0;
      args.push('check', '--output-format', 'json', ...pyFiles.map((f: any) => path.join(ctx.repoRoot, f)));
    }

    const result = requireToolExecution(await safeExec('ruff', args, { signal: ctx.signal, cwd: ctx.repoRoot, timeout: ctx.tool.timeout_ms }), 'ruff');
    const parsed = tryParseJson(result.stdout);
    if (!parsed.ok) return failParse(ctx, 'ruff', parsed, result, target);

    const findings = arrayValue(parsed.data).map((item: any) => ({
      file: requireString(item.filename, 'ruff finding filename'),
      line: requireNumber(item.location?.row, 'ruff finding location.row'),
      column: requireNumber(item.location?.column, 'ruff finding location.column'),
      severity: item.fix ? 'warning' : 'error',
      code: item.code,
      message: item.message,
    }));

    return {
      errors: findings.filter((f: any) => f.severity === 'error').length,
      warnings: findings.filter((f: any) => f.severity === 'warning').length,
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
  detect: (ctx: any) => ctx.projectTypes.has('shell'),
  run: async (ctx: any) => {
    const shellFiles = configuredTargetFilesForScope(ctx, (file: any) => file.endsWith('.sh'));

    if (shellFiles.length === 0) return { errors: 0, warnings: 0, findings: [] };

    const result = requireToolExecution(await safeExec('shellcheck', ['--format', 'json', ...ctx.tool.arguments, ...shellFiles], { signal: ctx.signal, cwd: ctx.repoRoot, timeout: ctx.tool.timeout_ms }), 'shellcheck');
    const parsed = tryParseJson(result.stdout);
    if (!parsed.ok) return failParse(ctx, 'shellcheck', parsed, result, ctx.repoRoot);

    const comments = Array.isArray(parsed.data) ? parsed.data : arrayValue(parsed.data?.comments);
    const findings = comments.map((item: any) => ({
      file: item.file,
      line: item.line,
      column: item.column,
      severity: item.level === 'error' ? 'error' : 'warning',
      code: `SC${item.code}`,
      message: item.message,
    }));
    if (result.exitCode !== 0 && findings.length === 0) return failParse(ctx, 'shellcheck', { error: 'non-zero exit without diagnostics' }, result, ctx.repoRoot);

    return {
      errors: findings.filter((f: any) => f.severity === 'error').length,
      warnings: findings.filter((f: any) => f.severity === 'warning').length,
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
  detect: (ctx: any) => ctx.projectTypes.has('shell'),
  run: async (ctx: any) => {
    const shellFiles = configuredTargetFilesForScope(ctx, (file: any) => file.endsWith('.sh'));
    if (shellFiles.length === 0) return { errors: 0, warnings: 0, findings: [] };
    const findings: any[] = [];
    for (const file of shellFiles) {
      const result = requireToolExecution(await safeExec('shfmt', ['-d', ...ctx.tool.arguments, file], { signal: ctx.signal, cwd: ctx.repoRoot, timeout: ctx.tool.timeout_ms }), 'shfmt');
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
const EMPTY_ESLINT_RESULT = Object.freeze({ errors: 0, warnings: 0, findings: [] });
const EVIDENCE_PARTITION_BY_TOOL = Object.freeze({
  'eslint-type-evidence-production': 'production',
  'eslint-type-evidence-tests': 'tests',
  'eslint-type-evidence-generated': 'generatedOrUntracked',
} as const);

async function evidenceFiles(ctx: any): Promise<readonly string[]> {
  const candidates = configuredTargetFilesForScope(
    ctx,
    (file: string) => /\.(js|ts|jsx|tsx|mjs|cjs|mts|cts)$/u.test(file),
    ['.git/**', '.swarm/**', '**/node_modules/**'],
  );
  const key = EVIDENCE_PARTITION_BY_TOOL[ctx.tool.id as keyof typeof EVIDENCE_PARTITION_BY_TOOL];
  return key ? (await partitionEvidenceFiles(ctx.repoRoot, candidates, ctx.signal))[key] : [];
}

async function eslintTargetFiles(ctx: any): Promise<readonly string[]> {
  if (ctx.tool.id.startsWith('eslint-type-evidence-')) return evidenceFiles(ctx);
  if (!ctx.changedFilesRequested) return configuredTargetPaths(ctx);
  return ctx.changedFiles
    .filter((file: string) => /\.(js|ts|jsx|tsx|mjs|cjs|mts|cts)$/u.test(file))
    .map((file: string) => path.join(ctx.repoRoot, file));
}

function normalizeEslintFindings(ctx: any, reports: readonly any[]): any[] {
  const findings: any[] = [];
  for (const report of reports) {
    const occurrences = new Map();
    for (const message of arrayValue(report.messages)) {
      findings.push({
        file: report.filePath,
        line: message.line,
        column: message.column,
        severity: message.severity === 2 ? 'error' : 'warning',
        code: selectTruthyValue(() => (message.ruleId), () => ('eslint')),
        message: message.message,
        fingerprint_seed: eslintFindingSeed(ctx, report, message, occurrences),
      });
    }
  }
  return findings;
}

async function runEslint(ctx: any): Promise<Record<string, any>> {
  const target = ctx.modulePath ? path.join(ctx.repoRoot, ctx.modulePath) : ctx.repoRoot;
  const args = ['--format', 'json', '--no-error-on-unmatched-pattern', '--no-warn-ignored'];

  // The caller owns one exact ESLint config path. Missing config is an execution failure.
  const config = ctx.tool.config_path;
  if (!config || !fs.existsSync(config)) {
    failConfigMissing('eslint-config-missing', `Configured ESLint config does not exist: ${config || '<missing --eslint-config>'}`);
  }
  log('INFO', `ESLint using config: ${config}`);
  args.push('--config', config);

  const files = await eslintTargetFiles(ctx);
  if (files.length === 0) return EMPTY_ESLINT_RESULT;
  args.push(...files);

  const result = requireToolExecution(await safeExec('eslint', args, { signal: ctx.signal, cwd: ctx.repoRoot, timeout: ctx.tool.timeout_ms }), ctx.tool.id);
  const parsed = tryParseJson(result.stdout);
  if (!parsed.ok) return failParse(ctx, ctx.tool.id, parsed, result, target);
  const reports = arrayValue(parsed.data);
  log('INFO', `${ctx.tool.name}: ${reports.length} files scanned`);
  const findings = normalizeEslintFindings(ctx, reports);

  return {
    errors: findings.filter((f: any) => f.severity === 'error').length,
    warnings: findings.filter((f: any) => f.severity === 'warning').length,
    findings,
  };
}

registerTool({
  id: 'eslint',
  name: 'ESLint',
  binary: 'eslint',
  tier: 'full',
  detect: isJavaScriptOrTypeScriptProject,
  run: runEslint,
});

registerTool({
  id: 'eslint-type-evidence-production',
  name: 'ESLint Type Evidence Audit (Production)',
  binary: 'eslint',
  tier: 'full',
  detect: isJavaScriptOrTypeScriptProject,
  run: runEslint,
});

registerTool({
  id: 'eslint-type-evidence-tests',
  name: 'ESLint Type Evidence Audit (Tests)',
  binary: 'eslint',
  tier: 'full',
  detect: isJavaScriptOrTypeScriptProject,
  run: runEslint,
});

registerTool({
  id: 'eslint-type-evidence-generated',
  name: 'ESLint Type Evidence Audit (Generated/Untracked)',
  binary: 'eslint',
  tier: 'full',
  detect: isJavaScriptOrTypeScriptProject,
  run: runEslint,
});
