import { blocksRelease } from './security-report.mjs';
import { readReleaseScan } from './upstream-security-policy.mjs';

const args = process.argv.slice(2);
const local = args[0] === '--local';
const [role, reference, localImageId, directory, code] = local ? args.slice(1) : [undefined, args[0], undefined, args[1], args[2]];
if (local && !['nova','prism-agent','buster-gateway','buster-runtime','namespace-controller','archviewer','prism-control','prism-studio','prism-worker','prism-ingestion'].includes(role)) throw new Error('Unknown local runtime role');
const image = readReleaseScan({ reference, ...(local ? { role, localImageId } : {}), sources: [], categories: [] }, directory, Number(code));
const upstream = image.findings.filter(finding => finding.deferredReason).length;
const deferred = image.findings.filter(finding => !finding.fixed && !finding.deferredReason).length;
console.log(`Security gate: ${image.status}; ${image.findings.length - deferred - upstream} fixable, ${deferred} without published fix, ${upstream} unchanged in retained OpenClaw (non-blocking).`);
if (image.error) console.error(image.error);
// Preserve infrastructure failure separately from completed vulnerability scans.
process.exitCode = image.status === 'error' ? 2 : blocksRelease(image) ? 1 : 0;
