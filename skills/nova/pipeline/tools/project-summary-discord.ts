import { formatDuration, formatNum, pct, DISPLAY_ABSENT, PASS_STATUSES, FAIL_STATUSES, reportRecord, reportArray, reportNumber, reportString, reportDisplay, displayList, passGateCount, failedGateCount, finalStatusLabel, blockedOutcomeLine, hasPassedAllGates, normalizeFormatterInput, pythonUnitFunctions, frontendUnitFunctions, pythonUnitFiles, frontendUnitFiles, apiSpecs, apiTotalCases, totalTestSurface, moduleFailCount, moduleDisplayName, groupDeliveredScope, languageRows } from './project-summary-formatters-core.ts';

// ── Discord Embeds ──────────────────────────────────────────────

const DISCORD_FIELD_VALUE_LIMIT = 1024;

function truncateDiscordFieldValue(value: any) {
  const s = reportDisplay(value);
  if (s.length <= DISCORD_FIELD_VALUE_LIMIT) return s;
  return s.slice(0, DISCORD_FIELD_VALUE_LIMIT - 1) + '…';
}
function withDiscordSafeFields(embed: any) {
  return {
    ...embed,
    fields: reportArray(embed.fields, 'discord.embed.fields').map((field: any) => ({
      ...field,
      value: truncateDiscordFieldValue(field.value),
    })),
  };
}


function prepareDiscord(input: any) {
  let { project, code, pipeline, tests, unitCensus, apiCensus, reviews, agents } = input;
  ({ code, pipeline, tests, unitCensus, apiCensus, reviews, agents } = normalizeFormatterInput(input));
  const gateStats = reportArray(pipeline.gateStats, 'pipeline.gateStats');
  const moduleStats = reportArray(pipeline.moduleStats, 'pipeline.moduleStats');
  const reviewCritical = reportNumber(reviews.totalCritical, 'reviews.totalCritical');
  const reviewDeferred = reportNumber(reviews.totalDeferred, 'reviews.totalDeferred');
  const langsText = Object.entries(reportRecord(code.byLang, 'code.byLang'))
    .filter(([l]: any) => !['JSON','Markdown','YAML','Other'].includes(l))
    .map(([l, v]: any) => [l, reportNumber(reportRecord(v, `code.byLang.${l}`).code, `code.byLang.${l}.code`)])
    .filter(([,v]: any) => v > 0)
    .sort((a: any, b: any) => b[1] - a[1]).slice(0, 5)
    .map(([l, n]: any) => `${l}: ${formatNum(n)}`).join(', ');
  const langs = langsText.length > 0 ? langsText : DISPLAY_ABSENT;

  const hardestText = reportArray(pipeline.hardestModules, 'pipeline.hardestModules').slice(0, 3)
    .map((m: any) => `${m.id}. ${m.title} (${moduleFailCount(m)} fails)`)
    .join('\n');
  const hardest = hardestText.length > 0 ? hardestText : 'All passed first try!';

  const gateText = gateStats
    .map((g: any) => `${PASS_STATUSES.has(g.status) ? 'PASS' : FAIL_STATUSES.has(g.status) ? 'FAIL' : 'PENDING'} ${g.title}`)
    .join('\n');
  const gateStr = gateText.length > 0 ? gateText : DISPLAY_ABSENT;

  const totalTests = totalTestSurface(unitCensus, apiCensus);
  const pythonTests = pythonUnitFunctions(unitCensus);
  const frontendTests = frontendUnitFunctions(unitCensus);
  const passedGates = passGateCount(gateStats);
  const scope = groupDeliveredScope(moduleStats.filter((m: any) => m.status === 'PASS'));
  const scopeSummaryText = [
    ...reportArray(scope.platform_backend, 'scope.platform_backend').slice(0, 2),
    ...reportArray(scope.frontend_ui, 'scope.frontend_ui').slice(0, 2),
    ...reportArray(scope.delivery_ops, 'scope.delivery_ops').slice(0, 2),
  ].slice(0, 5).join('\n');
  const scopeSummary = scopeSummaryText.length > 0 ? scopeSummaryText : 'See project summary markdown';
  const quality = [
    `Modules: ${pipeline.totalCompleted}/${pipeline.moduleCount} passed`,
    `Gates: ${passedGates}/${pipeline.gateCount} passed`,
    `Reviews: ${reviewCritical} critical, ${reviewDeferred} deferred`,
    `Tests: ${totalTests} total surface`,
  ].join('\n');
  return { project, code, pipeline, tests, unitCensus, apiCensus, reviews, agents, gateStats, moduleStats, reviewCritical, reviewDeferred, langs, hardest, gateStr, totalTests, pythonTests, frontendTests, passedGates, scopeSummary, quality };
}

