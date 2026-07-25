import fs from 'node:fs';
import path from 'node:path';
import { archValidatorLogDir } from '../core/paths.ts';
import { log } from '../core/logger.ts';
import { writePromptArtifact } from '../egress.ts';
import { firstTruthy } from './arch-validator-values.ts';

export function buildArtifactPaths(config: any) {
  const logDir = archValidatorLogDir(config);
  return logDir
    ? {
        results: path.join(logDir, 'results.json'),
        summary: path.join(logDir, 'summary.md'),
        prompt: path.join(logDir, 'validator-prompt.md'),
      }
    : { results: null, summary: null, prompt: null };
}

export function buildArtifactRefs(config: any) {
  const paths = buildArtifactPaths(config);
  return [
    { type: 'validator_report', role: 'output', label: 'architecture-results', format: 'json', path: paths.results },
    { type: 'validator_report', role: 'output', label: 'architecture-summary', format: 'md', path: paths.summary },
    { type: 'validator_report', role: 'output', label: 'architecture-prompt', format: 'md', path: paths.prompt },
  ].filter((artifact) => Boolean(artifact.path));
}

function markdownFinding(finding: any) {
  const lines = [
    `### [${String(finding.severity).toUpperCase()}] \`${finding.id}\``,
    `**Scope:** ${finding.scope}`,
  ];
  if (Array.isArray(finding.paths) && finding.paths.length > 0) lines.push(`**Paths:** ${finding.paths.join(', ')}`);
  lines.push(`**Issue:** ${finding.explanation}`, `**Fix:** ${finding.remediation}`, '');
  return lines;
}

function buildMarkdownSummary(result: any) {
  const findings = Array.isArray(result.findings) ? result.findings : [];
  const count = (severity: string) => findings.filter((finding: any) => finding.severity === severity).length;
  const lines = [
    '# Architecture Validation Report',
    '',
    `**Project:** ${result.project}`,
    `**Timestamp:** ${result.timestamp}`,
    `**Result:** ${result.blocked ? 'BLOCKED' : 'PASS'}`,
    '',
    '## Summary',
    '',
    '| Severity | Count |',
    '|----------|-------|',
    `| blocking | ${count('blocking')} |`,
    `| error    | ${count('error')} |`,
    `| warn     | ${count('warn')} |`,
    `| info     | ${count('info')} |`,
    `| **total**| **${findings.length}** |`,
    '',
  ];
  if (findings.length === 0) return [...lines, '_No issues found. Architecture is valid._'].join('\n');
  return [...lines, '## Findings', '', ...findings.flatMap(markdownFinding)].join('\n');
}

export function writeArchitectureArtifacts(config: any, result: any, prompt: any) {
  const logDir = archValidatorLogDir(config);
  if (!logDir) return;
  try {
    fs.mkdirSync(logDir, { recursive: true });
    fs.writeFileSync(path.join(logDir, 'results.json'), `${JSON.stringify(result, null, 2)}\n`);
    fs.writeFileSync(path.join(logDir, 'summary.md'), buildMarkdownSummary(result));
    if (prompt) {
      writePromptArtifact(path.join(logDir, 'validator-prompt.md'), prompt, {
        agent_type: 'arch_validator',
        project: firstTruthy(result?.project, config?.project, 'missing_project'),
      });
    }
  } catch (error: any) {
    log('WARN', `[arch-validator] Failed to write artifacts: ${error.message}`);
  }
}
