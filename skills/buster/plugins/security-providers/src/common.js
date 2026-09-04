import crypto from 'node:crypto';

export const SEVERITIES = Object.freeze(['critical', 'high', 'medium', 'low', 'info']);
const POLICY = Object.freeze({ profile: 'strict-v1', blockingSeverities: Object.freeze(['critical', 'high']),
  blockActiveThreats: true, blockMissingFixes: true, scannerError: 'error' });

export function object(value, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
  return value;
}

export function integer(value, fallback, minimum, maximum, code) {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result < minimum || result > maximum) throw new Error(code);
  return result;
}

function acceptances(value) {
  const list = value ?? [];
  if (!Array.isArray(list) || list.length > 128) throw new Error('SECURITY_POLICY_ACCEPTANCES_INVALID');
  const seen = new Set();
  return list.map((entry) => {
    const item = object(entry, 'SECURITY_POLICY_ACCEPTANCES_INVALID');
    if (typeof item.findingId !== 'string' || item.findingId.length < 1 || item.findingId.length > 256
      || !/^[A-Za-z0-9._:@/-]+$/u.test(item.findingId) || seen.has(item.findingId)
      || typeof item.reason !== 'string' || item.reason.trim().length < 8 || item.reason.length > 1024
      || typeof item.expiresAt !== 'string' || !Number.isFinite(Date.parse(item.expiresAt))) {
      throw new Error('SECURITY_POLICY_ACCEPTANCES_INVALID');
    }
    seen.add(item.findingId);
    return { findingId: item.findingId, reason: item.reason.trim(), expiresAt: new Date(item.expiresAt).toISOString() };
  });
}

export function policy(value) {
  const item = object(value, 'SECURITY_POLICY_INVALID');
  if (item.profile !== POLICY.profile || Object.keys(item).some((key) => !['profile', 'acceptances'].includes(key))) {
    throw new Error('SECURITY_POLICY_INVALID');
  }
  return { ...POLICY, acceptances: acceptances(item.acceptances) };
}

export function details(schemaId, values) {
  return { schemaId, schemaDigest: `sha256:${crypto.createHash('sha256').update(schemaId).digest('hex')}`, values };
}

export function result(invocation, scanner, rawFindings, resolvedPolicy, detailValues = {}) {
  if (!Array.isArray(rawFindings) || rawFindings.length > 4096) throw new Error('SECURITY_SCANNER_RESPONSE_INVALID');
  const accepted = new Map(resolvedPolicy.acceptances.map((item) => [item.findingId, item]));
  const now = Date.now();
  const findings = [];
  const normalizedFindings = [];
  const acceptedFindings = [];
  const blocking = [];
  const ids = new Set();
  for (const raw of rawFindings) {
    const finding = object(raw, 'SECURITY_SCANNER_RESPONSE_INVALID');
    if (typeof finding.id !== 'string' || finding.id.length < 1 || finding.id.length > 256 || ids.has(finding.id)
      || !SEVERITIES.includes(finding.severity) || typeof finding.message !== 'string'
      || finding.message.length < 1 || finding.message.length > 4096) {
      throw new Error('SECURITY_SCANNER_RESPONSE_INVALID');
    }
    ids.add(finding.id);
    const waiver = accepted.get(finding.id);
    const isAccepted = Boolean(waiver && Date.parse(waiver.expiresAt) > now);
    const isBlocking = resolvedPolicy.blockingSeverities.includes(finding.severity)
      || (resolvedPolicy.blockActiveThreats && finding.status === 'affected')
      || (resolvedPolicy.blockMissingFixes && finding.category === 'vulnerability' && !finding.fixedVersion);
    findings.push({ id: finding.id, severity: finding.severity, message: finding.message,
      ...(typeof finding.rule === 'string' ? { rule: finding.rule } : {}),
      ...(typeof finding.file === 'string' ? { file: finding.file } : {}),
      ...(Number.isSafeInteger(finding.line) ? { line: finding.line } : {}) });
    normalizedFindings.push({ id: finding.id, severity: finding.severity, message: finding.message,
      ...(typeof finding.category === 'string' ? { category: finding.category.slice(0, 128) } : {}),
      ...(typeof finding.package === 'string' ? { package: finding.package.slice(0, 512) } : {}),
      ...(typeof finding.installedVersion === 'string' ? { installedVersion: finding.installedVersion.slice(0, 512) } : {}),
      ...(typeof finding.fixedVersion === 'string' ? { fixedVersion: finding.fixedVersion.slice(0, 512) } : {}),
      ...(typeof finding.file === 'string' ? { sourceFile: finding.file } : {}),
      ...(finding.reachability === null || typeof finding.reachability === 'string'
        ? { reachability: finding.reachability === null ? null : finding.reachability.slice(0, 512) } : {}),
      ...(typeof finding.status === 'string' ? { status: finding.status.slice(0, 128) } : {}) });
    if (isAccepted) acceptedFindings.push({ findingId: finding.id, reason: waiver.reason, expiresAt: waiver.expiresAt });
    else if (isBlocking) blocking.push(finding.id);
  }
  const expiredAcceptances = resolvedPolicy.acceptances.filter((item) => Date.parse(item.expiresAt) <= now);
  const unusedAcceptances = resolvedPolicy.acceptances.filter((item) => !ids.has(item.findingId));
  const total = Math.max(1, findings.length);
  const failed = blocking.length;
  return { schemaVersion: 'provider-result.v1', outcome: failed > 0 ? 'failed' : 'passed',
    summary: failed > 0 ? `${failed} blocking security finding${failed === 1 ? '' : 's'} remain.`
      : findings.length > 0 ? `${findings.length} visible security finding${findings.length === 1 ? '' : 's'} do not block.`
        : 'No security finding was reported.',
    counts: { total, passed: total - failed, failed, skipped: 0 }, findings, metrics: [
      { name: 'security_findings', value: findings.length }, { name: 'security_blocking_findings', value: failed },
      { name: 'security_accepted_findings', value: acceptedFindings.length }],
    evidenceFiles: [], reports: [], outputs: [], exitCode: null, signal: null,
    providerDetails: details(`kubeclaw.${scanner}-security-details.v1`, { scanner, policy: resolvedPolicy,
      blockingFindingIds: blocking, acceptedFindings, expiredAcceptances, unusedAcceptances,
      normalizedFindings, ...detailValues }) };
}

export function safePart(value) {
  const normalized = String(value ?? 'unknown').replace(/[^A-Za-z0-9._:@/-]+/gu, '-');
  if (normalized.length <= 120) return normalized;
  return `${normalized.slice(0, 48)}:sha256:${crypto.createHash('sha256').update(normalized).digest('hex')}`;
}

export function findingId(...parts) {
  const full = parts.map(safePart).join(':');
  if (full.length <= 256) return full;
  return `${full.slice(0, 184)}:sha256:${crypto.createHash('sha256').update(full).digest('hex')}`;
}
