import path from 'path';

import { requireToolExecution, safeExec } from './execution.ts';
import { configuredTargetPaths } from './discovery.ts';
import { tryParseJson } from './parsers.ts';
import { failParse } from './report.ts';
import {
  objectRecord as recordValue,
  selectPresentValue,
  textValue,
} from '../../value-boundary.ts';
import { selectTruthyValue } from '../../optional-absence.ts';
import {
  isJavaScriptOrTypeScriptProject,
  LINT_VULNERABILITY_FOUND,
  npmAuditSeverity,
  registerTool,
  requireString,
} from './tool-registry-core.ts';

// ── npm audit (Dependency security) ──
registerTool({
  id: 'npm-audit',
  name: 'npm audit',
  binary: 'npm',
  tier: 'full',
  detect: isJavaScriptOrTypeScriptProject,
  run: (ctx: any) => {
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

    const findings: any[] = [];
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
      errors: findings.filter((f: any) => f.severity === 'error').length,
      warnings: findings.filter((f: any) => f.severity === 'warning').length,
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
  detect: (ctx: any) => ctx.projectTypes.has('python'),
  run: (ctx: any) => {
    const target = ctx.modulePath ? path.join(ctx.repoRoot, ctx.modulePath) : ctx.repoRoot;
    const args = ['--output', 'json', '--no-color-output', target];

    if (ctx.changedFilesRequested) {
      const pyFiles = ctx.changedFiles.filter((f: any) => f.endsWith('.py'));
      if (pyFiles.length === 0) return { errors: 0, warnings: 0, findings: [] };
      args.length = 0;
      args.push('--output', 'json', '--no-color-output', ...pyFiles.map((f: any) => path.join(ctx.repoRoot, f)));
    }

    const result = requireToolExecution(safeExec('mypy', args, { cwd: ctx.repoRoot, timeout: ctx.tool.timeout_ms }), 'mypy');

    // mypy JSON output: one JSON object per line
    const findings: any[] = [];
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
      errors: findings.filter((f: any) => f.severity === 'error').length,
      warnings: findings.filter((f: any) => f.severity === 'warning').length,
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
  detect: (ctx: any) => ctx.projectTypes.has('python'),
  run: (ctx: any) => {
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
      .filter((dep: any) => dep.vulns?.length > 0)
      .flatMap((dep: any) => dep.vulns.map((vuln: any) => ({
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
