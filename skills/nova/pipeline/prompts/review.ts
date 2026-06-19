// prompts/review.ts — Reviewer prompt builder

import { relPath, projectSrcPath, swarmRoot } from '../core/paths.ts';
import { makePromptResult, quoteShellArg } from './shared.ts';

export function buildReviewFixPrompt(config, gate, issues, attempt, maxAttempts, fixHistory = []) {
  const header = [
    `## Review Fix: ${gate.title} (Attempt ${attempt}/${maxAttempts})`,
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

  if (fixHistory.length > 0) {
    header.push(
      '### ⛔ Previous Fix Attempts (Do NOT repeat these approaches)',
      '',
    );
    for (const prev of fixHistory) {
      if (!prev.hasChanges) {
        header.push(`${prev.attempt}. **Attempt ${prev.attempt}:** Forge crashed or produced no changes.`);
      } else {
        const issueList = prev.issues.map(i => i.description || i.title).join('; ');
        header.push(`${prev.attempt}. **Attempt ${prev.attempt}:** Applied changes but issues persisted: ${issueList}`);
      }
    }
    header.push('', 'Understand WHY these fixes failed and take a fundamentally different approach.', '');
  }

  const issueBlocks = issues.map((issue, i) => {
    const parts = [`### Issue ${i + 1}: ${issue.description}`];
    if (issue.module) parts.push(`**Module:** ${issue.module}`);
    if (issue.location) parts.push(`**Location:** ${issue.location}`);
    if (issue.recommended_fix) parts.push(`**Recommended Fix:** ${issue.recommended_fix}`);
    parts.push('');
    return parts.join('\n');
  });

  const prompt = [
    ...header,
    `Echo review found ${issues.length} critical issue(s). Fix ALL of the following:`,
    '',
    ...issueBlocks,
    '---',
    '',
    '## 🚨 CRITICAL — YOUR FINAL STEP (DO NOT SKIP)',
    '',
    'Allowed action contract:',
    '- Modify only the project files required to fix the listed review issues.',
    '- Do not write status files, completion files, gate output files, or Redis completion signals.',
    '- Do not create commits, push changes, or perform any finalization command; the pipeline owns git sync.',
    '- When fixes are complete, stop with a concise plain-text final response only.',
    '',
    'After fixing all issues above, stop.',
    '',
  ].join('\n');

  return makePromptResult(prompt, { phase: 'review-fix', moduleId: gate.id || '', attempt });
}

export function buildReviewerPrompt(config, gateId, gate, reviewer, instructions, lintBlock, relOutput) {
  const prompt = [
    '## Review Context',
    '',
    `**Project:** ${config.project}`,
    `**Project Source:** \`${relPath(config, projectSrcPath(config))}\``,
    `**Repo Root:** \`${config.repo_root}\``,
    `**Gate:** ${gateId} — ${gate.title}`,
    '',
    '---',
    '',
    instructions,
    '',
    '---',
    '',
    lintBlock,
    '## YOUR OUTPUT FILE',
    '',
    `You are reviewer: **${reviewer.label}** (model: ${reviewer.model})`,
    `Write your review JSON to: \`${relOutput}\``,
    '',
    'Your output file MUST contain raw, directly parseable JSON only. Do not wrap it in Markdown, do not use fenced code blocks, and do not write explanatory text outside the JSON object.',
    'The file content must be one JSON object with exactly this shape:',
    '{',
    '  "status": "PASS",',
    '  "critical_issues": [',
    '    {',
    '      "source": "tsc | eslint | architectural | ...",',
    '      "description": "what is wrong",',
    '      "affected_files": ["path/to/file.ts"],',
    '      "recommended_fix": "how to fix it"',
    '    }',
    '  ],',
    '  "deferred_issues": [],',
    '  "summary": "brief overall assessment"',
    '}',
    'Use `critical_issues: []` and `deferred_issues: []` when there are no issues in that category.',
    '',
    'Rules:',
    '- Status is PASS only if there are zero critical issues.',
    '- Architectural patterns that will propagate to downstream modules are ALWAYS critical, even if the current code works. Fix the pattern now while only 1-2 modules exist, not after 10+.',
    '- On early review gates (first half of the pipeline): prefer FAIL when in doubt. Foundation patterns are cheap to fix now, expensive to fix later.',
    '- Error response shapes, data model conventions, and API contract patterns that downstream modules will copy are critical by definition.',
    '- Lint findings that are errors (🔴) should be treated as critical unless they are false positives.',
    '- Lint warnings (🟡) should be deferred unless they indicate a real problem.',
    '- Add architectural issues the tools cannot detect (race conditions, security, design flaws).',
  ].join('\n');

  return makePromptResult(prompt, { phase: 'review', moduleId: gateId, attempt: 1 });
}
