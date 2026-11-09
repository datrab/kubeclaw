import fs from 'node:fs';
import { readScan } from './security-report.mjs';

export function openclawReference(root = process.cwd()) {
  const { openclaw } = JSON.parse(fs.readFileSync(`${root}/versions.json`, 'utf8'));
  return `ghcr.io/openclaw/openclaw:${openclaw.version}@${openclaw.digest}`;
}
export function usesOpenclaw(reference) {
  return /^ghcr\.io\/datrab\/kubeclaw-(?:nova|prism-agent|buster-gateway)@sha256:[a-f0-9]{64}$/u.test(reference);
}
const identity = finding => JSON.stringify([finding.id, finding.package, finding.installed,
  finding.severity, finding.type, finding.type === 'debian' ? null : finding.target, finding.packagePath]);

// Raven explicitly retains the pinned OpenClaw version. Exempt only findings
// proven unchanged in that exact upstream image; never exempt a whole final image.
export function deferInheritedOpenclaw(image, upstream) {
  if (image.status === 'error') return image;
  if (upstream.status === 'error') return { ...image, status: 'error', error: `OpenClaw baseline scan failed: ${upstream.error}` };
  const inherited = new Set(upstream.findings.map(identity));
  return { ...image, findings: image.findings.map(finding => inherited.has(identity(finding))
    ? { ...finding, deferredReason: 'retained-openclaw-upstream', upstreamReference: upstream.reference }
    : finding) };
}
export function readReleaseScan(item, directory, exitCode, root = process.cwd()) {
  const image = readScan(item, directory, exitCode);
  if (image.status === 'error') return image;
  const reference = openclawReference(root);
  if (item.reference === reference) return { ...image, findings: image.findings.map(finding => ({ ...finding,
    deferredReason: 'retained-openclaw-upstream', upstreamReference: reference })) };
  if (!usesOpenclaw(item.reference)) return image;
  // The shell validates the upstream scanner exit before scanning consumers.
  // Re-validate artifact identity/schema here; a missing baseline fails closed.
  return deferInheritedOpenclaw(image, readScan({ reference, sources: [], categories: [] }, directory, 0));
}
