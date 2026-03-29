// prompts/gate-fix.js — Gate fix cycle prompt builder
// Extracted from pipeline-original.js (module 07)

import { relPath, projectSrcPath, swarmRoot } from '../core/paths.js';
import { makePromptResult } from './shared.js';

export function buildGateFixPrompt(config, gate, issues, attempt, maxAttempts, fixHistory = []) {
  // ── Context header — fresh Forge has no context window history ──
  const header = [
    `## Gate Fix: ${gate.title} (Attempt ${attempt}/${maxAttempts})`,
    '',
    `**Project:** ${config.project}`,
    `**Project Source:** \`${relPath(config, projectSrcPath(config))}\``,
    `**Working Directory:** \`${relPath(config, swarmRoot(config))}\``,
    `**Repo Root:** \`${config.repo_root}\``,
    '',
    'All code paths are relative to **Project Source**.',
    `\`cd ${relPath(config, projectSrcPath(config))}\` before modifying any files.`,
    '',
  ];

  // ── Anti-patterns from previous fix attempts ──
  if (fixHistory.length > 0) {
    header.push(
      '### ⛔ Previous Fix Attempts (Do NOT repeat these approaches)',
      '',
    );
    for (const prev of fixHistory) {
      if (!prev.hasChanges) {
        header.push(`${prev.attempt}. **Attempt ${prev.attempt}:** Forge crashed or produced no changes.`);
      } else {
        const issueList = prev.issues.map(i => i.title || i.description).join('; ');
        header.push(`${prev.attempt}. **Attempt ${prev.attempt}:** Applied changes but issues persisted: ${issueList}`);
      }
    }
    header.push('', 'Understand WHY these fixes failed and take a fundamentally different approach.', '');
  }

  const issueBlocks = issues.map((issue, i) => [
    `### Issue ${i + 1}: ${issue.title}${issue.severity ? ` [${issue.severity.toUpperCase()}]` : ''}`,
    issue.description ? `**Description:** ${issue.description}` : '',
    issue.reproduction ? `**Reproduction:** ${issue.reproduction}` : '',
    issue.affected_files?.length ? `**Affected Files:** ${issue.affected_files.join(', ')}` : '',
    '',
  ].filter(Boolean).join('\n'));

  const prompt = [
    ...header,
    `Buster found ${issues.length} issue(s) during testing. Fix ALL of the following:`,
    '',
    ...issueBlocks,
    '---',
    '',
    '## 🚨 CRITICAL — YOUR FINAL STEP (DO NOT SKIP)',
    '',
    'After fixing all issues above, you MUST commit and push your changes.',
    'This is how the pipeline knows you are done. If you do not do this, your work is lost.',
    '',
    '```bash',
    `cd ${config.repo_root}`,
    'git add -A',
    'git commit -m "[forge] Gate fix: <brief description of what you fixed>"',
    'git push origin',
    '```',
    '',
    'This must be the LAST thing you do before your session ends.',
    '',
  ].join('\n');

  return makePromptResult(prompt, { phase: 'gate-fix', moduleId: gate.id || '', attempt });
}
