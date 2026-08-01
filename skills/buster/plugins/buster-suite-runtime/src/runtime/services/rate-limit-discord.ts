import { sendDiscord } from './discord.js';
import { buildSessionRateLimitDiscordFields } from './discord-fields.js';
import { formatRateLimitEmbed } from './rate-limit-contract.js';

type LogFn = (label: string, message: string) => void;

export interface RateLimitDiscordNotice {
  moduleId: string;
  gateId: string | null;
  gateType: string | null;
  phase: string;
  provider: string;
  detail: string;
  cooldownMs: number;
  pauseCount: number;
  maxPauses: number;
  childSessionKey: string;
  project: string;
  runId: string | null;
  attempt: number | null;
  dispatchId: string | null;
  gatewayLabel: string | null;
  logDir: string | null;
  webhookUrl: string | null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || 'missing_error_detail');
}

export function sendRateLimitEmbed(notice: RateLimitDiscordNotice, log: LogFn): void {
  const embed = formatRateLimitEmbed({ detail: notice.detail }, notice.pauseCount, notice.maxPauses, notice.cooldownMs) as {
    title: string;
    description: string;
    fields: Record<string, unknown>[];
  };
  void Promise.resolve(sendDiscord({
    title: embed.title,
    description: embed.description,
    color: 16776960,
    fields: buildSessionRateLimitDiscordFields({
      run_id: notice.runId,
      module_id: notice.moduleId,
      gate_id: notice.gateId,
      gate_type: notice.gateType,
      phase: notice.phase,
      attempt: notice.attempt,
      dispatch_id: notice.dispatchId,
      gateway_label: notice.gatewayLabel,
      session_key: notice.childSessionKey,
    }, [{ name: 'Provider', value: notice.provider, inline: true }, ...embed.fields]),
    footer: { text: 'Buster Pipeline v2.0' },
    timestamp: new Date().toISOString(),
  }, {
    module_id: notice.moduleId,
    gate_id: notice.gateId,
    gate_type: notice.gateType,
    project: notice.project,
    run_id: notice.runId,
    attempt: notice.attempt,
    dispatch_id: notice.dispatchId,
    session_key: notice.childSessionKey,
    log_dir: notice.logDir,
    webhook_url: notice.webhookUrl,
  })).catch((error) => log('WARN', `Rate-limit Discord notice failed: ${errorMessage(error)}`));
}
