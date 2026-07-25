import fs from 'fs';
import path from 'path';
import { parseCliArgs } from '../cli-args.ts';
import { discordEmbeds } from '../integrations/discord.ts';
import { sanitizeJsonEgress, sanitizeMarkdownText } from '../egress.ts';
import { validateAllowedPath } from '../security.ts';
import { discoverLatestRun } from '../run-discovery.ts';
import { buildCaseStudyBase, buildDiscordEmbeds, buildMarkdown } from './project-summary-formatters.ts';
import { readJsonData } from './project-summary-lifecycle.ts';
import { collectCodeStats, collectUnitTestCensus, collectApiTestCensus } from './project-summary-code.ts';
import { collectPipelineStats, collectTestResults, collectReviewStats } from './project-summary-pipeline.ts';
import { collectAgentInvocations } from './project-summary-agents.ts';
import { optionalEnvString, projectSummaryDiscordMuted, recordOrEmpty, resolveProjectPaths, resolveRepoDir, validateProjectSelector } from './project-summary-core.ts';
import { selectTruthyValue } from '../optional-absence.ts';

function log(message: any) { console.log(`[SUMMARY] ${sanitizeMarkdownText(message)}`); }
export function buildProjectSummaryDiscordFields(identity: any = {}, extra: any = []) {
  const fields: any[] = [];
  if (identity.runId) fields.push({ name: 'Run ID', value: identity.runId, inline: true });
  return [...fields, ...extra];
}

function projectSummaryArtifactDisplayPath(context: any, pathField: any, displayField: any) {
  const artifactPath = context[pathField];
  if (!artifactPath) return null;
  const displayPath = context[displayField];
  return selectTruthyValue(() => (displayPath), () => (artifactPath));
}

export function buildProjectSummaryArtifactFields(context: any = {}) {
  const fields: any[] = [];
  const markdownPath = projectSummaryArtifactDisplayPath(context, 'outputFile', 'outputFileDisplay');
  const dataPath = projectSummaryArtifactDisplayPath(context, 'jsonOutputPath', 'jsonOutputPathDisplay');
  if (markdownPath) fields.push({ name: 'Markdown', value: `\`${markdownPath}\``, inline: false });
  if (dataPath) fields.push({ name: 'Data', value: `\`${dataPath}\``, inline: false });
  return fields;
}

function resolveDiscordContext(opts: any = {}) {
  const project = validateProjectSelector(optionText(opts.project, optionalEnvString('CURRENT_PROJECT')));
  const repoDir = resolveRepoDir(opts.repoDir);
  const configPath = opts.configPath ? opts.configPath : null;
  const { swarmRoot } = resolveProjectPaths(project, repoDir, configPath);
  const logDir = path.join(swarmRoot, 'logs');
  const latest = recordOrEmpty(discoverLatestRun(path.join(logDir, 'pipeline')));
  const runId = optionText(opts.runId, optionalEnvString('RUN_ID'), optionalEnvString('PIPELINE_RUN_ID'), latest.run_id);
  const runLogDir = runId ? path.join(logDir, 'pipeline', 'runs', runId) : null;
  const outputFile = opts.outputFile ? path.resolve(opts.outputFile) : null;
  const jsonOutputPath = opts.jsonOutputPath ? path.resolve(opts.jsonOutputPath) : null;

  return {
    project,
    repoDir,
    configPath,
    logDir,
    runId,
    runLogDir,
    outputFile,
    jsonOutputPath,
    outputFileDisplay: outputFile ? path.relative(repoDir, outputFile) : null,
    jsonOutputPathDisplay: jsonOutputPath ? path.relative(repoDir, jsonOutputPath) : null,
  };
}

function optionText(...values: any[]): string | null {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return null;
}

