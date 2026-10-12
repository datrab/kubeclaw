import { spawnSync } from 'node:child_process';
const environment = { ...process.env, BUSTER_RESTRICTED_HELPER: '/opt/ha-proof/restricted' };
const suites = [
  { name: 'service', files: ['scripts/tests/buster-helper-authority.test.mjs'], uid: 1000, gid: 1000 },
  { name: 'root', files: ['scripts/tests/buster-helper-authority-root.test.mjs', 'ha-proof/guest-proof.test.mjs'], uid: 0, gid: 0 },
];
let failed = false;
for (const suite of suites) {
  console.log(`VM_PHASE=ha-${suite.name}`);
  const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...suite.files],
    { cwd: '/repo', env: environment, uid: suite.uid, gid: suite.gid, stdio: 'inherit' });
  console.log(`VM_HA_${suite.name.toUpperCase()}_STATUS=${result.status}`);
  if (result.status !== 0) failed = true;
}
process.exitCode = failed ? 1 : 0;
