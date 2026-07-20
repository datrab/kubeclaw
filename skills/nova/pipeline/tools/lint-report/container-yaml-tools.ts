import fs from 'fs';
import path from 'path';

import { requireToolExecution, safeExec } from './execution.ts';
import { configuredTargetPaths, listConfiguredTargetFiles } from './discovery.ts';
import { renderChart } from './helm-render.ts';
import { tryParseJson } from './parsers.ts';
import { failParse } from './report.ts';

import { selectDefinedValue, selectTruthyValue } from '../../optional-absence.ts';
function jsonResourceItems(data) {
  if (Array.isArray(data)) return data;
  return [];
}

function commandOutput(result) {
  return selectDefinedValue(() => ([result.stdout, result.stderr].find((value) => typeof value === 'string' && value.length > 0)), () => (''));
}

function scopedChangedFiles(ctx, predicate) {
  if (!ctx.changedFilesRequested) return null;
  return ctx.changedFiles
    .filter(file => predicate(file.split(path.sep).join('/')))
    .map(file => path.join(ctx.repoRoot, file));
}

export function registerContainerYamlTools(registerTool) {
  // ── hadolint (Dockerfile linting) ──
  registerTool({
    id: 'hadolint',
    name: 'Hadolint (Dockerfile)',
    binary: 'hadolint',
    tier: 'full',
    detect: (ctx) => ctx.projectTypes.has('docker'),
    run: (ctx) => {
      const dockerfiles = selectTruthyValue(() => (scopedChangedFiles(ctx, file => /^Dockerfile|\.dockerfile$/i.test(path.basename(file)))), () => (listConfiguredTargetFiles(ctx, file => /^Dockerfile|\.dockerfile$/i.test(path.basename(file)))));
      if (dockerfiles.length === 0) return { errors: 0, warnings: 0, findings: [] };

      const allFindings = [];
      for (const dockerfile of dockerfiles) {
        const findingsBefore = allFindings.length;
        const sourceLines = fs.readFileSync(dockerfile, 'utf8').split('\n');
        const occurrences = new Map();
        const result = requireToolExecution(safeExec('hadolint', ['--format', 'json', dockerfile], { cwd: ctx.repoRoot, timeout: ctx.tool.timeout_ms }), 'hadolint');
        const parsed = tryParseJson(result.stdout);
        if (!parsed.ok) {
          return failParse(ctx, 'hadolint', parsed, result, dockerfile);
        }

        for (const item of jsonResourceItems(parsed.data)) {
          const sourceLine = sourceLines[Math.max(0, Number(item.line || 1) - 1)]?.trim() || '';
          const identity = JSON.stringify({ code: item.code, file: path.relative(ctx.repoRoot, dockerfile).split(path.sep).join('/'), message: item.message, source_line: sourceLine });
          const occurrence = (occurrences.get(identity) || 0) + 1;
          occurrences.set(identity, occurrence);
          allFindings.push({
            file: dockerfile,
            line: item.line,
            column: item.column,
            severity: item.level === 'error' ? 'error' : 'warning',
            code: item.code,
            message: item.message,
            fingerprint_seed: { code: item.code, file: path.relative(ctx.repoRoot, dockerfile).split(path.sep).join('/'), message: item.message, source_line: sourceLine, occurrence },
          });
        }
        if (result.exitCode !== 0 && allFindings.length === findingsBefore) return failParse(ctx, 'hadolint', { error: 'non-zero exit without diagnostics' }, result, dockerfile);
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
      const chartDirs = configuredTargetPaths(ctx);

      const allFindings = [];
      for (const chartDir of chartDirs) {
        const findingCountBeforeChart = allFindings.length;
        const result = requireToolExecution(safeExec('helm', ['lint', '--strict', chartDir], { cwd: ctx.repoRoot, timeout: ctx.tool.timeout_ms }), 'helm-lint');
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
        if (result.exitCode !== 0 && allFindings.length === findingCountBeforeChart) {
          return failParse(ctx, 'helm-lint', { error: 'non-zero exit without parsed findings' }, result, chartDir);
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
      const findings = [];

      const pushResourceFinding = (item) => {
        if (selectTruthyValue(() => (item?.status === 'statusInvalid'), () => (item?.status === 'statusError'))) {
          findings.push({
            file: item.filename,
            line: null,
            column: null,
            severity: 'error',
            code: 'kubeconform',
            message: selectDefinedValue(() => (item.msg), () => (`Invalid K8s manifest: ${item.filename}`)),
          });
        }
      };

      for (const chartDir of configuredTargetPaths(ctx)) {
        const findingsBefore = findings.length;
        const result = requireToolExecution(safeExec('kubeconform', ['-output', 'json', '-summary', '-strict', '-'], {
          cwd: ctx.repoRoot,
          timeout: ctx.tool.timeout_ms,
          input: renderChart(ctx, chartDir),
        }), 'kubeconform');
        const parsed = tryParseJson(result.stdout);
        if (!parsed.ok) return failParse(ctx, 'kubeconform', parsed, result, chartDir);
        const resources = Array.isArray(parsed.data?.resources) ? parsed.data.resources : [];
        for (const item of resources) pushResourceFinding(item);
        if (findings.length === findingsBefore && result.exitCode !== 0) {
          return failParse(ctx, 'kubeconform', { error: 'non-zero exit without parsed findings' }, result, chartDir);
        }
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
      const config = ctx.tool.config_path;
      const yamlFiles = ctx.changedFilesRequested
        ? ctx.changedFiles.map(file => path.join(ctx.repoRoot, file))
        : listConfiguredTargetFiles(ctx, file => file.endsWith('.yaml') || file.endsWith('.yml'));
      if (yamlFiles.length === 0) return { errors: 0, warnings: 0, findings: [] };
      const args = ['-c', config, '-f', 'parsable', '--strict', ...yamlFiles];

      const result = requireToolExecution(safeExec('yamllint', args, { cwd: ctx.repoRoot, timeout: ctx.tool.timeout_ms }), 'yamllint');

      // parsable format: file:line:col: [level] message (rule)
      const findings = [];
      const lines = commandOutput(result).split('\n').filter(Boolean);
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
      if (findings.length === 0 && result.exitCode !== 0) {
        return failParse(ctx, 'yamllint', { error: 'non-zero exit without parsed findings' }, result, ctx.repoRoot);
      }

      return {
        errors: findings.filter(f => f.severity === 'error').length,
        warnings: findings.filter(f => f.severity === 'warning').length,
        findings,
      };
    },
  });
}