export async function postToDiscord(embeds: any, opts: any = {}) {
  const url = opts.discordWebhookUrl !== undefined && opts.discordWebhookUrl !== null && String(opts.discordWebhookUrl).trim()
    ? opts.discordWebhookUrl
    : optionalEnvString('DISCORD_WEBHOOK');
  if (!url) { log('DISCORD_WEBHOOK not set — skipping'); return false; }
  if (projectSummaryDiscordMuted(opts)) {
    log('Discord: summary webhook muted by runtime config');
    return false;
  }
  try {
    const context = resolveDiscordContext(opts);
    const config = {
      project: context.project,
      repo_root: context.repoDir,
      _runId: context.runId,
      run_id: context.runId,
      discord_webhook_url: url,
      _disable_discord_webhooks: false,
      telemetry: { enabled: Boolean(context.runId) },
    };
    const summaryEmbeds = (Array.isArray(embeds) ? embeds : []).map((embed: any = {}) => ({
      ...embed,
      fields: buildProjectSummaryDiscordFields({ runId: context.runId }, [
        ...(Array.isArray(embed.fields) ? embed.fields : []),
        ...buildProjectSummaryArtifactFields(context),
      ]),
    }));
    await discordEmbeds(config, summaryEmbeds, { level: 'INFO', auditTargets: [path.join(context.logDir, 'pipeline', 'discord.jsonl'), context.runLogDir ? path.join(context.runLogDir, 'discord.jsonl') : null] });
    log('Discord: summary dispatched via pipeline integration');
    return true;
  } catch (e: any) {
    log(`Discord post failed: ${e.message}`);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════

export async function generateSummary(opts: any = {}) {
  const project    = opts.project !== undefined && opts.project !== null && String(opts.project).trim()
    ? opts.project
    : optionalEnvString('CURRENT_PROJECT');
  const repoDir    = validateAllowedPath(resolveRepoDir(opts.repoDir), 'project-summary.repoDir');
  const configPath = opts.configPath
    ? validateAllowedPath(opts.configPath, 'project-summary.configPath')
    : null;
  const diagnostics: any[] = [];

  if (!project) throw new Error('No project specified (--project or CURRENT_PROJECT env)');
  if (!fs.existsSync(repoDir)) throw new Error(`Repo dir not found: ${repoDir}`);

  log(`Generating summary for: ${project}`);
  const { projectRoot, swarmRoot, progressPath } = resolveProjectPaths(project, repoDir, configPath);
  if (!fs.existsSync(progressPath)) throw new Error(`progress.json not found: ${progressPath}`);
  const progress = readJsonData(progressPath, diagnostics, { optional: false });
  if (!progress) throw new Error('Failed to parse progress.json');

  log('Collecting code stats...');
  const code = collectCodeStats(repoDir, projectRoot, diagnostics);

  log('Collecting unit test census...');
  const unitCensus = collectUnitTestCensus(projectRoot);

  log('Collecting API test specs...');
  const apiCensus = collectApiTestCensus(swarmRoot, diagnostics);

  log('Collecting pipeline stats...');
  const pipeline = collectPipelineStats(progress, swarmRoot, diagnostics);

  log('Collecting test suite results...');
  const tests = collectTestResults(swarmRoot, recordOrEmpty(progress.modules), diagnostics);

  log('Collecting review stats...');
  const reviews = collectReviewStats(swarmRoot, diagnostics);

  log('Collecting agent invocations...');
  const agents = collectAgentInvocations(swarmRoot, diagnostics);

  const safeProject = sanitizeMarkdownText(project);
  const safeCode = sanitizeJsonEgress(code, 'project_summary_code');
  const safeUnitCensus = sanitizeJsonEgress(unitCensus, 'project_summary_unit_census');
  const safeApiCensus = sanitizeJsonEgress(apiCensus, 'project_summary_api_census');
  const safePipeline = sanitizeJsonEgress(pipeline, 'project_summary_pipeline');
  const safeTests = sanitizeJsonEgress(tests, 'project_summary_tests');
  const safeReviews = sanitizeJsonEgress(reviews, 'project_summary_reviews');
  const safeAgents = sanitizeJsonEgress(agents, 'project_summary_agents');
  const safeDiagnostics = sanitizeJsonEgress(diagnostics, 'project_summary_diagnostics');

  const formatterInput = { project: safeProject, code: safeCode, pipeline: safePipeline, tests: safeTests, unitCensus: safeUnitCensus, apiCensus: safeApiCensus, reviews: safeReviews, agents: safeAgents };
  const markdown = sanitizeMarkdownText(buildMarkdown(formatterInput));
  const embeds = sanitizeJsonEgress(buildDiscordEmbeds(formatterInput), 'project_summary_embeds');
  const caseStudyBase = sanitizeJsonEgress(buildCaseStudyBase(formatterInput), 'case_study_base');

  log('Summary complete.');
  return {
    summaryType: 'project_summary',
    project: safeProject, markdown, embeds, caseStudyBase,
    data: { code: safeCode, unitCensus: safeUnitCensus, apiCensus: safeApiCensus, pipeline: safePipeline, tests: safeTests, reviews: safeReviews, agents: safeAgents, diagnostics: safeDiagnostics },
  };
}

// ═══════════════════════════════════════════════════════════════
// CLI
// ═══════════════════════════════════════════════════════════════

export async function main(args: any = process.argv.slice(2)) {
  const { values: flags } = parseCliArgs(args, {
    flags: {
      project: { type: 'string' },
      output: { type: 'string' },
      repo: { type: 'string' },
      discord: { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
    },
  });

  const project = optionText(flags.project, optionalEnvString('CURRENT_PROJECT'));
  const output = optionText(flags.output);
  const repoDir = optionText(flags.repo);

  if (!project) { console.error('Usage: node project-summary.ts --project <n> [--discord] [--output <file>] [--json] [--repo <path>]'); process.exit(2); }

  const result = await generateSummary({ project, ...(repoDir ? { repoDir } : {}) });
  writeSummaryOutput(result, flags.json === true, output);
  if (flags.discord) {
    await postToDiscord(result.embeds, {
      project,
      repoDir,
      outputFile: flags.json ? null : output,
      jsonOutputPath: flags.json ? output : null,
    });
  }
}

function writeSummaryOutput(result: any, json: boolean, output: string | null): void {
  const rendered = json
    ? JSON.stringify(sanitizeJsonEgress(result.data, 'project_summary_cli_json'), null, 2)
    : sanitizeMarkdownText(result.markdown);
  if (!output) {
    console.log(rendered);
    return;
  }
  fs.writeFileSync(output, rendered);
  log(`${json ? 'JSON' : 'Report'}: ${output}`);
}
