import { readScan, blocksRelease } from './security-report.mjs';

const [reference, directory, code] = process.argv.slice(2);
const image = readScan({ reference, sources: [], categories: [] }, directory, Number(code));
const deferred = image.findings.filter(finding => !finding.fixed).length;
console.log(`Security gate: ${image.status}; ${image.findings.length - deferred} fixable, ${deferred} without published fix (non-blocking).`);
if (image.error) console.error(image.error);
process.exitCode = blocksRelease(image) ? 1 : 0;
