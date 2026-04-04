// prompts/forge.js — Forge prompt builder and FORGE.md reader

import fs from 'fs';
import path from 'path';
import { modulePath, statusPath, relPath, projectSrcPath } from '../core/paths.js';
import { log } from '../core/logger.js';
import { makePromptResult } from './shared.js';

export function readForgeInstructions(config, moduleDir, moduleConfig) {
  const modPath = modulePath(config, moduleDir);

  if (!moduleConfig.substeps) {
    const p = path.join(modPath, 'FORGE.md');
    if (!fs.existsSync(p)) throw new Error(`FORGE.md not found: ${p}`);
    return fs.readFileSync(p, 'utf8');
  }

  const parts = [];
  for (const stepId of moduleConfig.substeps) {
    const p = path.join(modPath, stepId, 'FORGE.md');
    if (fs.existsSync(p)) parts.push(fs.readFileSync(p, 'utf8'));
  }
  if (parts.length === 0) throw new Error(`No FORGE.md files found in ${moduleDir}`);
  return parts.join('\n\n---\n\n');
}

export async function buildForgePrompt(config, moduleId, mod, dir, status, maxFails, novaPrompt) {
  // ── Base instructions ──
  let baseInstructions;
  try { baseInstructions = readForgeInstructions(config, dir, mod); }
  catch (e) { return { error: e.message }; }

  const isRetry = status.status === 'FAIL' && status.fail_summaries.length > 0;
  const hasNova = !!novaPrompt;

  // ── Module context block ──
  // Factual orientation so Forge knows WHERE it's working, WHAT state things are in,
  // and WHICH attempt this is — without wasting tokens on `pwd`, `find .`, `git log`.
  const forgeCwd = config.agents?.forge?.cwd || config.repo_root;
  const contextBlock = [
    '## 🔧 MODULE CONTEXT',
    '',
    `**Project:** ${config.project}`,
    `**Module:** ${moduleId} — ${mod.title}`,
    `**Project Source:** \`${relPath(config, projectSrcPath(config))}\``,
    `**Module Path:** \`${relPath(config, modulePath(config, dir))}\``,
    `**Status JSON:** \`${relPath(config, statusPath(config, dir))}\``,
    `**Repo Root:** \`${config.repo_root}\``,
    `**Working Directory:** \`${forgeCwd}\``,
    `**Current Status:** ${status.status}`,
    `**Attempt:** ${status.fail_count + 1}/${maxFails}`,
    `**Stages:** ${(mod.stages || ['forge', 'buster']).join(' → ')}`,
    status.forge_commit_hash
      ? `**Last Forge Commit:** \`${status.forge_commit_hash.substring(0, 8)}\``
      : '',
    '',
    'All file paths in your instructions below are relative to **Project Source**.',
    `\`cd ${relPath(config, projectSrcPath(config))}\` before creating or modifying any files.`,
    '',
    '---',
    '',
  ].filter(Boolean).join('\n');

  // ── Anti-pattern block (retry only) ──
  // Frames previous failures as explicit ANTI-PATTERNS rather than vague "try something else".
  // This gives the agent concrete negative constraints alongside the positive instructions.
  let antiPatternBlock = '';
  if (isRetry) {
    const summaries = status.fail_summaries;
    const antiPatterns = summaries.map((f, i) => {
      const label = f.is_timeout ? 'TIMEOUT' : 'FAILED';
      let entry = `${i + 1}. [${label} in ${f.phase}] ${f.summary}`;
      if (f.files_changed) {
        entry += `\n   _Files changed:_ \`\`\`\n   ${f.files_changed.split('\n').join('\n   ')}\n   \`\`\``;
      }
      return entry;
    });

    antiPatternBlock = [
      '',
      '---',
      '',
      `## ⛔ ANTI-PATTERNS — Known Failed Approaches (Attempt ${status.fail_count + 1}/${maxFails})`,
      '',
      'The following approaches have been tried and FAILED. Do NOT repeat them.',
      'Each is a concrete anti-pattern — understand WHY it failed and avoid the root cause.',
      '',
      ...antiPatterns,
      '',
      'Your job: deliver a working implementation that avoids ALL of the above.',
      'If the same root cause keeps appearing, the architecture may need a different approach entirely.',
      '',
    ].join('\n');
  }

  // ── Nova directive ──
  let novaBlock = '';
  if (hasNova) {
    novaBlock = [
      '',
      '---',
      '',
      '## 🔴 NOVA DIRECTIVE (Highest Priority)',
      '',
      'Nova has analyzed the previous failures and determined a specific new approach.',
      'This directive OVERRIDES any conflicting guidance from other sections.',
      '',
      novaPrompt,
      '',
    ].join('\n');
    log('INFO', `Nova prompt override injected (${novaPrompt.length} chars)`);
  }

  // DEPRECATED: Memory recall via Qdrant/memory.js — disabled pending improvement
  // let memoryBlock = '';
  // let recalledMemoryIds = [];
  let memoryBlock = '';
  let recalledMemoryIds = [];

  // ── Priority header (only when multiple sections are present) ──
  let priorityHeader = '';
  if (isRetry || hasNova || memoryBlock) {
    const sections = [];
    if (hasNova)          sections.push('1. **NOVA DIRECTIVE** — highest authority, overrides everything');
    if (isRetry)          sections.push(`${hasNova ? '2' : '1'}. **ANTI-PATTERNS** — concrete constraints, must be avoided`);
    sections.push(`${sections.length + 1}. **FORGE.md** — base implementation instructions`);
    // DEPRECATED: memory recall disabled
    // if (memoryBlock)      sections.push(`${sections.length + 1}. **MEMORY CONTEXT** — supplementary, may be outdated or irrelevant`);

    priorityHeader = [
      '## 📋 INSTRUCTION PRIORITY (Read First)',
      '',
      'This prompt contains multiple sections. When they conflict, follow this priority:',
      '',
      ...sections,
      '',
      'When in doubt, higher-priority sections win.',
      '',
      '---',
      '',
    ].join('\n');
  }

  // ── Forge Completion Protocol ──
  const statusJsonPath = relPath(config, statusPath(config, dir));
  const completionBlock = [
    '',
    '---',
    '',
    '## 🚨 CRITICAL — YOUR FINAL STEPS (DO NOT SKIP)',
    '',
    'When your implementation is complete, you MUST do the following before your session ends:',
    '',
    `**Step 1:** Update \`${statusJsonPath}\` to signal readiness:`,
    '```bash',
    `cd ${config.repo_root}`,
    `cat ${statusJsonPath} | jq '.status = "READY_FOR_TESTING" | .current_phase = "forge"' > /tmp/status_update.json`,
    `mv /tmp/status_update.json ${statusJsonPath}`,
    '```',
    '',
    '**Step 2:** Commit and push ALL changes:',
    '```bash',
    'git add -A',
    'git commit -m "[forge] Module complete: <brief description>"',
    'git push origin',
    '```',
    '',
    'Both steps are mandatory. Without them, the pipeline cannot detect your work.',
    'Do NOT set status to "PASS" — only Buster can promote to PASS after testing.',
    'This must be the LAST thing you do.',
    '',
  ].join('\n');

  // ── Assemble final prompt ──
  // Order optimized for LLM attention patterns ("lost in the middle" effect):
  //   - Context block first (factual orientation — not an instruction, no priority conflict)
  //   - Priority header + Nova at the start (primacy bias → highest-priority items)
  //   - FORGE.md as baseline in the middle (bulk content, read as the "plan")
  //   - Anti-patterns near the end (recency bias → constraints stick better)
  //   - Memory last (lowest priority, recency compensated by priority header caveat)
  //   - Completion protocol at the very end (recency bias → final action sticks)
  // Note: Priority NUMBERING in the header is unchanged — it describes authority
  // hierarchy (Nova > Anti-Patterns > FORGE.md > Memory), not document order.
  const prompt = contextBlock + priorityHeader + novaBlock + baseInstructions + antiPatternBlock + memoryBlock + completionBlock;
  return makePromptResult(prompt, { phase: 'forge', moduleId, attempt: status.fail_count + 1, recalledMemoryIds });
}
