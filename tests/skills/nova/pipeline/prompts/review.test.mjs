import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { buildGateFixPrompt } from '../../../../../skills/nova/pipeline/prompts/gate-fix.ts';
import { buildReviewFixPrompt } from '../../../../../skills/nova/pipeline/prompts/review.ts';

function makeConfig(projectDirName = 'project') {
  const root = fs.mkdtempSync(path.join('/home', 'review-prompt-'));
  const projectSrc = path.join(root, projectDirName);
  const swarmDir = path.join(projectSrc, '.swarm');
  fs.mkdirSync(swarmDir, { recursive: true });
  return {
    project: 'test-project',
    repo_root: root,
    paths: {
      swarm_dir: swarmDir,
    },
  };
}

test('buildReviewFixPrompt returns prompt result metadata with string compatibility', () => {
  const config = {
    project: 'demo',
    repo_root: '/repo',
    paths: {
      swarm_dir: '/repo/.swarm',
    },
  };
  const gate = {
    id: 'review-foundation',
    title: 'Foundation Review',
  };
  const issues = [{
    description: 'Use the shared prompt result shape',
    module: 'prompts',
    location: 'nova/pipeline/prompts/review.ts',
    recommended_fix: 'Wrap the prompt with makePromptResult',
  }];

  const result = buildReviewFixPrompt(config, gate, issues, 2, 3);

  assert.equal(typeof result.prompt, 'string');
  assert.match(result.prompt, /Review Fix: Foundation Review/);
  assert.equal(result.metadata.phase, 'review-fix');
  assert.equal(result.metadata.moduleId, 'review-foundation');
  assert.equal(result.metadata.attempt, 2);
  assert.equal(result.toString(), result.prompt);
});

test('gate fix prompt shell-quotes project source cd command with leading hyphen', () => {
  const config = makeConfig("-work dir/one; touch bad'file");
  const result = buildGateFixPrompt(
    config,
    { id: 'security', title: 'Security' },
    [{ title: 'Unsafe behavior', description: 'Fix it' }],
    1,
    3,
  );

  assert.ok(result.prompt.includes("`cd -- '-work dir/one; touch bad'\\''file'` before modifying any files."));
  assert.doesNotMatch(result.prompt, /`cd -work dir\/one; touch bad/);
});

test('review fix prompt shell-quotes project source cd command with leading hyphen', () => {
  const config = makeConfig("-work dir/one; touch bad'file");
  const result = buildReviewFixPrompt(
    config,
    { id: 'review-foundation', title: 'Foundation Review' },
    [{ description: 'Fix the review issue' }],
    1,
    3,
  );

  assert.ok(result.prompt.includes("`cd -- '-work dir/one; touch bad'\\''file'` before modifying any files."));
  assert.doesNotMatch(result.prompt, /`cd -work dir\/one; touch bad/);
});
