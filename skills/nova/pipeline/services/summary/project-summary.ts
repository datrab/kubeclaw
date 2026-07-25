import fs from 'fs';
import path from 'path';

import { log } from '../../core/logger.ts';
import { relPath } from '../../core/paths.ts';
import { discord, discordEmbeds } from '../../integrations/discord.ts';
import { sanitizeJsonEgress, sanitizeMarkdownText } from '../../egress.ts';
import { onSummaryStarted, onSummaryCompleted } from '../telemetry.ts';
import { buildGeneratorArtifactRef, buildGeneratorResult } from '../contracts/generator-result.ts';
import { resolveRegisteredProjectSummaryGenerator } from '../adapter-registry.ts';
import { getPipelineArtifactBundle } from '../artifact-bundle.ts';

import { selectDefinedValue, selectTruthyValue } from '../../optional-absence.ts';
type ProjectSummaryData = {
  output_dir: string;
  markdown_path?: string;
  data_path?: string;
  case_study_base_path?: string;
};

function buildProjectSummaryDiscordFields(identity: any = {}, extra: any = []) {
  return [...(identity.run_id ? [{ name: 'Run ID', value: identity.run_id, inline: true }] : []), ...extra];
}

function buildProjectSummaryArtifactFields(config: any, summaryData: any = {}) {
  return [
    { name: 'Output Dir', value: `\`${relPath(config, summaryData.output_dir)}\``, inline: false },
    ...(summaryData.markdown_path ? [{ name: 'Markdown', value: `\`${relPath(config, summaryData.markdown_path)}\``, inline: false }] : []),
    ...(summaryData.data_path ? [{ name: 'Data', value: `\`${relPath(config, summaryData.data_path)}\``, inline: false }] : []),
    ...(summaryData.case_study_base_path ? [{ name: 'Case Study Base', value: `\`${relPath(config, summaryData.case_study_base_path)}\``, inline: false }] : []),
  ];
}

async function loadProjectSummaryGenerator(config: any, opts: any = {}) {
  void opts;
  const { generateSummary, key } = resolveRegisteredProjectSummaryGenerator(config);
  log('DEBUG', `[summary] Project summary generator loaded from registry: ${key}`);
  return generateSummary;
}

export async function generateProjectSummary(config: any, opts: any = {}) {
  const artifacts = getPipelineArtifactBundle(config);
  if (!artifacts.pipeline_dir) return;
  const ctx = { config };
  const logDir = artifacts.pipeline_dir;
  const runId = artifacts.run_id;
  const summaryData: ProjectSummaryData = { output_dir: logDir };
  onSummaryStarted(ctx, 'project_summary', summaryData);
  try {
    const generateSummary = await loadProjectSummaryGenerator(config, opts);
    const summary = await generateSummary({ project: config.project });

    persistProjectSummary(logDir, summary, summaryData);
    log('OK', 'Project summary saved to logs');
    await publishProjectSummary(config, runId, summary, summaryData);
    onSummaryCompleted(ctx, 'project_summary', { status: 'ok', ...summaryData });
    return buildGeneratorResult('project_summary', {
      artifacts: [
        buildGeneratorArtifactRef('project_summary', summaryData.markdown_path, { role: 'output', format: 'markdown' }),
        buildGeneratorArtifactRef('project_summary', summaryData.data_path, { role: 'output', format: 'json' }),
        buildGeneratorArtifactRef('case_study_base', summaryData.case_study_base_path, { role: 'output', format: 'json' }),
      ],
      outputs: {
        status: 'ok',
        ...summaryData,
      },
    });
  } catch (e: any) {
    onSummaryCompleted(ctx, 'project_summary', { status: 'failed', reason: selectTruthyValue(() => (e.message), () => ('missing_error_message')), ...summaryData });
    log('WARN', `Project summary generation failed (non-critical): ${e.message}`);
    await discord(config, 'WARN', '📦 Project Summary Failed', `Project summary generation failed: ${selectTruthyValue(() => (e.message?.split('\n')[0]), () => ('missing_error_message'))}`,
      buildProjectSummaryDiscordFields({ run_id: runId }, buildProjectSummaryArtifactFields(config, summaryData))
    ).catch((discordError: any) => {
      log('DEBUG', `Project summary failure Discord notice failed: ${summaryErrorMessage(discordError)}`);
    });
    return buildGeneratorResult('project_summary', {
      artifacts: [
        buildGeneratorArtifactRef('project_summary', summaryData.markdown_path, { role: 'output', format: 'markdown' }),
        buildGeneratorArtifactRef('project_summary', summaryData.data_path, { role: 'output', format: 'json' }),
        buildGeneratorArtifactRef('case_study_base', summaryData.case_study_base_path, { role: 'output', format: 'json' }),
      ],
      outputs: {
        status: 'failed',
        reason: selectTruthyValue(() => (e.message), () => ('missing_error_message')),
        ...summaryData,
      },
    });
  }
}

function persistProjectSummary(logDir: string, summary: any, summaryData: ProjectSummaryData) {
  fs.mkdirSync(logDir, { recursive: true });
  if (summary.markdown) {
    summaryData.markdown_path = path.join(logDir, 'project-summary.md');
    fs.writeFileSync(summaryData.markdown_path, sanitizeMarkdownText(summary.markdown));
  }
  if (summary.data) {
    summaryData.data_path = path.join(logDir, 'project-summary.json');
    fs.writeFileSync(summaryData.data_path, JSON.stringify(sanitizeJsonEgress(summary.data, 'project_summary_data'), null, 2));
  }
  if (summary.caseStudyBase) {
    summaryData.case_study_base_path = path.join(logDir, 'case-study.base.json');
    fs.writeFileSync(summaryData.case_study_base_path, JSON.stringify(sanitizeJsonEgress(summary.caseStudyBase, 'case_study_base'), null, 2));
  }
}

async function publishProjectSummary(config: any, runId: any, summary: any, summaryData: ProjectSummaryData) {
  if (!config.discord_webhook_url) return;
  if (!summary.embeds?.length) return;
  const summaryEmbeds = summary.embeds.map((embed: any = {}) => ({
    ...embed,
    fields: buildProjectSummaryDiscordFields({ run_id: runId }, [
      ...(Array.isArray(embed.fields) ? embed.fields : []),
      ...buildProjectSummaryArtifactFields(config, summaryData),
    ]),
  }));
  try {
    await discordEmbeds(config, summaryEmbeds, { level: 'INFO' });
    log('OK', 'Project summary posted to Discord');
  } catch (error: any) {
    log('WARN', `Project summary Discord post failed (non-critical): ${summaryErrorMessage(error)}`);
  }
}

function summaryErrorMessage(error: any) {
  if (error?.message) return error.message;
  return String(error);
}
