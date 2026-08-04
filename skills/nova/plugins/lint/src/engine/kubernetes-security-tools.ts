import fs from 'fs';
import os from 'os';
import path from 'path';

import { configuredMarkerDirectories } from './discovery.ts';
import { requireToolExecution, safeExec } from './execution.ts';
import { renderChart } from './helm-render.ts';
import { tryParseJson } from './parsers.ts';
import { failParse } from './report.ts';

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
  return issues.map((issue: any) => {
    const resource = resourceIdentity(rendered, issue.CauseMetadata?.StartLine);
    const identity = JSON.stringify({ resource, code: issue.ID, message: issueMessage(issue) });
    const occurrence = (occurrences.get(identity) || 0) + 1;
    occurrences.set(identity, occurrence);
    return trivyFinding(ctx, chartDir, rendered, issue, occurrence);
  });
}

function runTrivyKubernetes(ctx: any) {
  const findings: any[] = [];
  for (const chartDir of configuredMarkerDirectories(ctx, 'Chart.yaml')) {
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

export { registerKubernetesSecurityTools, trivyFindings };
