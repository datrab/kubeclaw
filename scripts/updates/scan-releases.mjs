import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const versions = JSON.parse(fs.readFileSync('versions.json', 'utf8'));
const inputs = [...Object.values(versions.buildArgs).filter(v => typeof v === 'string' && v.includes('@sha256:')),
  ...Object.values(versions.infrastructure), ...Object.values(versions.automation),
  `ghcr.io/openclaw/openclaw:${versions.openclaw.version}@${versions.openclaw.digest}`];
let failure = false;
// A scan of inputs cannot stand in for scanning the actually selected runtime release.
if (!fs.existsSync('releases/runtime-images.json')) {
  console.error('No runtime release selected. Run Promote runtime release after a successful main build.'); failure = true;
} else {
  const release = JSON.parse(fs.readFileSync('releases/runtime-images.json', 'utf8'));
  if (release.schemaVersion !== 1 || !/^[a-f0-9]{40}$/.test(release.commit) || Object.keys(release.images ?? {}).length !== 10)
    throw new Error('Invalid selected runtime release');
  inputs.push(...Object.values(release.images));
}
for (const reference of new Set(inputs)) {
  const result = spawnSync('bash', ['scripts/scan-runtime-images.sh', reference], { stdio: 'inherit' });
  if (result.error || result.status !== 0) failure = true;
}
process.exitCode = failure ? 1 : 0;
