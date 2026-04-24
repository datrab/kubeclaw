// prompts/buster-gate.js — Gate test prompt builder and gate instructions reader

import fs from 'fs';
import path from 'path';
import { swarmRoot, relPath, projectSrcPath } from '../core/paths.js';
import { makePromptResult, buildGitSyncSection, buildAvailableToolsSection, buildTestWorkspaceSection, buildBusterGateCompletionProtocol } from './shared.js';

export function readGateInstructions(config, gate) {
  const p = path.join(swarmRoot(config), gate.instructions_file);
  if (!fs.existsSync(p)) throw new Error(`Gate instructions not found: ${p}`);
  return fs.readFileSync(p, 'utf8');
}

export function buildBusterGatePrompt(config, gateId, gate, instructions, commitHash, attempt = 1, completionIdentity = {}) {
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
    `\`cd ${relPath(config, projectSrcPath(config))}\` before running any tests.`,
    '',
    '---',
    '',
  ].filter(Boolean);

  // ── Git Sync (Step 0) ──
  const gitSync = buildGitSyncSection(commitHash);

  // ── Available Tools ──
  const availableTools = buildAvailableToolsSection();

  // ── Test Workspace ──
  const gateDir = gate.output_file ? path.dirname(gate.output_file) : gateId;
  const testWorkspacePath = relPath(config, path.join(swarmRoot(config), gateDir, 'tests', `attempt-${attempt}`));
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
