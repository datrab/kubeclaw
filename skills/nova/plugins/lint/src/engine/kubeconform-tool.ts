import path from 'node:path';
import crypto from 'node:crypto';
import { requireToolExecution, safeExec } from './execution.ts';
import { configuredMarkerDirectories } from './discovery.ts';
import { renderChart } from './helm-render.ts';
import { loadKubernetesResources } from './kubernetes-manifests.ts';
import { tryParseJson } from './parsers.ts';
import { failParse } from './report.ts';
import { selectDefinedValue, selectTruthyValue } from '../support/optional-absence.ts';

function collectors(ctx: any, id: string, findings: any[], evidence: any[]) {
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

  return { pushResourceFinding, recordEvidence };
}

async function validateRaw(ctx: any, baseArgs: string[], projectRoot: string, pushResourceFinding: any, recordEvidence: any) {
  const settings = ctx.policyProject.kubernetes;
      if (settings.raw_manifests.length > 0) {
        const rawFiles = settings.raw_manifests.map((relative: string) => path.resolve(projectRoot, relative));
        const rawArguments = rawFiles.map((absolute: string) => path.relative(ctx.repoRoot, absolute).split(path.sep).join('/'));
        const result = requireToolExecution(await safeExec('kubeconform', [...baseArgs, ...rawArguments], { signal: ctx.signal, cwd: ctx.repoRoot, timeout: ctx.tool.timeout_ms }), 'kubeconform');
        const parsed = tryParseJson(result.stdout);
        if (!parsed.ok) return failParse(ctx, 'kubeconform', parsed, result, rawFiles[0]);
        recordEvidence('kubeconform-output', 'raw-manifests', result.stdout);
        const resources = Array.isArray(parsed.data?.resources) ? parsed.data.resources : [];
        for (const item of resources) pushResourceFinding(item);
        if (resources.length === 0 && result.exitCode !== 0) return failParse(ctx, 'kubeconform', { error: 'non-zero exit without parsed resources' }, result, rawFiles[0]);
      }

}

async function validateChart(ctx: any, includeRaw: boolean, baseArgs: string[], chart: any, findings: any[], pushResourceFinding: any, recordEvidence: any) {
  const settings = ctx.policyProject.kubernetes;
  const { chartDir, source } = chart;
        const findingsBefore = findings.length;
        const rendered = await renderChart(ctx, chartDir);
        if (includeRaw && Buffer.byteLength(rendered) > settings.limits.max_rendered_bytes) throw Object.assign(new Error(`${source} exceeds max_rendered_bytes`), { code: 'kubeconform-render-size-limit' });
        const result = requireToolExecution(await safeExec('kubeconform', [...baseArgs, '-'], {
          signal: ctx.signal, cwd: ctx.repoRoot,
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

export function kubeconformTool(id = 'kubeconform', includeRaw = false) {
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
    run: async (ctx: any) => {
      const findings: any[] = [];
      const evidence: any[] = [];
      const settings = ctx.policyProject.kubernetes;
      const projectRoot = path.resolve(ctx.repoRoot, ctx.policyProject.root);
      // The migrated Kubernetes lint path owns its pinned local schema source.
      // The retained generic Helm adapter stays compatible for non-migrated use.
      const baseArgs = includeRaw
        ? ['-output', 'json', '-summary', '-strict', '-kubernetes-version', settings.kubernetes_version, '-schema-location', settings.schema_location]
        : ['-output', 'json', '-summary', '-strict'];
      if (includeRaw) evidence.push(...(await loadKubernetesResources(ctx)).sources);

      const { pushResourceFinding, recordEvidence } = collectors(ctx, id, findings, evidence);
      if (includeRaw) await validateRaw(ctx, baseArgs, projectRoot, pushResourceFinding, recordEvidence);

      const chartDirs = includeRaw
        ? settings.helm_charts.map((relative: string) => ({ chartDir: path.resolve(projectRoot, relative), source: relative }))
        : configuredMarkerDirectories(ctx, 'Chart.yaml').map((chartDir: string) => ({ chartDir, source: path.relative(ctx.repoRoot, chartDir).split(path.sep).join('/') }));
      for (const chart of chartDirs) await validateChart(ctx, includeRaw, baseArgs, chart, findings, pushResourceFinding, recordEvidence);

      return {
        errors: findings.filter((f: any) => f.severity === 'error').length,
        warnings: findings.filter((f: any) => f.severity === 'warning').length,
        findings,
        evidence,
      };
    },
  };
}
