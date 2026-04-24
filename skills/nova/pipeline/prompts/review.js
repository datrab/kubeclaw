// prompts/review.js — Reviewer prompt builder

import { relPath, projectSrcPath } from '../core/paths.js';
import { makePromptResult } from './shared.js';

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
    'Your output MUST be valid JSON with this structure:',
    '```json',
    '{',
    '  "status": "GO" or "NO-GO",',
    '  "critical_issues": [',
    '    {',
    '      "source": "tsc | eslint | architectural | ...",',
    '      "description": "What is wrong",',
    '      "affected_files": ["path/to/file.ts"],',
    '      "recommended_fix": "How to fix it"',
    '    }',
    '  ],',
    '  "deferred_issues": [],',
    '  "summary": "Brief overall assessment"',
    '}',
    '```',
    '',
    'Rules:',
    '- Status is GO only if there are zero critical issues.',
    '- Architectural patterns that will propagate to downstream modules are ALWAYS critical, even if the current code works. Fix the pattern now while only 1-2 modules exist, not after 10+.',
    '- On early review gates (first half of the pipeline): prefer NO-GO when in doubt. Foundation patterns are cheap to fix now, expensive to fix later.',
    '- Error response shapes, data model conventions, and API contract patterns that downstream modules will copy are critical by definition.',
    '- Lint findings that are errors (🔴) should be treated as critical unless they are false positives.',
    '- Lint warnings (🟡) should be deferred unless they indicate a real problem.',
    '- Add architectural issues the tools cannot detect (race conditions, security, design flaws).',
  ].join('\n');

  return makePromptResult(prompt, { phase: 'review', moduleId: gateId, attempt: 1 });
}
