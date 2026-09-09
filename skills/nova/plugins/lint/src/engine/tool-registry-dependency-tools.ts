import path from 'path';

import { requireToolExecution, safeExec } from './execution.ts';
import { tryParseJson } from './parsers.ts';
import { failParse } from './report.ts';
import { textValue } from '../support/value-boundary.ts';
import { selectTruthyValue } from '../support/optional-absence.ts';
import { registerTool } from './tool-registry-core.ts';
// ── mypy (Python type checking) ──
registerTool({
  id: 'mypy',
  name: 'mypy (Python Types)',
  binary: 'mypy',
  tier: 'full',
  detect: (ctx: any) => ctx.projectTypes.has('python'),
  run: async (ctx: any) => {
    const target = ctx.modulePath ? path.join(ctx.repoRoot, ctx.modulePath) : ctx.repoRoot;
    const args = ['--output', 'json', '--no-color-output', target];

    if (ctx.changedFilesRequested) {
      const pyFiles = ctx.changedFiles.filter((f: any) => f.endsWith('.py'));
      if (pyFiles.length === 0) return { errors: 0, warnings: 0, findings: [] };
      args.length = 0;
      args.push('--output', 'json', '--no-color-output', ...pyFiles.map((f: any) => path.join(ctx.repoRoot, f)));
    }

    const result = requireToolExecution(await safeExec('mypy', args, { signal: ctx.signal, cwd: ctx.repoRoot, timeout: ctx.tool.timeout_ms }), 'mypy');

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
