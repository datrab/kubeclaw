import { kubeconformTool } from './kubeconform-tool.ts';
import fs from 'fs';
import path from 'path';

import { requireToolExecution, safeExec } from './execution.ts';
import { configuredMarkerDirectories, configuredTargetFilesForScope } from './discovery.ts';
import { tryParseJson } from './parsers.ts';
import { failParse } from './report.ts';

import { selectDefinedValue, selectTruthyValue } from '../support/optional-absence.ts';
import { openapiContractTool } from './openapi-tool.ts';
function jsonResourceItems(data: any) {
  if (Array.isArray(data)) return data;
  return [];
}

function commandOutput(result: any) {
  return selectDefinedValue(() => ([result.stdout, result.stderr].find((value: any) => typeof value === 'string' && value.length > 0)), () => (''));
}

function hadolintTool() {
  return {
    id: 'hadolint',
    name: 'Hadolint (Dockerfile)',
    binary: 'hadolint',
    tier: 'full',
    detect: (ctx: any) => ctx.projectTypes.has('docker'),
    run: async (ctx: any) => {
      const dockerfiles = configuredTargetFilesForScope(ctx, (file: any) => /^Dockerfile|\.dockerfile$/i.test(path.basename(file)));
      if (dockerfiles.length === 0) return { errors: 0, warnings: 0, findings: [] };

      const allFindings: any[] = [];
      for (const dockerfile of dockerfiles) {
        const findingsBefore = allFindings.length;
        const sourceLines = fs.readFileSync(dockerfile, 'utf8').split('\n');
        const occurrences = new Map();
        const result = requireToolExecution(await safeExec('hadolint', ['--format', 'json', dockerfile], { signal: ctx.signal, cwd: ctx.repoRoot, timeout: ctx.tool.timeout_ms }), 'hadolint');
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
        errors: allFindings.filter((f: any) => f.severity === 'error').length,
        warnings: allFindings.filter((f: any) => f.severity === 'warning').length,
        findings: allFindings,
      };
    },
  };
}

function helmLintTool() {
  return {
    id: 'helm-lint',
    name: 'Helm Lint',
    binary: 'helm',
    tier: 'full',
    detect: (ctx: any) => ctx.projectTypes.has('helm'),
    run: async (ctx: any) => {
      const chartDirs = configuredMarkerDirectories(ctx, 'Chart.yaml');

      const allFindings: any[] = [];
      for (const chartDir of chartDirs) {
        const findingCountBeforeChart = allFindings.length;
        const result = requireToolExecution(await safeExec('helm', ['lint', '--strict', chartDir], { signal: ctx.signal, cwd: ctx.repoRoot, timeout: ctx.tool.timeout_ms }), 'helm-lint');
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
        errors: allFindings.filter((f: any) => f.severity === 'error').length,
        warnings: allFindings.filter((f: any) => f.severity === 'warning').length,
        findings: allFindings,
      };
    },
  };
}


function yamllintTool() {
  return {
    id: 'yamllint',
    name: 'yamllint',
    binary: 'yamllint',
    tier: 'full',
    detect: (ctx: any) => ctx.projectTypes.has('yaml'),
    run: async (ctx: any) => {
      const config = ctx.tool.config_path;
      const yamlFiles = configuredTargetFilesForScope(ctx, (file: any) => file.endsWith('.yaml') || file.endsWith('.yml'));
      if (yamlFiles.length === 0) return { errors: 0, warnings: 0, findings: [] };
      const args = ['-c', config, '-f', 'parsable', '--strict', ...yamlFiles];

      const result = requireToolExecution(await safeExec('yamllint', args, { signal: ctx.signal, cwd: ctx.repoRoot, timeout: ctx.tool.timeout_ms }), 'yamllint');

      // parsable format: file:line:col: [level] message (rule)
      const findings: any[] = [];
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
        errors: findings.filter((f: any) => f.severity === 'error').length,
        warnings: findings.filter((f: any) => f.severity === 'warning').length,
        findings,
      };
    },
  };
}

export function registerContainerYamlTools(registerTool: any) {
  registerTool(hadolintTool());
  registerTool(helmLintTool());
  registerTool(kubeconformTool());
  registerTool(kubeconformTool('kubernetes-schema', true));
  registerTool(yamllintTool());
  registerTool(openapiContractTool());
}
