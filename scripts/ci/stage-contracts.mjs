import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

// Every former serial adapter suite remains required; only scheduling changes.
export const stageGroups = {
  lint: [['--workspace', '@kubeclaw/plugin-lint'], ['--prefix', 'skills/nova/plugins/delivery-lint']],
  review: [['--workspace', '@kubeclaw/plugin-review'], ['--workspace', '@kubeclaw/plugin-prism-design']],
  pipeline: [['--workspace', '@kubeclaw/plugin-implementation-agent'], ['--workspace', '@kubeclaw/plugin-buster-quality-gate'], ['--workspace', '@kubeclaw/plugin-runtime-dispatch'], ['--prefix', 'skills/buster/plugins/http']],
  observers: [['--workspace', '@kubeclaw/plugin-notification-observer'], ['--workspace', '@kubeclaw/plugin-human-approval'], ['--workspace', '@kubeclaw/plugin-project-summary'], ['--workspace', '@kubeclaw/plugin-operator-messaging']],
};
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const group = stageGroups[process.argv[2]];
  if (!group) throw new Error('Unknown stage contract group');
  let failed = false;
  for (const args of group) {
    const start = Date.now();
    const result = spawnSync('npm', ['test', ...args], { stdio: 'inherit' });
    console.log(JSON.stringify({ suite: args[1], seconds: (Date.now() - start) / 1000, status: result.status }));
    if (result.status !== 0) failed = true;
  }
  process.exitCode = failed ? 1 : 0;
}
