// prompts/gate-fix.ts — Gate fix cycle prompt builder

import { relPath, projectSrcPath, swarmRoot } from '../core/paths.ts';
import { makePromptResult, quoteShellArg } from './shared.ts';

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
    `\`cd -- ${quoteShellArg(relPath(config, projectSrcPath(config)))}\` before modifying any files.`,
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
    'Allowed action contract:',
    '- Modify only the project files required to fix the listed Buster findings.',
    '- Do not write status files, completion files, gate output files, or Redis completion signals.',
    '- Do not create commits, push changes, or perform any finalization command; the pipeline owns git sync.',
    '- When fixes are complete, stop with a concise plain-text final response only.',
    '',
    'After fixing all issues above, stop.',
    '',
  ].join('\n');

  return makePromptResult(prompt, { phase: 'gate-fix', moduleId: gate.id || '', attempt });
}
