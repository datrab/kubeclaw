import { parseSourceRootArgs } from '../lib/contract-check-helpers.mjs';
import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'contracts/check-session-polling-surface' });
import assert from 'assert';
import fs from 'fs';
import path from 'path';


const { sourceRoot } = parseSourceRootArgs();
const pollingSessionEndPath = path.join(sourceRoot, 'skills/nova/pipeline/services/polling-session-end.ts');
const pollingPath = path.join(sourceRoot, 'skills/nova/pipeline/services/polling.ts');
const gitWorktreePath = path.join(sourceRoot, 'skills/common/pipeline/integrations/git-worktree.ts');
const novaGitWorktreeShimPath = path.join(sourceRoot, 'skills/nova/pipeline/integrations/git-worktree.ts');
const pollingSessionEndTestPath = path.join(sourceRoot, 'tests/skills/nova/pipeline/services/polling-session-end.test.mjs');
const pollingSessionEndSource = fs.readFileSync(pollingSessionEndPath, 'utf8');
const pollingSessionEndImplementationSource = fs.readdirSync(path.dirname(pollingSessionEndPath))
  .filter((name) => name.startsWith('polling-session-end') && name.endsWith('.ts'))
  .map((name) => fs.readFileSync(path.join(path.dirname(pollingSessionEndPath), name), 'utf8'))
  .join('\n');
const pollingSource = fs.readFileSync(pollingPath, 'utf8');
const pollingImplementationSource = fs.readdirSync(path.dirname(pollingPath))
  .filter((name) => name.startsWith('polling') && name.endsWith('.ts'))
  .map((name) => fs.readFileSync(path.join(path.dirname(pollingPath), name), 'utf8'))
  .join('\n');
const gitWorktreeSource = fs.readFileSync(gitWorktreePath, 'utf8');
const novaGitWorktreeShimSource = fs.readFileSync(novaGitWorktreeShimPath, 'utf8');
const pollingSessionEndTestSource = fs.readFileSync(pollingSessionEndTestPath, 'utf8');
const runtimePollingSource = `${pollingSessionEndSource}\n${pollingSource}\n${gitWorktreeSource}`;

for (const deletedMarker of [
  'gitPullForPolling',
  'syncRepoForPolling',
  'POST_CHANGE_GRACE_MS',
  'lastHeadChangeTime',
  'lastKnownHead',
  'legacy agent-side commit/push',
  'HEAD movement — session complete',
  'One final safe git pull',
  'catch any legacy remote update',
]) {
  assert.equal(
    runtimePollingSource.includes(deletedMarker),
    false,
    `runtime polling must not keep agent-side git completion inference marker: ${deletedMarker}`,
  );
}

assert.equal(
  pollingSessionEndSource.includes('ACP terminal state is the only session completion signal'),
  true,
  'pollForSessionEnd must document ACP terminal state as the sole completion authority',
);
assert.equal(
  pollingSessionEndImplementationSource.includes('const changes = detectFinalChanges(state);'),
  true,
  'pollForSessionEnd should keep post-terminal local change classification',
);
assert.equal(
  pollingSessionEndImplementationSource.includes('reason: changes.hasChanges ? "session_ended" : "session_closed_no_changes"'),
  true,
  'pollForSessionEnd should classify closed sessions by post-terminal local changes',
);
assert.equal(
  pollingSessionEndImplementationSource.includes('reason: changes.hasChanges ? "timeout_with_changes" : "timeout"'),
  true,
  'pollForSessionEnd should classify timeouts by local changes without completing the session',
);
assert.equal(
  pollingSource.includes("polling.ts — Polling engine and lifecycle/ACP polling"),
  true,
  'generic polling source should describe lifecycle/ACP polling, not Redis+Git completion',
);
assert.equal(
  pollingImplementationSource.includes('before target lifecycle status'),
  true,
  'pollStatus should fail closed on ACP terminal before target lifecycle state',
);
assert.equal(
  gitWorktreeSource.includes('gitPullBeforePush'),
  true,
  'shared git worktree integration should keep explicit caller-owned before-push pull',
);
assert.equal(
  novaGitWorktreeShimSource.includes("export * from '../../../common/pipeline/integrations/git-worktree.ts';"),
  true,
  'Nova git worktree should remain a thin shared-implementation shim',
);

for (const requiredTest of [
  'completes only after ACP terminal state and reports local changes',
  'completes after ACP terminal state without local changes',
  'fails closed when ACP monitor adapter fails',
  'timeout preserves late HEAD movement as changes',
]) {
  assert.equal(
    pollingSessionEndTestSource.includes(requiredTest),
    true,
    `polling-session-end tests should cover ${requiredTest}`,
  );
}

quietConsole.restore();
console.log(JSON.stringify({ ok: true, checked: 20 }));
