import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'contracts/check-session-polling-surface' });
import assert from 'assert';
import fs from 'fs';
import path from 'path';

function parseArgs(argv = process.argv.slice(2)) {
  const args = { sourceRoot: process.cwd() };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--source-root') args.sourceRoot = path.resolve(argv[i + 1]);
  }
  return args;
}

const { sourceRoot } = parseArgs();
const pollingSessionEndPath = path.join(sourceRoot, 'skills/nova/pipeline/services/polling-session-end.ts');
const pollingPath = path.join(sourceRoot, 'skills/nova/pipeline/services/polling.ts');
const gitWorktreePath = path.join(sourceRoot, 'skills/nova/pipeline/integrations/git-worktree.ts');
const pollingSessionEndTestPath = path.join(sourceRoot, 'tests/skills/nova/pipeline/services/polling-session-end.test.mjs');
const pollingSessionEndSource = fs.readFileSync(pollingSessionEndPath, 'utf8');
const pollingSource = fs.readFileSync(pollingPath, 'utf8');
const gitWorktreeSource = fs.readFileSync(gitWorktreePath, 'utf8');
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
  pollingSessionEndSource.includes('const finalChanges = _detectFinalChanges();'),
  true,
  'pollForSessionEnd should keep post-terminal local change classification',
);
assert.equal(
  pollingSessionEndSource.includes("reason: hasChanges ? 'session_ended' : 'session_closed_no_changes'"),
  true,
  'pollForSessionEnd should classify closed sessions by post-terminal local changes',
);
assert.equal(
  pollingSessionEndSource.includes("reason: hasChanges ? 'timeout_with_changes' : 'timeout'"),
  true,
  'pollForSessionEnd should classify timeouts by local changes without completing the session',
);
assert.equal(
  pollingSource.includes("polling.ts — Polling engine and lifecycle/ACP polling"),
  true,
  'generic polling source should describe lifecycle/ACP polling, not Redis+Git completion',
);
assert.equal(
  pollingSource.includes("log('WARN', `Session ${acpState.sessionState} before target lifecycle status"),
  true,
  'pollStatus should fail closed on ACP terminal before target lifecycle state',
);
assert.equal(
  gitWorktreeSource.includes('export function gitPullBeforePush('),
  true,
  'git worktree integration should keep explicit caller-owned before-push pull',
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
