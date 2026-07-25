import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// prompts/buster-module.ts — Module test prompt builder

import { modulePath, relPath, projectSrcPath, moduleBusterOutputPathRef, moduleBusterTestWorkspacePathRef } from '../core/paths.ts';
import { makePromptResult, quoteShellArg, buildGitSyncSection, buildAvailableToolsSection, buildTestWorkspaceSection, buildBusterCompletionProtocol } from './shared.ts';
import { readBusterInstructions } from './buster-instructions.ts';

function summarizeForgeDiffStat(diffStat: any) {
  if (selectTruthyValue(() => (typeof diffStat !== 'string'), () => (!diffStat.trim()))) return null;
  const relevantLines = diffStat
    .split('\n')
    .map((line: any) => line.trimEnd())
    .filter((line: any) => line.trim())
    .filter((line: any) => !line.includes('/.swarm/'))
    .slice(0, 40);
  if (relevantLines.length === 0) return null;
  return relevantLines.join('\n');
}

export function buildBusterModulePrompt(config: any, moduleId: any, mod: any, dir: any, status: any, maxFails: any, completionIdentity: any = {}) {
  // ── Read test spec ──
  let testInstructions;
  try { testInstructions = readBusterInstructions(config, dir); }
  catch (e: any) { return { error: e.message }; }

  const attempt = status.fail_count + 1;

  // ── Context Block ──
  const contextBlock = [
    '## 🔬 TEST CONTEXT',
    '',
    `**Project:** ${config.project}`,
    `**Module:** ${moduleId} — ${mod.title}`,
    `**Project Source:** \`${relPath(config, projectSrcPath(config))}\``,
    `**Module Path:** \`${relPath(config, modulePath(config, dir))}\``,
    '**Pipeline Lifecycle State:** Nova/Buster owns lifecycle state; treat it as read-only pipeline context.',
    `**Output File:** \`${moduleBusterOutputPathRef(config, dir)}\``,
    `**Repo Root:** \`${config.repo_root}\``,
    `**Working Directory:** \`${relPath(config, projectSrcPath(config))}\``,
    `**Attempt:** ${attempt}/${maxFails}`,
    status.forge_commit_hash
      ? `**Commit:** \`${status.forge_commit_hash.substring(0, 8)}\``
      : '',
    '',
    'All file paths in the test instructions below are relative to **Project Source**.',
    `\`cd -- ${quoteShellArg(relPath(config, projectSrcPath(config)))}\` before running any tests.`,
    '',
  ].filter(Boolean);

  const forgeDiffStat = summarizeForgeDiffStat(status.forge_diff_stat);
  if (forgeDiffStat) {
    contextBlock.push('**Files Changed by Forge (application/control paths only):**', '```', forgeDiffStat, '```', '');
  }

  contextBlock.push('---', '');

  // ── Git Sync (Step 0) ──
  const gitSync = buildGitSyncSection(status.forge_commit_hash);

  // ── Available Tools ──
  const availableTools = buildAvailableToolsSection();

  // ── Test Workspace ──
  const testWorkspacePath = moduleBusterTestWorkspacePathRef(config, dir, attempt);
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
  const completionProtocol = buildBusterCompletionProtocol(config, moduleId, dir, status, completionIdentity);

  const prompt = [...contextBlock, ...gitSync, ...availableTools, ...testWorkspace, ...testSection, ...completionProtocol].join('\n');
  return makePromptResult(prompt, {
    phase: 'buster',
    stageId: 'worker:module_buster',
    workerType: 'module_buster',
    moduleId,
    attempt,
  });
}
