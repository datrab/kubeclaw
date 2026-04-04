import fs from 'fs';
import path from 'path';
import { log } from '../core/logger.js';
import { swarmRoot, relPath } from '../core/paths.js';
import { gatewayInvoke } from '../integrations/gateway.js';
import { trackAgent, untrackAgent, acpxCleanup } from '../agents/shutdown.js';
import { modelToHarness } from '../agents/lifecycle.js';
import { pollForFile } from './polling.js';
import { discord } from '../integrations/discord.js';
import { emitEvent } from './telemetry.js';

export function caseStudyOutputPath(config, cs = {}) {
  return path.join(swarmRoot(config), cs.output_file || 'logs/pipeline/case-study.md');
}

export function caseStudyInstructionsPath(config, cs = {}) {
  return path.join(swarmRoot(config), 'pipeline-review/CASE-STUDY-INSTRUCTIONS.md');
}

export function caseStudyDispatchMode(model) {
  const m = String(model || '').toLowerCase();
  if (m.startsWith('openai/') || m.startsWith('openai-codex/') || m.includes('gpt-5') || m.includes('codex')) return 'subagent';
  return 'acp';
}

export function caseStudyAgentId(model, cs = {}) {
  if (cs.agent_id) return cs.agent_id;
  const dispatch = caseStudyDispatchMode(model);
  if (dispatch === 'subagent') return `${String(model || 'gpt5').split('/').pop().replace(/[^a-zA-Z0-9._-]+/g, '-')}_case-study`;
  return modelToHarness(model) || 'claude';
}

export function writeCaseStudyInstructions(config, cs = {}) {
  const out = caseStudyOutputPath(config, cs);
  const pathOut = caseStudyInstructionsPath(config, cs);
  fs.mkdirSync(path.dirname(pathOut), { recursive: true });

  const logDir = config._logDir ? path.join(config._logDir, 'pipeline') : path.join(swarmRoot(config), 'logs/pipeline');
  const caseStudyBasePath = path.join(logDir, 'case-study.base.json');
  const projectSummaryPath = path.join(logDir, 'project-summary.json');
  const outputMdPath = relPath(config, out);

  const content = `You are writing a polished, publishable case study for the project: ${config.project}

## Input Data

Read the following pipeline artifacts to gather all project information:
- Case study base data: ${caseStudyBasePath}
- Project summary: ${projectSummaryPath}

Do NOT read source code files. Only use the pipeline artifacts listed above.

## Output

Write a single markdown file to: ${outputMdPath}

The case study must include ALL of the following sections:

### Overview
What was built, in one paragraph. Include the project name, its purpose, and the high-level outcome.

### Architecture
The tech stack, module breakdown, and key architectural decisions made during the project.

### Pipeline Execution
The execution timeline, key decisions made by the pipeline, and any retry patterns observed.

### Challenges & Solutions
Modules that required multiple attempts — what went wrong and how it was resolved. Be specific.

### Results
Final metrics including test coverage, code quality indicators, agent spawn counts, and total cost.

### Lessons Learned
What would be done differently in a future run of this project or similar projects.

## Requirements
- The output must be a standalone markdown document, publishable as-is on a website
- Use clear headings, bullet points where appropriate, and professional language
- Include specific data from the pipeline artifacts (module names, attempt counts, costs, etc.)
- Do NOT fabricate data — only report what is in the artifacts
- The document should read as a professional engineering case study, not a log dump
`;
  fs.writeFileSync(pathOut, content);
  return pathOut;
}

export async function generateCaseStudy(config, progress) {
  // progress.json case_study overrides config case_study
  const progressCs = progress?.case_study || {};
  const configCs = config.case_study || {};
  const cs = { ...configCs, ...progressCs };
  if (!cs.enabled) return;

  const ctx = { config };
  try {
    emitEvent(ctx, 'case_study.started', { project: config.project }).catch(() => {});

    const model = cs.model || config.models?.echo || 'anthropic/claude-sonnet-4-6';
    const dispatch = caseStudyDispatchMode(model);
    const agentId = caseStudyAgentId(model, cs);
    const instructionsPath = writeCaseStudyInstructions(config, cs);
    const instructions = fs.readFileSync(instructionsPath, 'utf8');
    const label = `case-study-${Date.now()}`;
    const cwd = config.repo_root;
    const thinking = cs.thinking_level || null;
    const spawnArgs = { task: instructions, agentId, label, model, cwd, thread: false, mode: 'run', cleanup: 'keep' };
    if (thinking) spawnArgs.thinking = thinking;
    if (dispatch === 'acp') {
      spawnArgs.runtime = 'acp';
      spawnArgs.streamTo = 'parent';
    }
    log('STEP', `Spawning case study agent (${dispatch}): ${agentId} / ${model}`);
    await discord(config, 'INFO', '📝 Case Study Agent Spawned', 'Generating publishable case study from pipeline data.', [
      { name: 'Model', value: model, inline: true },
      { name: 'Agent', value: agentId, inline: true },
      { name: 'Dispatch', value: dispatch, inline: true },
    ]).catch(() => {});

    const raw = await gatewayInvoke('sessions_spawn', spawnArgs, 30000);
    const result = raw?.result?.details || raw;
    if (result.status !== 'accepted') throw new Error(`Spawn not accepted: ${JSON.stringify(result)}`);
    const sessionKey = result.childSessionKey;
    const streamLogPath = result.streamLogPath || null;
    const trackingKey = `case-study-${agentId}`;
    trackAgent(config, trackingKey, sessionKey, agentId, label, streamLogPath);

    const outputFilePath = caseStudyOutputPath(config, cs);
    const timeoutMin = cs.timeout_minutes || 30;
    const pollRes = await pollForFile(config, outputFilePath, timeoutMin, 'Case Study', trackingKey);

    const archiveDir = path.join(swarmRoot(config), 'logs', 'case-study');
    fs.mkdirSync(archiveDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    if (dispatch === 'acp' && streamLogPath && fs.existsSync(streamLogPath)) {
      fs.copyFileSync(streamLogPath, path.join(archiveDir, `case-study-transcript-${ts}.jsonl`));
    }

    try { await gatewayInvoke('sessions_send', { sessionKey, message: '/stop' }, 15000); } catch {}
    if (dispatch === 'acp') await acpxCleanup(agentId, label);
    untrackAgent(trackingKey);

    if (!pollRes.ok) throw new Error(`Case study generation failed: ${pollRes.reason}`);

    emitEvent(ctx, 'case_study.completed', { project: config.project, output: outputFilePath }).catch(() => {});

    try {
      const caseStudyMd = fs.readFileSync(outputFilePath, 'utf8');
      const preview = caseStudyMd.slice(0, 500);
      await discord(config, 'OK', '📝 Case Study Complete', preview, [
        { name: 'Full Report', value: `\`${cs.output_file || 'logs/pipeline/case-study.md'}\``, inline: false },
      ]);
    } catch (e) {
      log('WARN', `Case study Discord post failed (non-critical): ${e.message}`);
    }
    log('OK', 'Case study generation completed');
  } catch (e) {
    log('WARN', `Case study generation failed (non-critical): ${e.message}`);
  }
}
