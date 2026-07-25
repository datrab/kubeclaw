import crypto from 'crypto';
import path from 'path';

function normalizedFile(repoRoot: string, file: unknown): string | null {
  if (typeof file !== 'string' || !file.trim()) return null;
  const absolute = path.isAbsolute(file) ? path.normalize(file) : path.resolve(repoRoot, file);
  const relative = path.relative(repoRoot, absolute);
  if (relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)) {
    return relative.split(path.sep).join('/');
  }
  return file.split(path.sep).join('/');
}

function normalizedMessage(message: unknown): string {
  return String(message || '').trim().replace(/\s+/g, ' ');
}

function findingFingerprint(toolId: string, repoRoot: string, finding: Record<string, any>): string {
  const identity = finding.fingerprint_seed ?? {
    code: finding.code,
    file: normalizedFile(repoRoot, finding.file),
    message: normalizedMessage(finding.message),
  };
  return crypto.createHash('sha256').update(JSON.stringify({ tool: toolId, identity })).digest('hex');
}

function normalizeFindings(ctx: Record<string, any>, toolId: string, findings: unknown[]): Record<string, any>[] {
  const baseline = ctx.policy.baseline?.entries_by_key ?? new Map();
  const today = new Date().toISOString().slice(0, 10);
  return findings.map((raw: any) => {
    const finding = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, any> : {};
    const fingerprint = findingFingerprint(toolId, ctx.repoRoot, finding);
    const baselineEntry = baseline.get(`${toolId}:${fingerprint}`);
    const normalized: Record<string, any> = {
      ...finding,
      file: normalizedFile(ctx.repoRoot, finding.file),
      fingerprint,
    };
    delete normalized.fingerprint_seed;
    if (baselineEntry && baselineEntry.expires >= today) {
      normalized.baseline = {
        owner: baselineEntry.owner,
        reason: baselineEntry.reason,
        created: baselineEntry.created,
        expires: baselineEntry.expires,
        tracking: baselineEntry.tracking,
        approved_by: baselineEntry.approved_by,
        approved_on: baselineEntry.approved_on,
      };
    }
    return normalized;
  });
}

export { findingFingerprint, normalizeFindings,  };
