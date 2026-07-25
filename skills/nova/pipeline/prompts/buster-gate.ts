// prompts/buster-gate.ts — Gate test prompt builder and gate instructions reader

import fs from 'fs';
import path from 'path';
import { relPath, projectSrcPath, gateOutputPath, gateInstructionsPath, resolveSwarmArtifactPath } from '../core/paths.ts';
import { makePromptResult, quoteShellArg, buildGitSyncSection, buildAvailableToolsSection, buildTestWorkspaceSection, buildBusterGateCompletionProtocol } from './shared.ts';

export function readGateInstructions(config: any, gate: any) {
  const p = gateInstructionsPath(config, gate);
  if (!fs.existsSync(p)) throw new Error(`Gate instructions not found: ${p}`);
  return fs.readFileSync(p, 'utf8');
}

export function buildBusterGatePrompt(config: any, gateId: any, gate: any, instructions: any, commitHash: any, attempt: any = 1, completionIdentity: any = {}) {
  // ── Context Block ──
  const contextBlock = [
    '## 🔬 TEST CONTEXT',
    '',
    `**Project:** ${config.project}`,
    `**Gate:** ${gateId} — ${gate.title}`,
    `**Project Source:** \`${relPath(config, projectSrcPath(config))}\``,
    `**Repo Root:** \`${config.repo_root}\``,
    `**Working Directory:** \`${relPath(config, projectSrcPath(config))}\``,
    `**Attempt:** ${attempt}`,
    commitHash ? `**Commit:** \`${commitHash}\`` : '',
    '',
    'All file paths in the test instructions below are relative to **Project Source**.',
    `\`cd -- ${quoteShellArg(relPath(config, projectSrcPath(config)))}\` before running any tests.`,
    '',
    '---',
    '',
  ].filter(Boolean);

  // ── Git Sync (Step 0) ──
  const gitSync = buildGitSyncSection(commitHash);

  // ── Available Tools ──
  const availableTools = buildAvailableToolsSection();

  // ── Test Workspace ──
  const gateDir = gate.output_file ? path.dirname(gateOutputPath(config, gate)) : resolveSwarmArtifactPath(config, gateId, 'gate test workspace root');
  const testWorkspacePath = relPath(config, path.join(gateDir, 'tests', `attempt-${attempt}`));
  const testWorkspace = buildTestWorkspaceSection(testWorkspacePath);

  // ── Test Instructions (gate instructions inline) ──
  const testSection = [
    '## Test Instructions',
    '',
    instructions,
    '',
    '---',
    '',
  ];

  // ── Completion Protocol (gate variant) ──
  const completionProtocol = buildBusterGateCompletionProtocol(config, gateId, gate, completionIdentity);

  const prompt = [...contextBlock, ...gitSync, ...availableTools, ...testWorkspace, ...testSection, ...completionProtocol].join('\n');
  return makePromptResult(prompt, { phase: 'buster', moduleId: gateId, attempt });
}
