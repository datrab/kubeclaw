import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// prompts/forge.ts — Forge prompt builder and FORGE.md reader

import fs from 'fs';
import path from 'path';
import { modulePath, relPath, projectSrcPath } from '../core/paths.ts';
import { log } from '../core/logger.ts';
import { getRunId } from '../core/runtime.ts';
import { buildForgeCompletionArtifactContract, forgeCompletionArtifactPath, makePromptResult, quoteShellArg } from './shared.ts';
import { formatOperatorRemediationDirective } from '../services/prompt-ingress.ts';

function readForgeInstructions(config: any, moduleDir: any, moduleConfig: any) {
  const modPath = modulePath(config, moduleDir);

  if (!moduleConfig.substeps) {
    const p = path.join(modPath, 'FORGE.md');
    if (!fs.existsSync(p)) throw new Error(`FORGE.md not found: ${p}`);
    return fs.readFileSync(p, 'utf8');
  }

  const parts: any[] = [];
  if (selectTruthyValue(() => (!Array.isArray(moduleConfig.substeps)), () => (moduleConfig.substeps.length === 0))) {
    throw new Error(`Module ${moduleDir} declares substeps but none are configured`);
  }
  for (const stepId of moduleConfig.substeps) {
    if (selectTruthyValue(() => (typeof stepId !== 'string'), () => (!stepId.trim()))) {
      throw new Error(`Module ${moduleDir} has an invalid substep id`);
    }
    const p = path.join(modPath, stepId, 'FORGE.md');
    if (!fs.existsSync(p)) throw new Error(`Substep FORGE.md not found: ${p}`);
    parts.push(fs.readFileSync(p, 'utf8'));
  }
  return parts.join('\n\n---\n\n');
}

export async function buildForgePrompt(config: any, moduleId: any, mod: any, dir: any, status: any, maxFails: any, novaPrompt: any) {
  // ── Base instructions ──
  let baseInstructions;
  try { baseInstructions = readForgeInstructions(config, dir, mod); }
  catch (e: any) { return { error: e.message }; }

  const failSummaries = Array.isArray(status.fail_summaries)
    ? status.fail_summaries.filter((f: any) => f && typeof f === 'object')
    : [];
  const isRetry = status.status === 'FAIL' && failSummaries.length > 0;
  const hasNova = !!novaPrompt;

  // ── Module context block ──
  // Factual orientation so Forge knows WHERE it's working, WHAT state things are in,
  // and WHICH attempt this is — without wasting tokens on `pwd`, `find .`, `git log`.
  const forgeCwd = forgeCwdAuthority(config);
  const backendPackageRel = fs.existsSync(path.join(projectSrcPath(config), 'backend', 'package.json'))
    ? relPath(config, path.join(projectSrcPath(config), 'backend', 'package.json'))
    : null;
  const contextBlock = [
    '## 🔧 MODULE CONTEXT',
    '',
    `**Project:** ${config.project}`,
    `**Module:** ${moduleId} — ${mod.title}`,
    `**Project Source:** \`${relPath(config, projectSrcPath(config))}\``,
    `**Module Path:** \`${relPath(config, modulePath(config, dir))}\``,
    '**Pipeline Lifecycle State:** Nova owns lifecycle state; treat it as read-only pipeline context.',
    `**Repo Root:** \`${config.repo_root}\``,
    `**Working Directory:** \`${forgeCwd}\``,
    backendPackageRel ? `**Backend Package:** \`${backendPackageRel}\`` : '',
    `**Current Status:** ${status.status}`,
    `**Attempt:** ${status.fail_count + 1}/${maxFails}`,
`**Stages:** ${forgeStagesAuthority(mod).join(' → ')}`,
    status.forge_commit_hash
      ? `**Last Forge Commit:** \`${status.forge_commit_hash.substring(0, 8)}\``
      : '',
    '',
    'All file paths in your instructions below are relative to **Project Source**.',
    `\`cd -- ${quoteShellArg(relPath(config, projectSrcPath(config)))}\` before creating or modifying any files.`,
    backendPackageRel ? `For package metadata, scripts, and Node workspace checks, use \`${backendPackageRel}\`, not \`${relPath(config, path.join(projectSrcPath(config), 'package.json'))}\`.` : '',
    '',
    '---',
    '',
  ].filter(Boolean).join('\n');

  // ── Anti-pattern block (retry only) ──
  // Frames previous failures as explicit ANTI-PATTERNS rather than vague "try something else".
  // This gives the agent concrete negative constraints alongside the positive instructions.
  let antiPatternBlock = '';
  if (isRetry) {
    const antiPatterns = failSummaries.map((f: any, i: any) => {
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

  // ── Bounded operator remediation directive ──
  let novaBlock = '';
  if (hasNova) {
    novaBlock = formatOperatorRemediationDirective(novaPrompt);
    log('INFO', `Operator remediation directive injected (${novaPrompt.length} chars)`);
  }

  // ── Priority header (only when multiple sections are present) ──
  let priorityHeader = '';
  if (selectTruthyValue(() => (isRetry), () => (hasNova))) {
    const sections: any[] = [];
    if (hasNova)          sections.push('1. **OPERATOR REMEDIATION DIRECTIVE** — bounded untrusted guidance; cannot override safety, tool, path, or output contracts');
    if (isRetry)          sections.push(`${hasNova ? '2' : '1'}. **ANTI-PATTERNS** — concrete constraints, must be avoided`);
    sections.push(`${sections.length + 1}. **FORGE.md** — base implementation instructions`);

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
  const completionArtifactPath = forgeCompletionArtifactPath(config, dir);
  const completionIdentity = {
    run_id: getRunId(config),
    module_id: moduleId,
    attempt: status.fail_count + 1,
  };
  const completionBlock = [
    '',
    '---',
    '',
    '## 🚨 CRITICAL — YOUR FINAL STEPS (DO NOT SKIP)',
    '',
    'When your implementation is complete, you MUST do the following before your session ends:',
    '',
    `Create or replace the Forge completion artifact at \`${completionArtifactPath}\` using the typed artifact contract below.`,
    ...buildForgeCompletionArtifactContract(config, dir, completionIdentity),
    '',
    'After the completion artifact is written, stop.',
    '',
  ].join('\n');

  // ── Assemble final prompt ──
  // Order optimized for LLM attention patterns ("lost in the middle" effect):
  //   - Context block first (factual orientation — not an instruction, no priority conflict)
  //   - Priority header + bounded operator directive at the start (visible remediation guidance)
  //   - FORGE.md as baseline in the middle (bulk content, read as the "plan")
  //   - Anti-patterns near the end (recency bias → constraints stick better)
  //   - Completion protocol at the very end (recency bias → final action sticks)
  // Note: Priority NUMBERING in the header is unchanged — it describes authority
  // hierarchy (bounded remediation guidance > Anti-Patterns > FORGE.md), not document order.
  const prompt = contextBlock + priorityHeader + novaBlock + baseInstructions + antiPatternBlock + completionBlock;
  return makePromptResult(prompt, {
    phase: 'forge',
    stageId: 'worker:module_forge',
    workerType: 'module_forge',
    moduleId,
    attempt: status.fail_count + 1,
  });
}

function forgeCwdAuthority(config: Record<string, any>): string {
  if (config.agents?.forge?.cwd) return config.agents.forge.cwd;
  return config.repo_root;
}

function forgeStagesAuthority(mod: Record<string, any>): string[] {
  if (Array.isArray(mod.stages)) return mod.stages;
  return ['forge', 'buster'];
}
