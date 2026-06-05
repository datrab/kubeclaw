import fs from 'fs';
import path from 'path';

import { safeExec } from './execution.ts';
import { findFiles } from './discovery.ts';
import { tryParseJson } from './parsers.ts';
import { makeParseFailureResult, makeWarningResult } from './report.ts';

export function registerContainerYamlTools(registerTool) {
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

      const pushResourceFinding = (item) => {
        if (item?.status === 'statusInvalid' || item?.status === 'statusError') {
          findings.push({
            file: item.filename,
            line: null,
            column: null,
            severity: 'error',
            code: 'kubeconform',
            message: item.msg || `Invalid K8s manifest: ${item.filename}`,
          });
        }
      };

      const parsedOutput = tryParseJson(result.stdout || '');
      if (parsedOutput.ok) {
        const resources = Array.isArray(parsedOutput.data?.resources)
          ? parsedOutput.data.resources
          : Array.isArray(parsedOutput.data)
            ? parsedOutput.data
            : [parsedOutput.data];
        for (const item of resources) {
          pushResourceFinding(item);
        }
      } else {
        const lines = (result.stdout || '').split('\n').filter(Boolean);
        for (const line of lines) {
          const parsed = tryParseJson(line);
          if (!parsed.ok) {
            parseFailure ||= { parsed, line };
            continue;
          }
          pushResourceFinding(parsed.data);
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
}
