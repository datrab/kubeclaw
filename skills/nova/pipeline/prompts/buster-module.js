// prompts/buster-module.js — Module test prompt builder

import path from 'path';
import { modulePath, statusPath, relPath, projectSrcPath } from '../core/paths.js';
import { makePromptResult, buildGitSyncSection, buildAvailableToolsSection, buildTestWorkspaceSection, buildBusterCompletionProtocol } from './shared.js';
import { readBusterInstructions } from './buster-instructions.js';

export function buildBusterModulePrompt(config, moduleId, mod, dir, status, maxFails) {
  // ── Read test spec ──
  let testInstructions;
  try { testInstructions = readBusterInstructions(config, dir); }
  catch (e) { return { error: e.message }; }

  const attempt = status.fail_count + 1;

  // ── Context Block ──
  const contextBlock = [
    '## 🔬 TEST CONTEXT',
    '',
    `**Project:** ${config.project}`,
    `**Module:** ${moduleId} — ${mod.title}`,
    `**Project Source:** \`${relPath(config, projectSrcPath(config))}\``,
    `**Module Path:** \`${relPath(config, modulePath(config, dir))}\``,
    `**Status JSON:** \`${relPath(config, statusPath(config, dir))}\``,
    `**Repo Root:** \`${config.repo_root}\``,
    `**Working Directory:** \`${relPath(config, projectSrcPath(config))}\``,
    `**Attempt:** ${attempt}/${maxFails}`,
    status.forge_commit_hash
      ? `**Commit:** \`${status.forge_commit_hash.substring(0, 8)}\``
      : '',
    '',
    'All file paths in the test instructions below are relative to **Project Source**.',
    `\`cd ${relPath(config, projectSrcPath(config))}\` before running any tests.`,
    '',
  ].filter(Boolean);

  if (status.forge_diff_stat) {
    contextBlock.push('**Files Changed by Forge:**', '```', status.forge_diff_stat, '```', '');
  }

  contextBlock.push('---', '');

  // ── Git Sync (Step 0) ──
  const gitSync = buildGitSyncSection(status.forge_commit_hash);

  // ── Available Tools ──
  const availableTools = buildAvailableToolsSection();

  // ── Test Workspace ──
  const testWorkspacePath = relPath(config, path.join(modulePath(config, dir), 'tests', `attempt-${attempt}`));
  const testWorkspace = buildTestWorkspaceSection(testWorkspacePath);

  // ── Test Instructions (BUSTER.md inline) ──
  const testSection = [
    '## Test Instructions',
    '',
    testInstructions,
    '',
    '---',
    '',
  ];

  // ── Completion Protocol ──
  const completionProtocol = buildBusterCompletionProtocol(config, moduleId, dir, status);

  const prompt = [...contextBlock, ...gitSync, ...availableTools, ...testWorkspace, ...testSection, ...completionProtocol].join('\n');
  return makePromptResult(prompt, { phase: 'buster', moduleId, attempt });
}
