import { readReleaseScan } from './upstream-security-policy.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { scanInventory, writeSecurityReport, blocksRelease } from './security-report.mjs';

const root = process.cwd();
const directory = path.resolve(process.env.KUBECLAW_TRIVY_REPORT_DIR || 'dist/trivy');
const inventory = scanInventory(root);
const plan = { schemaVersion: 1, generatedAt: new Date().toISOString(), commit: process.env.GITHUB_SHA || null,
  runUrl: process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
    ? `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null,
  errors: inventory.errors, images: [] };
// Persist before scanning and after each image so timeouts also leave an inventory.
const pending = inventory.images.map(item => ({ ...item, status: 'error', error: 'Scan not completed', findings: [] }));
const persist = () => writeSecurityReport({ ...plan, images: [...plan.images, ...pending.slice(plan.images.length)] }, directory);
persist();
for (const item of inventory.images) {
  const result = spawnSync('bash', ['scripts/scan-runtime-images.sh', item.reference], { stdio: 'inherit', env: { ...process.env, KUBECLAW_TRIVY_REPORT_DIR: directory } });
  plan.images.push(readReleaseScan(item, directory, result.status));
  persist();
}
const failed = plan.errors.length || plan.images.some(blocksRelease);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, fs.readFileSync(path.join(directory, 'security-issue.md')));
process.exitCode = failed ? 1 : 0;
