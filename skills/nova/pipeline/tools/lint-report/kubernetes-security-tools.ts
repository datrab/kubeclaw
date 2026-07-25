import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { configuredTargetPaths } from './discovery.ts';
import { requireToolExecution, safeExec } from './execution.ts';
import { renderChart } from './helm-render.ts';
import { tryParseJson } from './parsers.ts';
import { failParse } from './report.ts';

const CANONICAL_LINT_CONFIG_FALSE_POSITIVE = {
  code: 'KSV-0109',
  resource: 'ConfigMap:default:agent-nova-swarm-config',
  document_sha256: '6e1860a5a1a01e896e694e954bd7af34850769ec13b09f48323d86d458c21528',
  message: `ConfigMap 'agent-nova-swarm-config' in 'default' namespace stores secrets in key(s) or value(s) '{"              password ", "              secret ", "              token ", "          - pattern"}'`,
  owner: 'pipeline-maintainers',
  reason: 'Trivy reads Semgrep rule examples embedded as lint configuration as ConfigMap secret values; the exact canonical resource and config payload are not credentials.',
  created: '2026-07-21',
  expires: '2026-10-20',
  tracking: 'lint-calibration-phase-8',
  approved_by: 'pipeline-maintainers',
  approved_on: '2026-07-21',
};

function issueMessage(issue: any) {
  if (issue.Message) return issue.Message;
  if (issue.Title) return issue.Title;
  return 'Kubernetes security misconfiguration';
}

function unquote(value: any) {
  return value?.trim().replace(/^['"]|['"]$/g, '') || null;
}

function documentAtLine(rendered: any, lineNumber: any) {
  const lines = rendered.split('\n');
  const lineIndex = Math.max(0, Math.min(lines.length - 1, Number(lineNumber || 1) - 1));
  let start = lineIndex;
  while (start > 0 && lines[start].trim() !== '---') start -= 1;
  if (lines[start].trim() === '---') start += 1;
  let end = lineIndex + 1;
  while (end < lines.length && lines[end].trim() !== '---') end += 1;
  return lines.slice(start, end);
}

function metadataLines(document: any) {
  const metadataIndex = document.findIndex((line: any) => /^metadata:\s*$/.test(line));
  if (metadataIndex < 0) return [];
  const lines: any[] = [];
  for (const line of document.slice(metadataIndex + 1)) {
    if (line.trim() && !/^\s/.test(line)) break;
    lines.push(line);
  }
  return lines;
}

function resourceIdentity(rendered: any, lineNumber: any) {
  const document = documentAtLine(rendered, lineNumber);
  const kind = unquote(document.find((line: any) => /^kind:\s*\S+/.test(line))?.replace(/^kind:\s*/, ''));
  const metadata = metadataLines(document);
  const name = unquote(metadata.find((line: any) => /^\s+name:\s*\S+/.test(line))?.replace(/^\s+name:\s*/, ''));
  const namespace = unquote(metadata.find((line: any) => /^\s+namespace:\s*\S+/.test(line))?.replace(/^\s+namespace:\s*/, '')) || 'default';
  return kind && name ? `${kind}:${namespace}:${name}` : 'unresolved-resource';
}

function documentForResource(rendered: string, resource: string): string {
  for (const document of rendered.split(/^---\s*$/m)) {
    if (resourceIdentity(document, 1) === resource) return document;
  }
  return '';
}

function normalizedDocumentDigest(document: string): string {
  const normalized = document.trim().replace(/\r\n/g, '\n');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

function isCanonicalLintConfigFalsePositive(
  rendered: string,
  issue: any,
  today: any = new Date().toISOString().slice(0, 10),
  filter: any = CANONICAL_LINT_CONFIG_FALSE_POSITIVE,
): boolean {
  if (today > filter.expires) return false;
  if (issue.ID !== filter.code) return false;
  if (issueMessage(issue) !== filter.message) return false;
  const document = documentForResource(rendered, filter.resource);
  if (!document) return false;
  return normalizedDocumentDigest(document) === filter.document_sha256;
}

function trivyFinding(ctx: any, chartDir: any, rendered: any, issue: any, occurrence: any) {
  const code = issue.ID || 'trivy-kubernetes';
  const message = issueMessage(issue);
  const resource = resourceIdentity(rendered, issue.CauseMetadata?.StartLine);
  return {
    file: chartDir,
    line: issue.CauseMetadata?.StartLine ?? null,
    column: null,
    severity: 'error',
    code,
    message,
    fingerprint_seed: { chart: path.relative(ctx.repoRoot, chartDir).split(path.sep).join('/'), resource, code, message, occurrence },
  };
}

function trivyFindings(ctx: any, chartDir: any, rendered: any, issues: any) {
  const occurrences = new Map();
  return issues.filter((issue: any) => !isCanonicalLintConfigFalsePositive(rendered, issue)).map((issue: any) => {
    const resource = resourceIdentity(rendered, issue.CauseMetadata?.StartLine);
    const identity = JSON.stringify({ resource, code: issue.ID, message: issueMessage(issue) });
    const occurrence = (occurrences.get(identity) || 0) + 1;
    occurrences.set(identity, occurrence);
    return trivyFinding(ctx, chartDir, rendered, issue, occurrence);
  });
}

function runTrivyKubernetes(ctx: any) {
  const findings: any[] = [];
  for (const chartDir of configuredTargetPaths(ctx)) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kubeclaw-trivy-kubernetes-'));
    const manifestPath = path.join(tempDir, 'rendered.yaml');
    try {
      const rendered = renderChart(ctx, chartDir);
      fs.writeFileSync(manifestPath, rendered);
      const args = ['config', '--quiet', '--format', 'json', '--misconfig-scanners', 'kubernetes', '--severity', 'HIGH,CRITICAL', '--skip-check-update', '--skip-version-check', '--exit-code', '1', ...ctx.tool.arguments, manifestPath];
      const result = requireToolExecution(safeExec('trivy', args, { cwd: ctx.repoRoot, timeout: ctx.tool.timeout_ms }), 'trivy-kubernetes');
      const parsed = tryParseJson(result.stdout);
      if (!parsed.ok) return failParse(ctx, 'trivy-kubernetes', parsed, result, chartDir);
      if (result.exitCode !== 0 && result.exitCode !== 1) return failParse(ctx, 'trivy-kubernetes', { error: `unexpected exit code ${result.exitCode}` }, result, chartDir);
      const results = Array.isArray(parsed.data?.Results) ? parsed.data.Results : [];
      const issues = results.flatMap((entry: any) => Array.isArray(entry.Misconfigurations) ? entry.Misconfigurations : []);
      findings.push(...trivyFindings(ctx, chartDir, rendered, issues));
      if (result.exitCode !== 0 && issues.length === 0) return failParse(ctx, 'trivy-kubernetes', { error: 'non-zero exit without misconfigurations' }, result, chartDir);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
  return { errors: findings.length, warnings: 0, findings };
}

function registerKubernetesSecurityTools(registerTool: any) {
  registerTool({
    id: 'trivy-kubernetes',
    name: 'Trivy Kubernetes',
    binary: 'trivy',
    tier: 'full',
    detect: (ctx: any) => ctx.projectTypes.has('helm'),
    run: runTrivyKubernetes,
  });
}

export { CANONICAL_LINT_CONFIG_FALSE_POSITIVE, isCanonicalLintConfigFalsePositive, normalizedDocumentDigest, registerKubernetesSecurityTools, trivyFindings };
