import fs from 'fs';
import path from 'path';

import { requireToolExecution, safeExec } from './execution.ts';
import { configuredMarkerDirectories, configuredTargetFilesForScope } from './discovery.ts';
import { renderChart } from './helm-render.ts';
import { loadKubernetesResources } from './kubernetes-manifests.ts';
import { tryParseJson } from './parsers.ts';
import { failParse } from './report.ts';

import { selectDefinedValue, selectTruthyValue } from '../support/optional-absence.ts';
import crypto from 'node:crypto';
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
    run: (ctx: any) => {
      const dockerfiles = configuredTargetFilesForScope(ctx, (file: any) => /^Dockerfile|\.dockerfile$/i.test(path.basename(file)));
      if (dockerfiles.length === 0) return { errors: 0, warnings: 0, findings: [] };

      const allFindings: any[] = [];
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
    run: (ctx: any) => {
      const chartDirs = configuredMarkerDirectories(ctx, 'Chart.yaml');

      const allFindings: any[] = [];
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
        errors: allFindings.filter((f: any) => f.severity === 'error').length,
        warnings: allFindings.filter((f: any) => f.severity === 'warning').length,
        findings: allFindings,
      };
    },
  };
}

function kubeconformTool(id = 'kubeconform', includeRaw = false) {
  return {
    id,
    name: includeRaw ? 'Kubernetes schema validation' : 'Kubeconform',
    binary: 'kubeconform',
    tier: 'full',
    detect: (ctx: any) => {
      const kubernetes = ctx.policyProject?.kubernetes;
      const explicitInputCount = (Array.isArray(kubernetes?.raw_manifests) ? kubernetes.raw_manifests.length : 0)
        + (Array.isArray(kubernetes?.helm_charts) ? kubernetes.helm_charts.length : 0);
      return includeRaw ? explicitInputCount > 0 : ctx.projectTypes.has('helm') && explicitInputCount === 0;
    },
    run: (ctx: any) => {
      const findings: any[] = [];
      const evidence: any[] = [];
      const settings = ctx.policyProject.kubernetes;
      const projectRoot = path.resolve(ctx.repoRoot, ctx.policyProject.root);
      // The migrated Kubernetes lint path owns its pinned local schema source.
      // The retained generic Helm adapter stays compatible for non-migrated use.
      const baseArgs = includeRaw
        ? ['-output', 'json', '-summary', '-strict', '-kubernetes-version', settings.kubernetes_version, '-schema-location', settings.schema_location]
        : ['-output', 'json', '-summary', '-strict'];
      if (includeRaw) evidence.push(...loadKubernetesResources(ctx).sources);

      const pushResourceFinding = (item: any) => {
        if (selectTruthyValue(() => (item?.status === 'statusInvalid'), () => (item?.status === 'statusError'))) {
          const reportedFile = typeof item.filename === 'string' ? item.filename : '';
          const relativeFile = path.isAbsolute(reportedFile) ? path.relative(ctx.repoRoot, reportedFile) : reportedFile;
          const findingFile = relativeFile && !relativeFile.startsWith('..') && !path.isAbsolute(relativeFile)
            ? relativeFile.split(path.sep).join('/')
            : '<external>';
          findings.push({
            file: findingFile,
            line: null,
            column: null,
            severity: 'error',
            code: id,
            message: selectDefinedValue(() => (item.msg), () => (`Invalid K8s manifest: ${findingFile}`)),
          });
        }
      };

      const recordEvidence = (kind: string, source: string, content: string) => {
        const bytes = Buffer.byteLength(content);
        evidence.push({ kind, source, sha256: crypto.createHash('sha256').update(content).digest('hex'), bytes, ...(bytes <= 262_144 ? { content } : {}) });
      };

      if (includeRaw && settings.raw_manifests.length > 0) {
        const rawFiles = settings.raw_manifests.map((relative: string) => path.resolve(projectRoot, relative));
        const rawArguments = rawFiles.map((absolute: string) => path.relative(ctx.repoRoot, absolute).split(path.sep).join('/'));
        const result = requireToolExecution(safeExec('kubeconform', [...baseArgs, ...rawArguments], { cwd: ctx.repoRoot, timeout: ctx.tool.timeout_ms }), 'kubeconform');
        const parsed = tryParseJson(result.stdout);
        if (!parsed.ok) return failParse(ctx, 'kubeconform', parsed, result, rawFiles[0]);
        recordEvidence('kubeconform-output', 'raw-manifests', result.stdout);
        const resources = Array.isArray(parsed.data?.resources) ? parsed.data.resources : [];
        for (const item of resources) pushResourceFinding(item);
        if (resources.length === 0 && result.exitCode !== 0) return failParse(ctx, 'kubeconform', { error: 'non-zero exit without parsed resources' }, result, rawFiles[0]);
      }

      const chartDirs = includeRaw
        ? settings.helm_charts.map((relative: string) => ({ chartDir: path.resolve(projectRoot, relative), source: relative }))
        : configuredMarkerDirectories(ctx, 'Chart.yaml').map((chartDir: string) => ({ chartDir, source: path.relative(ctx.repoRoot, chartDir).split(path.sep).join('/') }));
      for (const { chartDir, source } of chartDirs) {
        const findingsBefore = findings.length;
        const rendered = renderChart(ctx, chartDir);
        if (includeRaw && Buffer.byteLength(rendered) > settings.limits.max_rendered_bytes) throw Object.assign(new Error(`${source} exceeds max_rendered_bytes`), { code: 'kubeconform-render-size-limit' });
        const result = requireToolExecution(safeExec('kubeconform', [...baseArgs, '-'], {
          cwd: ctx.repoRoot,
          timeout: ctx.tool.timeout_ms,
          input: rendered,
        }), 'kubeconform');
        const parsed = tryParseJson(result.stdout);
        if (!parsed.ok) return failParse(ctx, 'kubeconform', parsed, result, chartDir);
        if (includeRaw) recordEvidence('kubeconform-output', source, result.stdout);
        const resources = Array.isArray(parsed.data?.resources) ? parsed.data.resources : [];
        for (const item of resources) pushResourceFinding(item);
        if (findings.length === findingsBefore && result.exitCode !== 0) {
          return failParse(ctx, 'kubeconform', { error: 'non-zero exit without parsed findings' }, result, chartDir);
        }
      }

      return {
        errors: findings.filter((f: any) => f.severity === 'error').length,
        warnings: findings.filter((f: any) => f.severity === 'warning').length,
        findings,
        evidence,
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
    run: (ctx: any) => {
      const config = ctx.tool.config_path;
      const yamlFiles = configuredTargetFilesForScope(ctx, (file: any) => file.endsWith('.yaml') || file.endsWith('.yml'));
      if (yamlFiles.length === 0) return { errors: 0, warnings: 0, findings: [] };
      const args = ['-c', config, '-f', 'parsable', '--strict', ...yamlFiles];

      const result = requireToolExecution(safeExec('yamllint', args, { cwd: ctx.repoRoot, timeout: ctx.tool.timeout_ms }), 'yamllint');

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
}
