import fs from 'fs';
import os from 'os';
import path from 'path';
import { requireToolExecution, safeExec } from './execution.ts';
import { configuredTargetPaths } from './discovery.ts';
import { tryParseJson } from './parsers.ts';
import { failConfigMissing, failParse } from './report.ts';
import { log } from './output.ts';
import { arrayValue, selectPresentValue } from '../support/value-boundary.ts';
import { selectTruthyValue } from '../support/optional-absence.ts';
import { registerTool, requireString } from './tool-registry-core.ts';

function semgrepArgs(ctx: any, config: any) {
  const exclusions = (ctx.tool.exclude ?? []).flatMap(
    (pattern: any) => ['--exclude', pattern]
  );
  const targets = ctx.changedFilesRequested
    ? ctx.changedFiles.map((file: any) => path.join(ctx.repoRoot, file))
    : configuredTargetPaths(ctx);
  return [
    'scan',
    '--json',
    '--disable-version-check',
    '--metrics=off',
    '--config',
    config,
    '--quiet',
    ...exclusions,
    ...targets,
  ];
}

function parseSemgrepResult(ctx: any, result: any, target: any) {
  const parsed = tryParseJson(result.stdout);
  if (!parsed.ok) {
    return failParse(ctx, 'semgrep', parsed, result, target);
  }
  const executionErrors = arrayValue(parsed.data?.errors);
  if (executionErrors.length > 0) {
    const message = selectPresentValue(
      executionErrors[0]?.message,
      executionErrors[0]?.type,
      'Semgrep reported an execution error'
    );
    throw Object.assign(new Error(message), {
      code: 'semgrep-execution-failed',
    });
  }
  if (result.exitCode !== 0) {
    return failParse(
      ctx,
      'semgrep',
      { error: 'non-zero execution status' },
      result,
      target
    );
  }
  const findings = arrayValue(parsed.data?.results).map((item: any) => ({
    file: item.path,
    line: item.start?.line,
    column: item.start?.col,
    severity: item.extra?.severity === 'ERROR' ? 'error' : 'warning',
    code: selectTruthyValue(() => item.check_id, () => 'semgrep'),
    message: requireString(
      item.extra?.message,
      'semgrep finding message'
    ),
  }));
  return {
    errors: findings.filter((finding: any) => finding.severity === 'error').length,
    warnings: findings.filter(
      (finding: any) => finding.severity === 'warning'
    ).length,
    findings,
  };
}

registerTool({
  id: 'semgrep',
  name: 'Semgrep',
  binary: 'semgrep',
  tier: 'full',
  detect: () => true,
  run: (ctx: any) => {
    const target = ctx.modulePath
      ? path.join(ctx.repoRoot, ctx.modulePath)
      : ctx.repoRoot;
    const config = ctx.tool.config_path;
    if (!config || !fs.existsSync(config)) {
      failConfigMissing(
        'semgrep-config-missing',
        `Configured Semgrep config does not exist: ${config || '<missing --semgrep-config>'}`
      );
    }
    log('INFO', `Semgrep using config: ${config}`);
    const result = requireToolExecution(safeExec(
      'semgrep',
      semgrepArgs(ctx, config),
      {
        cwd: ctx.repoRoot,
        timeout: ctx.tool.timeout_ms,
        env: {
          SEMGREP_LOG_FILE: path.join(
            os.tmpdir(),
            `kubeclaw-semgrep-${process.pid}.log`
          ),
        },
      }
    ), 'semgrep');
    return parseSemgrepResult(ctx, result, target);
  },
});
