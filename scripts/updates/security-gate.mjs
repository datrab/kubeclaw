import { blocksRelease } from './security-report.mjs';
import { readReleaseScan } from './upstream-security-policy.mjs';

const [reference, directory, code] = process.argv.slice(2);
const image = readReleaseScan({ reference, sources: [], categories: [] }, directory, Number(code));
const upstream = image.findings.filter(finding => finding.deferredReason).length;
const deferred = image.findings.filter(finding => !finding.fixed && !finding.deferredReason).length;
console.log(`Security gate: ${image.status}; ${image.findings.length - deferred - upstream} fixable, ${deferred} without published fix, ${upstream} unchanged in retained OpenClaw (non-blocking).`);
if (image.error) console.error(image.error);
// Preserve infrastructure failure separately from completed vulnerability scans.
process.exitCode = image.status === 'error' ? 2 : blocksRelease(image) ? 1 : 0;
