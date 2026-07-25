import { log } from '../core/logger.ts';
import { sanitizeDiscordMessage } from '../egress.ts';
import { selectDefinedValue } from '../optional-absence.ts';
import { postDiscordWebhook } from './discord-webhook.ts';
import { normalizeOperatorEmbed } from './discord-operator.ts';
import { appendDiscordAuditEntries, appendDiscordDeliveryReceipt, discordWebhookDeliveryMuted, incrementDiscordNotificationStats, resolveInjectedDiscord } from './discord-audit.ts';
import { recordDiscordWebhookDegraded, recordDiscordWebhookMissing, recordDiscordWebhookRestored, reportDiscordIncident } from './discord-observability.ts';
import { arrayOrEmpty, assertDiscordPayloadWithinLimits, buildCanonicalDiscordPayload, discordReceiptWebhookUrl, discordStyle, discordWebhookTimeoutMs, emptyDiscordCorrelation, isPlainRecord, mergeDiscordCorrelation, normalizeDiscordCorrelation, normalizeDiscordLevel, optionalText, requiredText, requireSanitizedEmbeds } from './discord-values.ts';

function recordDiscordDeliveryStats(config: any, message: string, scope: string) {
  try {
    incrementDiscordNotificationStats(config);
  } catch (error: any) {
    reportDiscordIncident(config, 'stats_update_failed', message, error, {
      level: 'DEBUG',
      scope,
      includeErrorDetail: true,
    });
  }
}

// Discord embed limits: field name ≤ 256 chars, field value ≤ 1024 chars,
// description ≤ 4096 chars (keep under 500 for readability), title ≤ 256 chars.
// Use truncateForDiscord() from services/failures/presentation.ts when building field values.
export async function discord(config: any, level: any, title: any, description: any, fields: any[] = [], opts: any = {}) {
  try {
    const normalizedLevel = normalizeDiscordLevel(level);
    const runId = optionalText(selectDefinedValue(() => (config?._runId), () => (config?.run_id)));
    const normalizedEmbed = normalizeOperatorEmbed({ title, description, fields });
    const safeEmbed = requireSanitizedEmbeds(sanitizeDiscordMessage({
      embeds: [normalizedEmbed],
    }), 'discord.embed')[0];
    const correlation = mergeDiscordCorrelation(
      emptyDiscordCorrelation(),
      normalizeDiscordCorrelation(opts.correlation),
    );
    await appendDiscordAuditEntries(config, normalizedLevel, [{ ...safeEmbed, fields: arrayOrEmpty(safeEmbed.fields) }], { correlation });
    const injectedDiscord = resolveInjectedDiscord(opts, 'discord');
    if (typeof injectedDiscord === 'function') {
      await injectedDiscord(config, normalizedLevel, safeEmbed.title, safeEmbed.description, arrayOrEmpty(safeEmbed.fields), { correlation });
      return;
    }
    if (discordWebhookDeliveryMuted(config)) return;
    if (!config.discord_alerts?.[normalizedLevel.toLowerCase()]) return;
    if (!config.discord_webhook_url) {
      await recordDiscordWebhookMissing(config, correlation);
      return;
    }
    const style = discordStyle(normalizedLevel);
    const payload = buildCanonicalDiscordPayload({
        title: `${style.icon} ${safeEmbed.title}`,
        description: safeEmbed.description,
        color: style.color,
        fields: arrayOrEmpty(safeEmbed.fields).map((f: any) => ({ name: f.name, value: String(f.value), inline: selectDefinedValue(() => (f.inline), () => (true)) })),
        footer: { text: `KubeClaw Pipeline · ${config.project}${runId ? ` · ${runId}` : ''}` },
        timestamp: new Date().toISOString(),
      });
    try {
      const result = await postDiscordWebhook(discordReceiptWebhookUrl(config.discord_webhook_url), {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        timeoutMs: discordWebhookTimeoutMs(config),
      });
      appendDiscordDeliveryReceipt(config, normalizedLevel, correlation, result, arrayOrEmpty(payload.embeds));
      await recordDiscordWebhookRestored(config, correlation);
    } catch (err: any) {
      await recordDiscordWebhookDegraded(config, correlation, err);
      log('WARN', 'Discord webhook delivery failed (details suppressed for security)');
      return;
    }
    recordDiscordDeliveryStats(config, 'Discord delivery stats update failed', 'discord');
  } catch (error: any) {
    reportDiscordIncident(config, 'notification_wrapper_failed', 'Discord notification handling failed (details suppressed for security)', error, {
      scope: 'discord',
      level: 'WARN',
      includeErrorDetail: false,
    });
  }
}

export async function discordEmbeds(config: any, embeds: any[] = [], opts: any = {}) {
  try {
    const normalizedEmbeds = arrayOrEmpty(embeds);
    if (!normalizedEmbeds.length) return;
    const runId = optionalText(selectDefinedValue(() => (config?._runId), () => (config?.run_id)));
    const level = normalizeDiscordLevel(opts.level);
    const safeEmbeds = requireSanitizedEmbeds(sanitizeDiscordMessage({
      embeds: normalizedEmbeds.map((embed: any) => ({
        ...normalizeOperatorEmbed(embed),
        footer: isPlainRecord(embed?.footer)
          ? embed.footer
          : { text: `KubeClaw Pipeline · ${requiredText(config?.project, 'config.project')}${runId ? ` · ${runId}` : ''}` },
        timestamp: selectDefinedValue(() => (optionalText(embed?.timestamp)), () => (new Date().toISOString())),
      })),
    }), 'discord.embeds');
    const correlation = mergeDiscordCorrelation(
      emptyDiscordCorrelation(),
      normalizeDiscordCorrelation(opts.correlation),
    );
    await appendDiscordAuditEntries(config, level, safeEmbeds.map((safeEmbed: any) => ({
      ...safeEmbed,
      fields: arrayOrEmpty(safeEmbed.fields),
    })), { correlation, correlations: opts.correlations, auditTargets: opts.auditTargets });
    const injectedDiscordEmbeds = resolveInjectedDiscord(opts, 'discordEmbeds');
    if (typeof injectedDiscordEmbeds === 'function') {
      await injectedDiscordEmbeds(config, safeEmbeds, opts);
      return;
    }
    if (discordWebhookDeliveryMuted(config)) return;
    if (!config.discord_alerts?.[String(level).toLowerCase()]) return;
    if (!config?.discord_webhook_url) {
      await recordDiscordWebhookMissing(config, correlation);
      return;
    }
    try {
      assertDiscordPayloadWithinLimits({ embeds: safeEmbeds }, 'discord.embeds');
      const result = await postDiscordWebhook(discordReceiptWebhookUrl(config.discord_webhook_url), {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embeds: safeEmbeds }),
        timeoutMs: discordWebhookTimeoutMs(config),
      });
      appendDiscordDeliveryReceipt(config, level, correlation, result, safeEmbeds);
      await recordDiscordWebhookRestored(config, correlation);
    } catch (err: any) {
      await recordDiscordWebhookDegraded(config, correlation, err);
      log('WARN', 'Discord webhook delivery failed (details suppressed for security)');
      return;
    }
    recordDiscordDeliveryStats(config, 'Discord embed delivery stats update failed', 'discordEmbeds');
  } catch (error: any) {
    reportDiscordIncident(config, 'notification_wrapper_failed', 'Discord embed handling failed (details suppressed for security)', error, {
      scope: 'discordEmbeds',
      level: 'WARN',
      includeErrorDetail: false,
    });
  }
}
