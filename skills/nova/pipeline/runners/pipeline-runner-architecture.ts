import { buildDiscordIdentitySurfaceFields, DISCORD_IDENTITY_SURFACES } from '../services/discord-fields.ts';

type AnyRecord = Record<string, any>;
const PRE_MODULE_FAILURE = 'Architecture validation failed before module execution';
const APPROVAL_GATE_ID = 'architecture-approval';

export function architectureValidationEnabled(progress: AnyRecord, config: AnyRecord): boolean {
  if (typeof progress?.arch_validation?.enabled === 'boolean') return progress.arch_validation.enabled;
  if (typeof config?.enabled === 'boolean') return config.enabled;
  throw new Error('Architecture validation requires typed enabled authority');
}

export function architectureValidationBlockSummary(result: AnyRecord, report: AnyRecord, findings: AnyRecord[]): string {
  const summary = findings.map((finding) => `[${finding.id}] ${finding.explanation}`).join('; ');
  if (summary) return summary;
  if (typeof result?.diagnostics?.summary === 'string' && result.diagnostics.summary.trim()) return result.diagnostics.summary.trim();
  if (typeof report?.error === 'string' && report.error.trim()) return report.error.trim();
  return PRE_MODULE_FAILURE;
}

export function architectureBlockingFindings(findings: AnyRecord[] = []): AnyRecord[] {
  return findings.filter((finding) => finding?.severity === 'blocking' || finding?.severity === 'error');
}

function findingLabel(finding: AnyRecord): string {
  const id = typeof finding?.id === 'string' && finding.id.trim() ? finding.id.trim() : 'finding_id_missing';
  const severity = typeof finding?.severity === 'string' && finding.severity.trim() ? finding.severity.trim() : 'severity_missing';
  const explanation = typeof finding?.explanation === 'string' && finding.explanation.trim() ? finding.explanation.trim() : 'explanation_missing';
  return `[${id}] ${severity}: ${explanation}`;
}

function findingDetails(findings: AnyRecord[], limit = 6): string {
  const lines = findings.slice(0, limit).map(findingLabel);
  if (findings.length > limit) lines.push(`… ${findings.length - limit} more finding(s)`);
  return lines.join('\n');
}

export function architectureValidatorDiscordFields(correlation: AnyRecord, report: AnyRecord, extra: AnyRecord[] = []): AnyRecord[] {
  const findings = Array.isArray(report?.findings) ? report.findings : [];
  const fields = buildDiscordIdentitySurfaceFields(DISCORD_IDENTITY_SURFACES.PIPELINE, correlation, [{ name: 'Findings', value: String(findings.length), inline: true }, ...extra]);
  if (findings.length) fields.push({ name: 'Finding Details', value: findingDetails(findings).slice(0, 1024), inline: false });
  return fields;
}

function approvalTimeout(progress: AnyRecord, config: AnyRecord): number {
  const value = progress?.arch_validation?.approval_gate?.timeout_minutes ?? config?.approval_gate?.timeout_minutes;
  if (Number.isInteger(value) && value > 0) return value;
  throw new Error('Architecture findings approval requires progress.arch_validation.approval_gate.timeout_minutes or config.arch_validation.approval_gate.timeout_minutes');
}

export function installArchitectureApprovalGate(progress: AnyRecord, config: AnyRecord, report: AnyRecord): string {
  const findings = Array.isArray(report?.findings) ? report.findings : [];
  progress.gates = progress.gates && typeof progress.gates === 'object' && !Array.isArray(progress.gates) ? progress.gates : {};
  progress.gates[APPROVAL_GATE_ID] = { type: 'approval', title: 'Architecture findings approval', timeout_minutes: approvalTimeout(progress, config), on_timeout: 'block', description: ['Architecture Validator passed with advisory findings. Approve to continue module work, or deny to send it back for changes.', '', findingDetails(findings, 12)].join('\n').trim() };
  progress.execution_order = Array.isArray(progress.execution_order) ? progress.execution_order : [];
  const step = `gate:${APPROVAL_GATE_ID}`;
  if (!progress.execution_order.includes(step)) progress.execution_order.unshift(step);
  return APPROVAL_GATE_ID;
}