function buildOperational(ctx: any) {
  const { project, code, pipeline, tests, unitCensus, apiCensus, reviews, agents, reviewCritical, reviewDeferred, langs, hardest, gateStr, totalTests, pythonTests, frontendTests } = ctx;
  return {
    title: `📊 Project Summary: ${project}`,
    color: pipeline.totalBlocked > 0 ? 15548997 : pipeline.totalPending > 0 ? 16776960 : 5763719,
    fields: [
      { name: '📦 Modules', value: `${pipeline.totalCompleted}/${pipeline.moduleCount}`, inline: true },
      { name: '🎯 First-Pass', value: `${pipeline.firstPassRate}%`, inline: true },
      { name: '🔄 Attempts', value: `${pipeline.totalAttempts}`, inline: true },
      { name: '📝 Code Lines', value: formatNum(reportNumber(code.codeLines, 'code.codeLines') > 0 ? reportNumber(code.codeLines, 'code.codeLines') : reportNumber(code.totalLines, 'code.totalLines')), inline: true },
      { name: '📁 Code Files', value: `${code.codeFiles}`, inline: true },
      { name: '🔀 Commits', value: `${reportNumber(code.commitCount, 'code.commitCount')}`, inline: true },
      { name: '🧪 Tests Written', value: `${totalTests} (${pythonTests} py + ${frontendTests} tsx + ${apiTotalCases(apiCensus)} api)`, inline: false },
      { name: '🤖 Agent Spawns', value: `${agents.total} (${agents.forge} Forge, ${agents.buster} Buster, ${agents.echo} Echo)`, inline: false },
      { name: '🔤 Languages', value: langs, inline: false },
      { name: '🏔️ Hardest', value: hardest, inline: false },
      { name: '🚦 Gates', value: gateStr, inline: false },
      ...(pipeline.elapsedHours ? [{ name: '⏱️ Duration', value: `${pipeline.elapsedHours}h wall clock`, inline: true }] : []),
      ...(reviewCritical > 0 ? [{ name: '🔍 Review Issues', value: `${reviewCritical} critical, ${reviewDeferred} deferred`, inline: true }] : []),
    ],
    footer: { text: `KubeClaw • ${new Date().toISOString().split('T')[0]}` },
  };
}

function buildExecutive(ctx: any) {
  const { project, pipeline, agents, passedGates, scopeSummary, quality } = ctx;
  return {
    title: `🧾 Case Study Summary: ${project}`,
    color: (pipeline.totalCompleted === pipeline.moduleCount && passedGates === pipeline.gateCount) ? 5763719 : 16776960,
    fields: [
      { name: '✅ Final Status', value: (pipeline.totalCompleted === pipeline.moduleCount && passedGates === pipeline.gateCount) ? 'PASS / COMPLETE' : (reportNumber(pipeline.totalBlocked, 'pipeline.totalBlocked') > 0 ? 'BLOCKED' : 'INCOMPLETE'), inline: true },
      { name: '⏱️ Delivery', value: `${reportNumber(pipeline.elapsedHours, 'pipeline.elapsedHours') > 0 ? pipeline.elapsedHours : DISPLAY_ABSENT}h wall clock`, inline: true },
      { name: '🔄 Attempts', value: `${pipeline.totalAttempts}`, inline: true },
      { name: '📦 Scope', value: scopeSummary, inline: false },
      { name: '🧪 Quality Outcome', value: quality, inline: false },
      { name: '🤖 Agent Spawns', value: `${agents.total} total (${agents.forge} Forge, ${agents.buster} Buster, ${agents.echo} Echo)`, inline: false },
    ],
    footer: { text: `KubeClaw • ${new Date().toISOString().split('T')[0]}` },
  };
}

export function buildDiscordEmbeds(input: any) {
  const context = prepareDiscord(input);
  return [buildOperational(context), buildExecutive(context)].map(withDiscordSafeFields);
}
