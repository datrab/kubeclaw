import path from 'path';
import { discordEmbeds } from '../integrations/discord.ts';
import { formatSummaryForDiscord, summarizePayloadForDiscord } from '../egress.ts';

function fieldValue(value: any) {
  if (value === undefined || value === null || value === '') return null;
  return String(value);
}

function dispatchFields(payload: any = {}, extra: any[] = []) {
  const values = [
    ['Run ID', payload.run_id], ['Module', payload.module_id], ['Gate Type', payload.gate_type],
    ['Stage', payload.stage_id], ['Attempt', payload.attempt], ['Dispatch', payload.dispatch_id],
    ['Session', payload.session_key],
  ];
  const fields = values.flatMap(([name, value]) => {
    const normalized = fieldValue(value);
    return normalized ? [{ name, value: normalized, inline: true }] : [];
  });
  const gateId = fieldValue(payload.gate_id);
  if (gateId) {
    const title = fieldValue(payload.gate_title);
    fields.splice(2, 0, { name: 'Gate', value: title ? `${gateId} — ${title}` : gateId, inline: true });
  }
  return [...fields, ...extra];
}

function discordContext(payload: any = {}) {
  const pipelineLogPath = fieldValue(payload.pipeline_log_path);
  const runLogPath = fieldValue(payload.pipeline_run_log_path);
  const gateId = fieldValue(payload.gate_id);
  return {
    project: fieldValue(payload.project),
    runId: fieldValue(payload.run_id),
    moduleId: gateId ? null : fieldValue(payload.module_id),
    gateId,
    gateType: fieldValue(payload.gate_type),
    attempt: fieldValue(payload.attempt),
    dispatchId: fieldValue(payload.dispatch_id),
    sessionKey: fieldValue(payload.session_key),
    globalDiscordPath: pipelineLogPath ? path.join(path.dirname(pipelineLogPath), 'discord.jsonl') : null,
    runDiscordPath: runLogPath ? path.join(path.dirname(runLogPath), 'discord.jsonl') : null,
  };
}

export async function logRedisDispatchToDiscord(webhookUrl: unknown, sender: any, target: any, type: any, payload: any) {
  const summaryFields: any[] = [];
  if (payload && typeof payload === 'object') {
    if (payload.project) summaryFields.push({ name: 'Project', value: String(payload.project), inline: true });
    if (Array.isArray(payload.test_suites) && payload.test_suites.length) {
      summaryFields.push({ name: 'Suites', value: payload.test_suites.join(', '), inline: true });
    }
    if (target === 'buster' && type === 'module_test') {
      summaryFields.push({ name: 'Meaning', value: 'Queued for Buster only. This does not mean suites started or that a subagent exists yet.', inline: false });
    }
  }
  summaryFields.push({
    name: 'Payload',
    value: formatSummaryForDiscord(summarizePayloadForDiscord(payload, 'task_payload')),
    inline: false,
  });
  const context = discordContext(payload);
  await discordEmbeds({
    project: context.project,
    _runId: context.runId,
    run_id: context.runId,
    discord_webhook_url: webhookUrl,
    telemetry: { enabled: Boolean(context.runId) },
  }, [{
    title: `⚡ Task: ${sender} → ${target}`,
    color: 5763719,
    description: `**${sender}** → **${target}**\nType: \`${type}\`\n\nPayload shown with bounded formatting.`,
    fields: dispatchFields(payload, summaryFields),
  }], {
    level: 'INFO',
    correlation: {
      module_id: context.moduleId,
      gate_id: context.gateId,
      gate_type: context.gateType,
      attempt: context.attempt,
      dispatch_id: context.dispatchId,
      session_key: context.sessionKey,
    },
    auditTargets: [context.globalDiscordPath, context.runDiscordPath],
  });
}
